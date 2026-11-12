// server/routes/auth.js - Signup & Login routes
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { loginLimiter, saltLimiter, signupLimiter} = require('../middleware/rateLimiters');
require('dotenv').config();

//Validate Base64 Values and their decoded byte lengths
function isValidBase64(value, expectedBytes){
  if(typeof value !== 'string')return false;

  const decoded = Buffer.from(value, 'base64');

  return (
    decoded.length === expectedBytes &&
    decoded.toString('base64') === value 
  );
}

// ============ SIGNUP ============
// POST /api/auth/signup
router.post('/signup', signupLimiter, async (req, res) => {
  try {
    const { name, email, vaultSalt, authToken } = req.body;

    //Check if all fields are provided
    if (typeof name !== 'string' || !name.trim() ||
        typeof email !== 'string' || !email.trim() ||
        typeof vaultSalt !== 'string' ||
        typeof authToken !== 'string') {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    //Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        error: 'Please provide a valid email address.'
      });
    }

    if (name.trim().length > 100 || email.trim().length > 254) {
      return res.status(400).json({
        error: 'Name or email is too long.'
      });
    }

    if(!isValidBase64(vaultSalt, 16) || !isValidBase64(authToken, 32)){
      return res.status(400).json({error: 'Invalid salt or password'});
    }

    const normalizedEmail = email.trim().toLowerCase();

    //Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    //Hash the authentication Token, not master password
    const authTokenHash = await bcrypt.hash(authToken, 12);

    //Insert user into database
    const newUser = await pool.query(
      'INSERT INTO users (name, email, vault_salt, auth_token_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, email',
      [name.trim(), normalizedEmail, vaultSalt, authTokenHash]
    );

    // 5. Send back success
    res.status(201).json({
      message: 'User registered successfully!',
      user: newUser.rows[0],
    });
  } catch (err) {
    console.error('Signup error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ============ GET SALT ============
// POST /api/auth/get-salt
router.post('/get-salt', saltLimiter, async(req, res) => {
  try{
    const {email} = req.body;

    if(typeof email !== 'string' || !email.trim()){
      return res.status(400).json({error: ' Valid Email required'});
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if ( normalizedEmail.length > 254 || !emailRegex.test(normalizedEmail)){
      return res.status(400).json({
        error: 'Invalid email format.'
      });
    }

    const result = await pool.query(
      `SELECT 
        vault_salt
       FROM users 
       WHERE email = $1`,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found.'});
    }

    res.json({
      vaultSalt: result.rows[0].vault_salt,
    });
  }catch (err){
    console.error('Get vault salt error: ', err.message);
    res.status(500).json({error: 'Server error.'});
  }
})


// ============ LOGIN ============
// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, authToken } = req.body;

    //Check if fields are provided
    if(typeof email !== 'string' || !email.trim() ||
      typeof authToken !== 'string' || !authToken) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if ( normalizedEmail.length > 254 || !emailRegex.test(normalizedEmail)){
      return res.status(400).json({
        error: 'Invalid email format.'
      });
    }

    if (!isValidBase64(authToken, 32)) {
      return res.status(400).json({
        error: 'Invalid authentication token.',
      });
    }

    //Find user by email
    const result = await pool.query(
      `SELECT 
        id,
        name,
        email,
        auth_token_hash
       FROM users 
       WHERE email = $1`,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    //Verify Derived authentication token
    const isMatch = await bcrypt.compare(authToken, user.auth_token_hash);

    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    //Create a JWT token (valid for 24 hours)
    const token = jwt.sign(
      { id: user.id, email: user.email }, //payload, tells the backend which user the token belongs to
      process.env.JWT_SECRET,             // secret key stored in .env, creates digital signature
      { expiresIn: '24h' }                // Validity
    );

    // 5. Send token + user info
    res.json({
      message: 'Login successful!',
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;