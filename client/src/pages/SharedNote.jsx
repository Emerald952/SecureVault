import React, {useEffect, useState, useRef }from 'react';
import { useParams } from 'react-router-dom';
import { decryptData, importSharingKey, deriveSharingPasswordKey, base64ToSalt } from '../utils/encryption';

function SharedNote(){
    const { token } = useParams();
    const hasLoadedRef = useRef(false);
    const sharingKeyRef = useRef(
        window.location.hash.slice(1) ||
        sessionStorage.getItem(`share-key-${window.location.pathname.split('/').pop()}`)
    );
    const [note, setNote] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [sharedData, setSharedData] = useState(null);
    const [requiresPassword, setRequiresPassword] = useState(false);
    const [sharePassword, setSharePassword] = useState('');

    const handlePasswordSubmit = async(e) => {
        e.preventDefault();

        try{
            setError('');

            const password = sharePassword.trim();
            if(!password.trim()){
                setError('Please enter the sharing password');
                return;
            }

            const salt = base64ToSalt(sharedData.password_salt);

            const passwordKey = await deriveSharingPasswordKey(password, salt);

            //Recover the sharing key
            const encodedKey = await decryptData(
                {
                    ciphertext: sharedData.encrypted_sharing_key,
                    iv: sharedData.key_iv
                },
                passwordKey
            );

            const sharingKey = await importSharingKey(encodedKey);

            //Decrypt the shared note
            const decrypted = await decryptData(
                {
                    ciphertext: sharedData.encrypted_data,
                    iv: sharedData.iv,
                },
                sharingKey
            );
            
            setNote(JSON.parse(decrypted));
            setSharePassword('');
        }catch(err){
            console.error('Password verification error: ', err);
            setError('Incorrect password or unable to decrypt the shared note');
        }
    }

    useEffect(() => {
        //Prevent duplicates in StrictMode
        if(hasLoadedRef.current)return;

        hasLoadedRef.current = true;

        const loadSharedNote = async() => {
            try{
                //Read the sharing key from the URL fragment
                const fragment = sharingKeyRef.current;

                if(!fragment){
                    throw new Error('Sharing key is missing from the link');
                }

                //Preserve link fragment for page reloads in curr tab
                sessionStorage.setItem(`share-key-${token}`, fragment);

                //Remove the fragment from the URL
                window.history.replaceState(null, '', window.location.pathname);

                const response = await fetch (
                    `http://localhost:5000/api/shares/${token}`
                );

                //Detch encrypted note from backend
                const data = await response.json();

                if(!response.ok){
                    throw new Error(data.error || 'Unable to access this note');
                }

                setSharedData(data);

                if(data.password_salt){
                    if(fragment !== 'protected'){
                        throw new Error('Invalid sharing link.');
                    }

                    setRequiresPassword(true);
                }
                else {
                    if(fragment === 'protected'){
                        throw new Error('Invalid sharing link');
                    }

                    const sharingKey = await importSharingKey(fragment);

                    //Decrypt note in the recipients's browser.
                    const decrypted = await decryptData(
                        {
                            ciphertext: data.encrypted_data,
                            iv: data.iv,
                        },
                        sharingKey
                    );

                    setNote(JSON.parse(decrypted));
                }
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

    if(error){
        return (
            <div className='container mt-5'>
                <div className='alert alert-danger'>{error}</div>
            </div>
        );
    }

    if(requiresPassword && !note){
        return (
            <div className="container mt-5">
                <div className="card shadow-sm mx-auto" style={{ maxWidth: '450px' }}>
                    <div className="card-body">
                        <h4 className="card-title mb-3">Password Protected Note</h4>

                        <p className="text-muted">
                            This shared note requires a password to access.
                        </p>

                        {error && (
                            <div className="alert alert-danger">
                                {error}
                            </div>
                        )}
                        
                        <form onSubmit={handlePasswordSubmit}>
                            <label className="form-label">Sharing Password</label>

                            <input
                                type="password"
                                className="form-control mb-3"
                                value={sharePassword}
                                onChange={(e) => setSharePassword(e.target.value)}
                                placeholder="Enter sharing password"
                                required
                            />

                            <button type="submit" className="btn btn-primary w-100">
                                 Unlock Note
                            </button>
                        </form>
                    </div>
                </div>
            </div>

        )
    }

    if (!note) {
        return (
            <div className="container mt-5">
            <div className="alert alert-warning">
                Unable to load the shared note.
            </div>
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