import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { encryptData, decryptData, generateEncryptionKey, exportSharingKey, } from '../utils/encryption';
import { useVault } from '../context/VaultContext';

function Dashboard() {
  const [notes, setNotes] = useState([]);        // Array of user's notes
  const [title, setTitle] = useState('');          // New/edit note title
  const [content, setContent] = useState('');      // New/edit note content
  const [editingId, setEditingId] = useState(null); // Which note is being edited (null = creating new)
  const [error, setError] = useState('');
  const [shares, setShares] = useState([]);
  const [expiryHours, setExpiryHours] = useState(24);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState(null);

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
    fetchShares();
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

  //Fetch Shared Notes
  const fetchShares = async () => {
    try{
      const response = await apiCall('/api/shares/myNotes');
      const data = await response.json();

      if(!response.ok){
        throw new Error(data.error || 'Could not fetch shares');
      }

      setShares(data);
    }catch(err){
      console.error('Fetch shares error: ', err);
      setError(err.message);
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

  const handleShare = async(note) => {
    try{
      //Generate a separate random key for shared note
      const sharingKey = await generateEncryptionKey();

      //Prepare the decrypted note data
      const noteData = JSON.stringify({
        title: note.title,
        content: note.content,
      });

      //Encrypt the note using the separate sharing key
      const encrypted = await encryptData(noteData, sharingKey);

      //Export the sharing key for the URL fragment
      const encodedKey = await exportSharingKey(sharingKey);

      //Set link to expire after 24 hrs
      const expiresAt = new Date(
        Date.now() + expiryHours*60*60*1000
      ).toISOString();

      //Create the share on backend
      const response = await apiCall('/api/shares', {
        method: 'POST', 
        body: JSON.stringify({
          noteID: note.id,
          encryptedData: encrypted.ciphertext,
          iv: encrypted.iv,
          expiresAt,
        }),
      });

      const data = await response.json();

      if(!response.ok){
        throw new Error(data.error || 'Could not create share');
      }

      await fetchShares();

      //Put sharing key in URL fragment
      const shareURL = `${window.location.origin}/share/${data.share_token}#${encodedKey}`;

      //Copy the link
      await navigator.clipboard.writeText(shareURL);

      alert(`Share link copied! It expires in ${expiresHours} hours`);

      setShowShareModal(false);
      setSelectedNote(null);
    }catch(err){
      console.err("Share error", err);
      setError(err.message || 'Failed to create share link');
    }
  };

  const handleRevoke = async (shareID) => {
    try{
      const response = await apiCall(`/api/shares/${shareID}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if(!response.ok){
        throw new Error(data.error || 'Could not revoke share');
      }

      //Refresh the list after revoking
      fetchShares();
      alert('Share link revoked successfully!');
    }catch(err){
      console.error('Revoke share error: ', err);
      setError(err.message);
    }
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
                    <button
                      className="btn btn-outline-success btn-sm-me-1"
                      onClick={() => {
                        setSelectedNote(note);
                        setExpiryHours(24);
                        setShowShareModal(true);
                      }}
                    >
                      Share
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className='mt-5'>
        <h3>Shared Links</h3>

        {shares.length === 0 ? (
          <p className='text-muted'>You haven't shared any notes yet</p>
        ): (
          <div className='list-group'>
            {shares.map((share) => (
              <div key={share.id} className='list-group-item d-flex justify-content-between align-items-center'>
                <div>
                  <strong>Note #{share.note_id}</strong>
                  <br/>
                  <small className='text-muted'>
                    Expires: {new Date(share.expires_at).toLocaleString()}
                  </small>
                  <br />
                  <small>
                    Status: {share.is_revoked ? 'Revoked' : 'Active'}
                  </small>
              </div>

              {!share.is_revoked && (
                <button className='btn btn-outline-danger btn-sm' onClick={() => handleRevoke(share.id)}>
                    Revoke
                </button>
              )}
            </div>
            ))}
          </div>
        )}
      </div>

      {showShareModal && (
        <div className="modal d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Share Note</h5>
                  <button type="button" className="btn-close"
                    onClick={() => setShowShareModal(false)}
                  />
              </div>
              <div className="modal-body">
                <p>Choose how long this share link should remain active.</p>

                <label className="form-label">Link expiry</label>
                <select
                  className="form-select"
                  value={expiryHours}
                  onChange={(e) => setExpiryHours(Number(e.target.value))}
                >
                  <option value={1}>1 hour</option>
                  <option value={24}>24 hours</option>
                  <option value={168}>7 days</option>
                  <option value={720}>30 days</option>
                </select>
              </div>

              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowShareModal(false)}
                >
                  Cancel
                </button>

                <button
                  className="btn btn-success"
                  onClick={() => handleShare(selectedNote)}
                >
                  Create Share Link
                </button>
              </div>
            </div>
          </div> 
        </div>
      )}
    </div>
  );
}

export default Dashboard;
