// server/routes/notes.js - Notes CRUD routes
const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// All notes routes are protected - user must be logged in
// The auth middleware adds req.user.id which we use to filter notes

// ============ GET ALL NOTES for logged-in user ============
// GET /api/notes
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notes WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get notes error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ============ CREATE A NOTE ============
// POST /api/notes
router.post('/', auth, async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required.' });
    }

    const result = await pool.query(
      'INSERT INTO notes (user_id, title, content) VALUES ($1, $2, $3) RETURNING *',
      [req.user.id, title, content || '']
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create note error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ============ UPDATE A NOTE ============
// PUT /api/notes/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { title, content } = req.body;
    const noteId = req.params.id;

    // Make sure the note belongs to this user
    const result = await pool.query(
      'UPDATE notes SET title = $1, content = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND user_id = $4 RETURNING *',
      [title, content || '', noteId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update note error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ============ DELETE A NOTE ============
// DELETE /api/notes/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const noteId = req.params.id;

    const result = await pool.query(
      'DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING *',
      [noteId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found.' });
    }

    res.json({ message: 'Note deleted successfully.' });
  } catch (err) {
    console.error('Delete note error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
