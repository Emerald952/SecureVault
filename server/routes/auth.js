// server/routes/auth.js - Signup & Login routes
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
require('dotenv').config();

// ============ SIGNUP ============
// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 1. Check if all fields are provided
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    // 2. Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    // 3. Hash the password (never store plain text passwords!)
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // 4. Insert user into database
    const newUser = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, password_hash]
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

// ============ LOGIN ============
// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Check if fields are provided
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // 2. Find user by email
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0];

    // 3. Compare password with stored hash
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // 4. Create a JWT token (valid for 24 hours)
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
