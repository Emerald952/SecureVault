const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// ============ CREATE SHARE ============
// POST /api/shares
router.post('/', auth, async(req, res) => {
    try{
        const {noteID, encryptedData, iv, expiresAt, passwordSalt, encryptedSharingKey, keyIV, ownerEncryptedKey, ownerKeyIV } = req.body;

        if(!noteID || !encryptedData || !iv || !expiresAt){
            return res.status(400).json({error: 'All fields are required'});
        }

        if (!ownerEncryptedKey || !ownerKeyIV) {
            return res.status(400).json({
                error: 'Encrypted sharing key recovery data is required'
            });
        }

        //Validate Expiry Date
        const expiry = new Date(expiresAt);

        if(Number.isNaN(expiry.getTime()) || expiry <= new Date()){
            return res.status(400).json({error: 'Expiry must be a future date'});
        }

        //Verify that the note belongs to this user
        const note = await pool.query(
            `SELECT id 
             FROM notes 
             WHERE id = $1 AND user_id = $2`,
            [noteID, req.user.id]
        );

        if(note.rows.length === 0){
            return res.status(404).json({error: 'Note not found'});
        }

        //Generate random 256-bit share token, identifier in share URL
        const shareToken = crypto.randomBytes(32).toString('hex');

        const result = await pool.query(
            `INSERT INTO 
                shared_notes(
                    note_id, 
                    owner_id, 
                    share_token, 
                    encrypted_data, 
                    iv, 
                    expires_at, 
                    password_salt, 
                    encrypted_sharing_key, 
                    key_iv,
                    owner_encrypted_key,
                    owner_key_iv
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
                RETURNING id, share_token, expires_at, created_at`,
            [noteID, req.user.id, shareToken, encryptedData, iv, expiry, passwordSalt, encryptedSharingKey, keyIV, ownerEncryptedKey, ownerKeyIV]
        );

        res.status(201).json(result.rows[0]);
    }catch(err){
        console.error('Create share error:', err.message);
        res.status(500).json({error: 'Server error'});
    }
});

// ============ LIST MY SHARE ============
// GET /api/shares/myNotes
router.get('/myNotes', auth, async(req, res) => {
    try{
        const result = await pool.query(
            `SELECT 
                s.id, 
                s.note_id, 
                s.share_token, 
                s.expires_at, 
                s.is_revoked, 
                s.created_at,
                COUNT(l.id)::INTEGER AS total_views,
                MAX(l.accessed_at) AS last_accessed
            FROM shared_notes s
            LEFT JOIN share_access_logs l
                ON s.id = l.share_id
            WHERE owner_id = $1 
            GROUP BY s.id
            ORDER BY created_at DESC`,
            [req.user.id]
        );

        res.json(result.rows);
    }catch(err){
        console.error('List shares error: ', err.message);
        res.status(500).json({error: 'Server error.' });
    }
});

// ============ RECOVER SHARE LINK ============
// GET /api/shares/:id/recovery
router.get('/:id/recovery', auth, async (req, res) => {
    try {
        const shareId = Number(req.params.id);

        if (!Number.isInteger(shareId) || shareId <= 0) {
            return res.status(400).json({ error: 'Invalid share ID' });
        }

        const result = await pool.query(
            `SELECT
                share_token,
                owner_encrypted_key,
                owner_key_iv,
                password_salt
             FROM shared_notes
             WHERE id = $1
                AND owner_id = $2
                AND is_revoked = FALSE
                AND expires_at > CURRENT_TIMESTAMP`,
            [shareId, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Share not found, expired or revoked'
            });
        }

        const share = result.rows[0];

        if (!share.owner_encrypted_key || !share.owner_key_iv) {
            return res.status(400).json({
                error: 'Recovery is unavailable for this share'
            });
        }
    
        res.json(share);
    }catch(err){
        console.error('Recover share error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ GET SHARED NOTE ============
// GET /api/shares/:token
router.get('/:token', async(req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                id,
                encrypted_data, 
                iv, 
                expires_at,
                password_salt,
                encrypted_sharing_key,
                key_iv 
            FROM shared_notes 
            WHERE 
                share_token = $1 AND 
                is_revoked = FALSE AND 
                expires_at > CURRENT_TIMESTAMP`,
            [req.params.token]
        );

        if(result.rows.length === 0){
            return res.status(400).json({error: 'Share link is invalid, expired or revoked'});
        }

        await pool.query(
            `INSERT INTO 
             share_access_logs (share_id)
             VALUES($1)`,
            [result.rows[0].id]
        );

        const { id, ...sharedNote } = result.rows[0];

        res.json(result.rows[0]);
    }catch(err){
        console.error('Get shared note error:', err.message);
        res.status(500).json({error: 'Server error'});
    }
});

// ============ REVOKE SHARE ============
// DELETE /api/shares/:id
router.delete('/:id', auth, async(req, res) => {
    try {
        const result = await pool.query(
            `UPDATE shared_notes 
             SET is_revoked = TRUE 
             WHERE id = $1 AND owner_id = $2
             RETURNING id`,
            [req.params.id, req.user.id]
        );

        if(result.rows.length === 0){
            return res.status(404).json({error: 'Share not found'});
        }

        res.json({message: 'Share revoked successfully'});
    }catch(err){
        console.error('Revoke share error: ', err.message);
        res.status(500).json({error: 'Server error' });
    }
});

module.exports = router;