// server/middleware/auth.js - JWT Authentication Middleware
const jwt = require('jsonwebtoken');
require('dotenv').config();

// This middleware checks if the user sent a valid JWT token
// We attach it to routes that need login (like notes)
function auth(req, res, next) {
  // Token comes in the header like: "Bearer eyJhbG..."
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided. Please log in.' });
  }

  // Split "Bearer <token>" and grab just the token part
  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Invalid token format.' });
  }

  try {
    // Verify the token using our secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Attach user info to the request so routes can use it
    req.user = decoded; // { id: 1, email: 'user@example.com' }
    next(); // Continue to the actual route
  } catch (err) {
    return res.status(401).json({ error: 'Token is invalid or expired.' });
  }
}

module.exports = auth;
