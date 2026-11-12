// server/index.js - Main Express server entry point
const express = require('express');
const cors = require('cors');
require('dotenv').config();

if (
  !process.env.JWT_SECRET ||
  Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 32
) {
  throw new Error(
    'JWT_SECRET is missing or too weak. Use a random secret of at least 32 bytes.'
  );
}

const authRoutes = require('./routes/auth');
const notesRoutes = require('./routes/notes');
const sharesRoutes = require('./routes/share');

const app = express();
const PORT = process.env.PORT || 5000;

// ---- MIDDLEWARE ----
// cors() allows our React app (port 3000) to talk to this server (port 5000)
app.use(cors());
// express.json() parses incoming JSON request bodies
app.use(express.json());

// ---- ROUTES ----
app.use('/api/auth', authRoutes);   // /api/auth/signup, /api/auth/login
app.use('/api/notes', notesRoutes); // /api/notes (GET, POST, PUT, DELETE)
app.use('/api/shares', sharesRoutes);

// ---- TEST ROUTE ----
app.get('/', (req, res) => {
  res.json({ message: 'SecureVault API is running!' });
});

// ---- START SERVER ----
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
