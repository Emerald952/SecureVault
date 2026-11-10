import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { encryptData, decryptData} from '../utils/encryption';
import { useVault } from '../context/VaultContext';

function Dashboard() {
  const [notes, setNotes] = useState([]);        // Array of user's notes
  const [title, setTitle] = useState('');          // New/edit note title
  const [content, setContent] = useState('');      // New/edit note content
  const [editingId, setEditingId] = useState(null); // Which note is being edited (null = creating new)
  const [error, setError] = useState('');
  
  const { encryptionKey, setEncryptionKey } = useVault();

  const navigate = useNavigate();

  // Get user info from localStorage
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');

  // Helper: make API calls with the JWT token
  const apiCall = async (url, options = {}) => {
    const response = await fetch(`http://localhost:5000${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,  // Send JWT token with every request
        ...options.headers,
      },
    });
    return response;
  };

  // Fetch all notes when the page loads
  // useEffect with [] runs once when the component first appears
  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    try {
      const response = await apiCall('/api/notes');
      
      if (response.status === 401) {
        // Token expired or invalid -> log out
        handleLogout();
        return;
      }

      if(!response.ok){
        throw new Error('Failed to fetch notes');
      }

      const encryptedNotes = await response.json();

      //Decrypt every note in the browser
      const decryptedNotes = await Promise.all(
        encryptedNotes.map(async(note) => {
          const decryptedData = await decryptData(
            {
              ciphertext: note.encrypted_data,
              iv: note.iv,
            },
            encryptionKey
          );

          const noteData = JSON.parse(decryptedData);

          return {
            ...note,
            title: noteData.title,
            content: noteData.content,
          };
        })
      );

      setNotes(decryptedNotes);
    } catch (err) {
      console.error('Fetch notes error:', err);
      setError('Failed to load notes. Is the server running?');
    }
  };

  // Create or Update a note
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      //Combine title and content into one JSON string
      const noteData = JSON.stringify({
        title,
        content,
      });

      //Encrypt the JSON string in the browser | generate random 12-Byte iv, encrypt using AES-256-GCM, returns ciphertext and iv both base64 enc
      const encrypted = await encryptData(noteData, encryptionKey);

      const requestBody = {
        encrypted_data: encrypted.ciphertext,
        iv: encrypted.iv,
      };

      if (editingId) {
        // UPDATE existing note
        const response = await apiCall(`/api/notes/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(requestBody),
        });

        if(!response.ok){
          throw new Error('Failed to update notes');
        }
      } else {
        // CREATE new note
        const response = await apiCall('/api/notes', {
          method: 'POST',
          body: JSON.stringify(requestBody),
        });

        if(!response.ok){
          throw new Error('Failed to create notes');
        }
      }

      // Clear the form and refresh the notes list
      setTitle('');
      setContent('');
      setEditingId(null);

      await fetchNotes();
    } catch (err) {
      console.error('Save note error:', err);
      setError('Failed to save note.');
    }
  };

  // Load a note into the form for editing
  const handleEdit = (note) => {
    setTitle(note.title);
    setContent(note.content);
    setEditingId(note.id);
    // Scroll to top so user sees the form
    window.scrollTo(0, 0);
  };

  // Cancel editing clear the form
  const handleCancel = () => {
    setTitle('');
    setContent('');
    setEditingId(null);
  };

  // Delete a note
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return;

    try {
      await apiCall(`/api/notes/${id}`, { method: 'DELETE' });
      fetchNotes(); // Refresh the list
    } catch (err) {
      setError('Failed to delete note.');
    }
  };

  // Logout: clear localStorage and go to login page
  const handleLogout = () => {
    // Remove authentication details
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    // Clear the encryption key from memory
    setEncryptionKey(null);

    navigate('/login');
  };

  return (
    <div className="container mt-4">
      {/* Navbar */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3>SecureVault</h3>
        <div>
          <span className="me-3 text-muted">Welcome, {user.name || 'User'}</span>
          <button className="btn btn-outline-danger btn-sm" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Note Form: Create or Edit */}
      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <h5>{editingId ? 'Edit Note' : 'Add New Note'}</h5>
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <input
                type="text"
                className="form-control"
                placeholder="Note title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="mb-3">
              <textarea
                className="form-control"
                placeholder="Write your note here..."
                rows="3"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary me-2">
              {editingId ? 'Update Note' : 'Add Note'}
            </button>
            {editingId && (
              <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                Cancel
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Notes List */}
      <h5 className="mb-3">Your Notes ({notes.length})</h5>

      {notes.length === 0 ? (
        <div className="text-center text-muted py-5">
          <p>No notes yet. Create your first note above!</p>
        </div>
      ) : (
        <div className="row">
          {notes.map((note) => (
            <div key={note.id} className="col-md-6 col-lg-4 mb-3">
              <div className="card h-100 shadow-sm">
                <div className="card-body">
                  <h6 className="card-title">{note.title}</h6>
                  <p className="card-text text-muted" style={{ whiteSpace: 'pre-wrap' }}>
                    {note.content || '(No content)'}
                  </p>
                </div>
                <div className="card-footer bg-white d-flex justify-content-between align-items-center">
                  <small className="text-muted">
                    {new Date(note.updated_at).toLocaleDateString()}
                  </small>
                  <div>
                    <button
                      className="btn btn-outline-primary btn-sm me-1"
                      onClick={() => handleEdit(note)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-outline-danger btn-sm"
                      onClick={() => handleDelete(note.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
