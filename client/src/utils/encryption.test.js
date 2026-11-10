import {
    generateSalt,
    saltToBase64,
    base64ToSalt,
    deriveKeys,
    generateEncryptionKey,
    encryptData,
    decryptData,
} from './encryption';

async function testEncryption(){
    const key = await generateEncryptionKey();

    const originalText = 'First Secret';

    const encrypted = await encryptData(originalText, key);
    console.log('Encrypted Data: ', encrypted);

    const decrypted = await decryptData(encrypted, key);
    console.log('Encrypted Data: ', decrypted);

    console.log('Test Result: ', originalText === decrypted);
}

async function testKeyDerivation(){
    const salt = generateSalt();

    const encodedSalt = saltToBase64(salt);
    const decodedSalt = base64ToSalt(encodedSalt);

    console.log(
        'Salt convertion Result: ', 
        salt.every((byte, index) => byte === decodedSalt[index])
    );

    console.log("Deriving Key: ");

    const key1 = await deriveKey('@shkid09', decodedSalt);
    const key2 = await deriveKey('@shkid09', decodedSalt);

    const encrypted = await encryptData('SecureVault test!', key1);
    const decrypted = await decryptData(encrypted, key2);

    console.log('Same Password and Salt: ', decrypted === 'SecureVault test!');

    const differentSalt = generateSalt();
    const key3 = await deriveKey('@shkid09', differentSalt);

    try {
        await decryptData(encrypted, key3);
        console.log('Different salt test: FAILED');
    } catch {
        console.log('Different salt test: PASSED');
    }
}

async function testKeySeparation(){
    const salt = generateSalt();
    const password = '@shkid09';

    console.log("Deriving Keys....");

    const res1 = await deriveKeys(password, salt);
    const res2 = await deriveKeys(password, salt);

    console.log(
        'Same authentication token:',
        res1.authToken === res2.authToken
    );

    const encrypted = await encryptData(
        'SecureVault secret!',
        res1.encryptionKey
    );
    
    const decrypted = await decryptData(
        encrypted,
        res2.encryptionKey
      );
    
      console.log(
        'Same encryption key:',
        decrypted === 'SecureVault secret!'
      );
    
      // Test that different salts produce different keys
      const anotherSalt = generateSalt();
      const res3 = await deriveKeys(password, anotherSalt);
    
      console.log(
        'Different authentication token:',
        res1.authToken !== res3.authToken
      );
    
      try {
        await decryptData(encrypted, res3.encryptionKey);
        console.log('Different encryption key: FAILED');
      } catch {
        console.log('Different encryption key: PASSED');
      }

}


//testEncryption();
//testKeyDerivation();
testKeySeparation().catch(console.error);
