export function generateSalt(length = 16): string {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPin(pin: string, salt?: string): Promise<string> {
    const encoder = new TextEncoder();
    // Prepend salt if provided to ensure unique hashes even for identical PINs
    const data = encoder.encode(salt ? salt + pin : pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getKeyMaterial(password: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    return crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
    );
}

async function getKey(keyMaterial: CryptoKey, salt: ArrayBuffer): Promise<CryptoKey> {
    return crypto.subtle.deriveKey(
        {
            "name": "PBKDF2",
            salt,
            "iterations": 100000,
            "hash": "SHA-256"
        },
        keyMaterial,
        { "name": "AES-GCM", "length": 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

export async function encryptBuffer(data: BufferSource, password: string): Promise<ArrayBuffer> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const keyMaterial = await getKeyMaterial(password);
    const key = await getKey(keyMaterial, new Uint8Array(salt).buffer);

    const encrypted = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        data
    );

    // Combine: Salt (16) + IV (12) + Data
    const result = new Uint8Array(salt.byteLength + iv.byteLength + encrypted.byteLength);
    result.set(salt, 0);
    result.set(iv, salt.byteLength);
    result.set(new Uint8Array(encrypted), salt.byteLength + iv.byteLength);

    return result.buffer;
}

export async function decryptBuffer(data: BufferSource, password: string): Promise<ArrayBuffer> {
    const view = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
    const salt = view.slice(0, 16);
    const iv = view.slice(16, 28);
    const ciphertext = view.slice(28);

    const keyMaterial = await getKeyMaterial(password);
    const key = await getKey(keyMaterial, new Uint8Array(salt).buffer);

    return crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        ciphertext
    );
}
