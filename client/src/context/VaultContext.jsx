import React, { createContext, useContext, useState } from 'react';

//Create shared place to hold encryption key
const VaultContext = createContext(null);

//Makes that shared state available to its child component
export function VaultProvider({ children }) {
    //vault starts locked no key available
    const [encryptionKey, setEncryptionKey] = useState(null);

    return (
        <VaultContext.Provider value={{ encryptionKey, setEncryptionKey }}>
        {children}
        </VaultContext.Provider>
    );
}

//let components access the key and its setter
export function useVault() {
    return useContext(VaultContext);
}