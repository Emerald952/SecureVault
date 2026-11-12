import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { encryptData, decryptData, generateEncryptionKey, exportSharingKey, deriveSharingPasswordKey, generateSalt, saltToBase64 } from '../utils/encryption';
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
  const [sharePassword, setSharePassword] = useState('');
  const [activeSection, setActiveSection] = useState('notes');
  const [showEditor, setShowEditor] = useState(false);

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
      setShowEditor(false);

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
    setShowEditor(true);
  };

  // Cancel editing clear the form
  const handleCancel = () => {
    setTitle('');
    setContent('');
    setEditingId(null);
    setShowEditor(false);
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

  //Sharing Note
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
      
      //Encrypt a recovery copy using the owner's vault key
      const ownerEncryptedKey = await encryptData(encodedKey, encryptionKey);

      let passwordSalt = null;
      let encryptedSharingKey = null;
      let keyIV = null;
      const password = sharePassword.trim();

      //Password Protected Note
      if(password.trim()){
        const salt = generateSalt();
        passwordSalt = saltToBase64(salt);

        const passwordKey = await deriveSharingPasswordKey(password, salt);

        const encryptedKeyData = await encryptData(encodedKey, passwordKey);

        encryptedSharingKey = encryptedKeyData.ciphertext;
        keyIV = encryptedKeyData.iv;
      }

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
          passwordSalt,
          encryptedSharingKey,
          keyIV,
          ownerEncryptedKey: ownerEncryptedKey.ciphertext,
          ownerKeyIV: ownerEncryptedKey.iv,
        }),
      });

      const data = await response.json();

      if(!response.ok){
        throw new Error(data.error || 'Could not create share');
      }

      await fetchShares();

      //Put sharing key in URL fragment
      const linkKey = password ? 'protected': encodedKey;

      const shareURL = `${window.location.origin}/share/${data.share_token}#${linkKey}`;

      //Copy the link
      await navigator.clipboard.writeText(shareURL);

      alert(`Share link copied! It expires in ${expiryHours} hours`);
    }catch(err){
      console.error("Share error", err);
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

  const handleCopyShare = async (share) => {
    try{
      const response = await apiCall(
        `/api/shares/${share.id}/recovery`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not recover share link');
      }

      // Decrypt the recovery key using the owner's vault key
      const encodedKey = await decryptData(
        {
          ciphertext: data.owner_encrypted_key,
          iv: data.owner_key_iv,
        },
        encryptionKey
      );

      // Protected shares use a marker instead of exposing the key
      const linkKey = data.password_salt
        ? 'protected'
        : encodedKey;

      const shareURL =
        `${window.location.origin}/share/${data.share_token}#${linkKey}`;

      await navigator.clipboard.writeText(shareURL);

      alert('Share link copied!');
    }catch(err) {
      console.error('Copy share error:', err);
      setError(err.message || 'Could not copy share link');
    }
  };

  return (
    <div>
      {/* Top Navbar */}
      <nav className="navbar bg-white border-bottom px-4 py-3">
        <h3 className="mb-2">SecureVault</h3>

        <span className="text-muted">
          Welcome! <strong>{user.name || 'User'}</strong>
        </span>
      </nav>

      {/* Main Layout */}
      <div className="d-flex" style={{ minHeight: '85vh' }}>

        {/* Sidebar */}
        <aside
          className="sidebar-nav mt-2 bg-white border-end p-3 d-flex flex-column"
          style={{ width: '230px', flexShrink: 0, position: 'fixed', top: '73px', bottom:0, left:0, zIndex: 100}}
        >
          <div className="d-flex flex-column gap-2">
            <button
              className={`btn text-start ${activeSection === 'notes' ? 'btn-primary' : 'btn-light'}`}
              onClick={() => setActiveSection('notes')}
              >
              <i className="bi bi-journal-text me-2"></i>
              Notes
            </button>

            <button
              className={`btn text-start ${activeSection === 'files' ? 'btn-primary' : 'btn-light'}`}
              onClick={() => setActiveSection('files')}
            >
              <i className="bi bi-folder2 me-2"></i>
              Files
            </button>
            <button
              className={`btn text-start ${activeSection === 'shared' ? 'btn-primary' : 'btn-light'}`}
              onClick={() => setActiveSection('shared')}
            >
              <i className="bi bi-share me-2"></i>
              Shared Links
            </button>
            <hr />
          </div>
          <button
            className="btn btn-outline-danger text-start mt-auto"
            onClick={handleLogout}
          >
            <i className="bi bi-box-arrow-right me-2"></i>
            Logout
          </button>
        </aside>
        {/* Main Content */}
        <main className="main-content flex-grow-1 p-4" style={{ marginLeft: '230px'}}>
          {error && <div className="alert alert-danger">{error}</div>}
          
          {activeSection === 'notes' && (
            <>
            {!showEditor && (
              <div>

                {/*Note List*/}
                <h4 className="mb-4">Your Notes ({notes.length})</h4>

                {notes.length === 0 ? (
                  <div className="text-center py-5">
                    <i className="bi bi-journal-plus text-muted" style={{ fontSize: '3rem' }}></i>
                    <h5 className="mt-3">No notes yet</h5>
                    <p className="text-muted">
                      Start by creating your first secure note.
                    </p>
                  </div>
                ) : (
                  <div className="border-top">
                    {notes.map((note) => (
                      <button
                        key={note.id}
                        type="button"
                        className="note-row w-100 d-flex justify-content-between align-items-center
                                  bg-white border-0 border-bottom px-3 py-3 text-start"
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleEdit(note)}
                      >
                        <div className="d-flex flex-column">
                          <strong>{note.title || 'Untitled Note'}</strong>
                          <small className="text-muted mt-1">
                            {note.content
                              ? note.content.slice(0, 100) + (note.content.length > 100 ? '...' : '')
                              : 'No content'}
                          </small>
                        </div>
                        
                        <small className="text-muted">
                          {new Date(note.updated_at).toLocaleDateString()}
                        </small>
                      </button>
                    ))}
                  </div>
                )}

                <button
                  className="btn btn-primary rounded-circle position-fixed"
                  style={{ bottom: '35px', right: '35px', width: '60px', height: '60px', fontSize: '28px' }}
                  onClick={() => {
                    handleCancel();
                    setShowEditor(true);
                  }}
                >
                  +
                </button>
              </div>
            )}

            {showEditor && (
              <>
              {/* Note Editor*/}
              <div>
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <button
                    className="btn btn-outline-secondary"
                    onClick={handleCancel}
                  >
                    <i className="bi bi-arrow-left me-2"></i>
                    Back to Notes
                  </button>

                  <div className="d-flex gap-2">
                    {editingId && (
                      <button
                        type="button"
                        className="btn btn-outline-danger"
                        onClick={async () => {
                          await handleDelete(editingId);
                          setTitle('');
                          setContent('');
                          setEditingId(null);
                          setShowEditor(false);
                        }}
                      >
                        <i className="bi bi-trash me-2"></i>
                        Delete
                      </button>
                    )}

                    {editingId && (
                      <button
                        type="button"
                        className="btn btn-outline-primary"
                        onClick={() => {
                          setSelectedNote({
                            id: editingId,
                            title,
                            content
                          });
                          setExpiryHours(24);
                          setSharePassword('');
                          setShowShareModal(true);
                        }}
                      >
                        <i className="bi bi-share me-2"></i>
                        Share
                      </button>
                    )}
                    
                    <button
                      type="submit"
                      form="note-form"
                      className="btn btn-success"
                    >
                      <i className="bi bi-save me-2"></i>
                      Save
                    </button>
                  </div>

                  
                </div>
                <div className="card shadow-sm rounded-3" style={{ minHeight: 'calc(100vh - 260px)' }}>
                  <div className="card-body">
                    <form id="note-form" onSubmit={handleSubmit}>
                      <div className="mb-3">
                        <input
                          type="text"
                          className="note-title form-control form-control-lg border-0 border-bottom rounded-0 shadow-none"
                          placeholder="Untitled Note"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          required
                        />
                      </div>
                      <div className="mb-3">
                        <textarea
                          className="note-content form-control border-0 shadow-none"
                          placeholder="Write your note here..."
                          rows="11"
                          style={{ minHeight: 'calc(100vh - 380px)', resize: 'none' }}
                          value={content}
                          onChange={(e) => setContent(e.target.value)}
                        />
                      </div>
                    </form>
                  </div>
                </div>
              </div>
              </>
            )}        
            </>
          )}

          {/* Files Section */}
          {activeSection === 'files' && (
            <div className="mt-2">
              <div className="d-flex justify-content-between align-items-center mb-4">
                <h4>My Files</h4>

                <button className="btn btn-primary btn-sm" disabled>
                  <i className="bi bi-upload me-2"></i>
                  Upload File
                </button>
              </div>

              <div className="text-center py-5">
                <i
                  className="bi bi-folder2-open text-muted"
                  style={{ fontSize: '3rem' }}
                ></i>

                <h5 className="mt-3">No files yet</h5>

                <p className="text-muted">
                  Your encrypted files will appear here.
                </p>
              </div>
            </div>
          )}

          {activeSection === 'shared' && (
            <>
            {/*View Shared Links*/}
            <div className='mt-2'>
              <div className="d-flex justify-content-between align-items-center mb-4">
                <h4 > Shared Links</h4>
                <button
                  className="btn btn-outline-primary btn-sm"
                  onClick={fetchShares}
                >
                  Refresh
                </button>
              </div>

              {shares.length === 0 ? (
                <div className="text-center py-5">
                    <i className="bi bi-journal-plus text-muted" style={{ fontSize: '3rem' }}></i>
                    <h5 className="mt-3">You haven't shared any notes yet</h5>
                  </div>
              ): (
                <div className="border-top">
                  {shares.map((share) => {
                    const isExpired = new Date(share.expires_at) <= new Date();
                    const isActive = !share.is_revoked && !isExpired;
                      
                    return (
                      <div key={share.id}
                       className='list-group-item d-flex justify-content-between align-items-center border-bottom py-2 px-3'
                      >
                        <div>
                          <p className='fw-semibold'>
                            {notes.find(note => note.id === share.note_id)?.title || 'Untitled Note'}
                          </p>

                          <div className='small text-muted mt-1'>
                            Expires: {new Date(share.expires_at).toLocaleString()}
                          </div>

                          <div className="small mt-1">
                            Status: {' '} 
                            <span className = {`badge ${
                              isActive 
                                ? 'bg-success'
                                : share.is_revoked
                                  ? 'bg-danger'
                                  : 'bg-secondary'
                            }`}>
                              {share.is_revoked 
                                ? 'Revoked' 
                                : isExpired 
                                  ? 'Expired' 
                                  : 'Active'
                              }
                            </span>
                          </div>
                    
                          <div className="small text-muted mt-1">
                            Views: {share.total_views} · Last accessed:{' '}
                            {share.last_accessed
                              ? new Date(share.last_accessed).toLocaleString()
                              : 'Never'}
                          </div>
                        </div>
                        {isActive && (
                          <div className="d-flex gap-2">
                            <button
                              className="btn btn-outline-primary btn-sm"
                              onClick={() => handleCopyShare(share)}
                            >
                              Copy Link
                            </button>

                            <button
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => handleRevoke(share.id)}
                            >
                              Revoke
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            </>
          )}

          {/*Share Modal*/}
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

                    <div className="mt-3">
                      <label className="form-label">Sharing password (optional)</label>
                      <input
                        type="password"
                        className="form-control"
                        placeholder="Enter a password"
                        value={sharePassword}
                        onChange={(e) => setSharePassword(e.target.value)}
                      />
                      <small className="text-muted">
                        Recipients will need this password to open the shared note.
                      </small>
                    </div>
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
                      onClick={() => {
                          handleShare(selectedNote),
                          setShowShareModal(false),
                          setSelectedNote(null),
                          setSharePassword('')
                        }
                      }
                    >
                      Create Share Link
                    </button>
                  </div>
                </div>
              </div> 
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default Dashboard;
