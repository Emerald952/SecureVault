import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  generateSalt,
  saltToBase64,
  deriveKeys,
}from '../utils/encryption';

function Signup() {
  // useState creates variables that cause the page to re-render when they change
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // useNavigate lets us redirect the user programmatically
  const navigate = useNavigate();

  // This function runs when the form is submitted
  const handleSubmit = async (e) => {
    e.preventDefault(); // Prevent the browser from reloading the page
    setError('');
    setSuccess('');

    try {
      //Generate a unique random salt for this account
      const salt = generateSalt();

      //Derive the encryption key and authentication token
      const keys = await deriveKeys(password, salt);

      //Send only the salt and authentication token to the backend
      const response = await fetch('http://localhost:5000/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          email, 
          vaultSalt: saltToBase64(salt), 
          authToken: keys.authToken,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Signup failed.');
        return;
      }

      // Success! Show message and redirect to login after 1.5 seconds
      setSuccess('Account created! Redirecting to login...');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      console.error('Signup error:', err);
      setError('Cannot connect to server. Is the backend running?');
    }
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-5">
          <div className="card shadow">
            <div className="card-body p-4">
              <h2 className="text-center mb-4">SecureVault</h2>
              <h5 className="text-center mb-3 text-muted">Create Account</h5>

              {/* Conditionally show error or success alert */}
              {error && <div className="alert alert-danger">{error}</div>}
              {success && <div className="alert alert-success">{success}</div>}

              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    required
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">master Password</label>
                  <input
                    type="password"
                    className="form-control"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    required
                    minLength="6"
                  />
                  <small className="text-muted">
                    This password derives your encryption key. If you forget
                    it, your encrypted notes cannot be recovered.
                  </small>
                </div>

                <button type="submit" className="btn btn-primary w-100">
                  Sign Up
                </button>
              </form>

              <p className="text-center mt-3 mb-0">
                Already have an account? <Link to="/login">Log In</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Signup;
