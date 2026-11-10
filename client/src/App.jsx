import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Signup from './pages/Signup.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';

import { VaultProvider, useVault } from './context/VaultContext.jsx';

// PrivateRoute: If user has a token, show the page. Otherwise redirect to login.
function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  const {encryptionKey} = useVault();

  return token && encryptionKey ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <VaultProvider>
      <Router>
        <Routes>
          {/* Public routes - anyone can access */}
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />

          {/* Protected route - must be logged in */}
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />

          {/* Any other URL → go to login */}
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </Router>
    </VaultProvider>
  );
}

export default App;
