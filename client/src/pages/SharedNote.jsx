import React, {useEffect, useState, useRef }from 'react';
import { useParams } from 'react-router-dom';
import { decryptData, importSharingKey } from '../utils/encryption';

function SharedNote(){
    const { token } = useParams();
    const sharingKeyRef = useRef(
        window.location.hash.slice(1) ||
        sessionStorage.getItem(`share-key-${window.location.pathname.split('/').pop()}`)
    );
    const [note, setNote] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadSharedNote = async() => {
            try{
                //Read the sharing key from the URL fragment
                const encodedKey = sharingKeyRef.current;

                if(!encodedKey){
                    throw new Error('Sharing key is missing from the link');
                }

                //Survives page relods cleared when tab's session ends
                sessionStorage.setItem(`share-key-${token}`, encodedKey);

                //Remove the key from the visible URL after capturing it.
                window.history.replaceState(
                    null,
                    '',
                    window.location.pathname
                );

                const response = await fetch (
                    `http://localhost:5000/api/shares/${token}`
                );

                //Detch encrypted note from backend
                const data = await response.json();

                if(!response.ok){
                    throw new Error(data.error || 'Unable to access this note');
                }

                const sharingKey = await importSharingKey(encodedKey);

                //Decrypt note in the recipients's browser.
                const decrypted = await decryptData(
                    {
                        ciphertext: data.encrypted_data,
                        iv: data.iv,
                    },
                    sharingKey
                );

                const parsedNote = JSON.parse(decrypted);
                setNote(parsedNote);
            }catch(err){
                console.error('Shared note error', err);
                setError(err.message || 'Unable to open this shared note.');
            }finally{
                setLoading(false);
            }
        };

        loadSharedNote();
    }, [token])

    if(loading){
        return <p className="text-center mt-5">Opening Shared Note......</p>
    }

    if(error || !note){
        return (
            <div className='container mt-5'>
                <div className='alert alert-danger'>{error || 'No shared note data was received.' }</div>
            </div>
        );
    }

    return (
        <div className="container mt-5">
            <div className="card shadow-sm mx-auto" style={{ maxWidth: '700px' }}>
                <div className="card-body">
                    <h2 className="card-title">{note.title}</h2>
                    <hr />
                    <p style={{ whiteSpace: 'pre-wrap' }}>{note.content}</p>
                    <small className="text-muted">
                        Shared securely with SecureVault
                    </small>
                </div>
            </div>
        </div>
    );
}

export default SharedNote;