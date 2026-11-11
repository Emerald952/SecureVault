//Argon2id is a password based key derivation function(KDF). It takes a password and salt and produces cruptographic key material. Makes pwd guessing expensive
import {argon2id} from 'hash-wasm';

//Generate a random salt for key derivation
export function generateSalt(){
    return crypto.getRandomValues(new Uint8Array(16));
}

//Derive an AES-256 key from the vailt master password
export async function deriveKeys(masterPassword, salt){
    const derivedBytes = await argon2id({
        password: masterPassword,
        salt: salt,
        parallelism: 1, //uses on processing lane
        iterations: 3, 
        memorySize: 65536, //use 64 MiB
        hashLength: 64, //produce 64 bytes
        outputType: 'binary',
    });

    //Import the derived bytes as HKDF key material
    //importKey() converts bytes into AES-GCM key used for encryption and decryption
    const hkdfKey = await crypto.subtle.importKey(
        'raw',
        derivedBytes,
        'HKDF',
        false,
        ['deriveKey', 'deriveBits']  //permitted operations
    );

    const enc = new TextEncoder();
    const hkdfParams = {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt,
    }

    //deriveKey() produces a non-extractable AES key
    const encryptionKey = await crypto.subtle.deriveKey(
        {
            ...hkdfParams,
            info: enc.encode("securevault-enc-v1"),
        },
        hkdfKey,
        {
            name:'AES-GCM',
            length: 256,
        },
        false, //makes imported key non-extractable, so JS cannot export its raw key bytes through Web Crypto.
        ['encrypt', 'decrypt']
    );

   //deriveBits() produces a 256-bit authentication token
    const authToken = await crypto.subtle.deriveBits(
        {
            ...hkdfParams,
            info: enc.encode("securevault-auth-v1"),
        },
        hkdfKey,
        256
    )

    return {
        encryptionKey,
        authToken: arrayBufferToBase64(authToken),
    };
}

//Generate a random 256-bit AES key
//AES-256 means a 256-bit key and GCM provides confidentiality and authentication(tampering detection)
export async function generateEncryptionKey(){
    //crypto is browser-provided JS obj. It exposes cryptographic functionality
    //crypto.subtle provides the cryptographic operations
    return await crypto.subtle.generateKey(
        {
            name: 'AES-GCM',
            length: 256,
        },
        true,  //extractable parameter, temporary for testing so key can be exported into raw key bytes
        ['encrypt', 'decrypt'] 
    );
}

//Encrypt data using AES-256-GCM
export async function encryptData(plaintext, key){
    //Generate a unique, random 960bit IV(intialization vector) | Not a secret
    const iv = crypto.getRandomValues(new Uint8Array(12));

    //Convert plaintenxt into bytes
    // TextEncoder converts string into UTF-8 bytes as encryption API works with binary data
    const encodedText = new TextEncoder().encode(plaintext);

    //Encrypt data
    //The browser performs AES-GCM encryption and returns an ArrayBuffer containing the ciphertext and authentication tag.
    const ciphertext = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv,
        },
        key,
        encodedText
    );

    //Converting then to Base64 as encryption result are binary data, whereas JSON works with strings.
    return {
        ciphertext: arrayBufferToBase64(ciphertext),
        iv: arrayBufferToBase64(iv)
    };
}

//Decrypt AES-256-GSM encrypted data
export async function decryptData(encryptData, key){
    const iv = base64ToArrayBuffer(encryptData.iv);
    const ciphertext = base64ToArrayBuffer(encryptData.ciphertext);

    const decrypted = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: iv,
        },
        key,
        ciphertext
    );

    //TextDecider converts decrypted bytes back to readable text.
    return new TextDecoder().decode(decrypted);
}

/*---HELPER FUNCTIONS--- (For Encoding Not Encryption*/

//Convert salt into base64 so we can store it in PostgreSQL
export function saltToBase64(salt){
    return arrayBufferToBase64(salt);
}

// Converting base64 to binary to retrieve from PostgreSQL
export function base64ToSalt(base64){
    return new Uint8Array(base64ToArrayBuffer(base64));
}

//Convert binary data to a storable string
function arrayBufferToBase64(buffer){
    const bytes  = new Uint8Array(buffer);
    let binary = '';

    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });

    return btoa(binary);
}

//Convert storable string to binary data
function base64ToArrayBuffer(base64){
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for(let i = 0; i < binary.length; i++){
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes.buffer;
}

// SHARING UTILITIES:

//Export a sharing key as Base64 so it can be placed in a URL fragment
export async function exportSharingKey(key){
    const rawKey = await crypto.subtle.exportKey('raw', key);
    return arrayBufferToBase64(rawKey);
}

//Import a sharing key received from a URL fragment
export async function importSharingKey(encodedKey){
    const rawKey = base64ToArrayBuffer(encodedKey);

    return await crypto.subtle.importKey(
        'raw',
        rawKey,
        {
            name: 'AES-GCM',
        },
        false,
        ['encrypt', 'decrypt']
    );
}

//Password Based encryption for sharing  
export async function deriveSharingPasswordKey(password, salt){
    const derivedBytes = await argon2id({
        password,
        salt,
        parallelism: 1,
        iterations: 3,
        memorySize: 65536,
        hashLength: 32,
        outputType: 'binary',
    });

    return await crypto.subtle.importKey(
        'raw',
        derivedBytes,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
    );
}