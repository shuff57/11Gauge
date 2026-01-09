const encoder = new TextEncoder();
const decoder = new TextDecoder();

const base64Encode = (buffer: ArrayBuffer | Uint8Array): string => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
};

const base64Decode = (input: string): Uint8Array => {
  const binary = atob(input);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const deriveKey = async (secret: string, salt: Uint8Array): Promise<CryptoKey> => {
  // Use PBKDF2 for secure key derivation instead of simple SHA-256
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000, // OWASP recommended minimum
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

export const encryptText = async (plainText: string, secret: string): Promise<string> => {
  if (!secret) throw new Error('Missing encryption secret');

  // Generate random salt for PBKDF2
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(secret, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plainText));

  // Payload format: salt (16 bytes) + IV (12 bytes) + ciphertext
  const payload = new Uint8Array(salt.byteLength + iv.byteLength + ciphertext.byteLength);
  payload.set(salt, 0);
  payload.set(iv, salt.byteLength);
  payload.set(new Uint8Array(ciphertext), salt.byteLength + iv.byteLength);

  return base64Encode(payload);
};

export const decryptText = async (payload: string, secret: string): Promise<string | null> => {
  if (!secret || !payload) return null;

  const bytes = base64Decode(payload);
  // Minimum size: salt (16) + IV (12) = 28 bytes
  if (bytes.byteLength <= 28) return null;

  // Extract salt, IV, and ciphertext from payload
  const salt = bytes.slice(0, 16);
  const iv = bytes.slice(16, 28);
  const cipherBytes = bytes.slice(28);

  try {
    const key = await deriveKey(secret, salt);
    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes);
    return decoder.decode(plainBuffer);
  } catch (err) {
    console.error('Decrypt error:', err);
    return null;
  }
};
