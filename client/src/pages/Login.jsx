import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import{
  base64ToSalt,
  deriveKeys
}from '../utils/encryption';

import { useVault } from '../context/VaultContext';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { setEncryptionKey } = useVault();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      //Request the user's salt using their email
      const saltResponse = await fetch('http://localhost:5000/api/auth/get-salt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const saltData = await saltResponse.json();

      if(!saltResponse.ok){
        setError(saltData.error || 'Account not found');
        return;
      }

      //Convert the base64 salt back into bytes
      const salt = base64ToSalt(saltData.vaultSalt);

      //Derive the encryption key and authentication token
      const keys = await deriveKeys(password, salt)

      //Send authentication token to bakend
      const response = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          authToken: keys.authToken
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Login failed.');
        return;
      }

      // Save the JWT token and user info in localStorage
      // localStorage persists even after closing the browser tab
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      //Keep the encryption key in react memory
      setEncryptionKey(keys.encryptionKey);

      // Go to dashboard
      navigate('/dashboard');
    } catch (err) {
      console.error('Login error:', err);
      setError('Cannot connect to server. Is the backend running?');
    }finally{
      setLoading(false);
    }
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-5">
          <div className="card shadow">
            <div className="card-body p-4">
              <h2 className="text-center mb-4">SecureVault</h2>
              <h5 className="text-center mb-3 text-muted">Log In</h5>

              {error && <div className="alert alert-danger">{error}</div>}

              <form onSubmit={handleSubmit}>
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
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    className="form-control"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary w-100" disabled={loading}> 
                  {loading ? 'Unlocking...' : 'Log In'}
                </button>
              </form>

              <p className="text-center mt-3 mb-0">
                Don't have an account? <Link to="/signup">Sign Up</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
