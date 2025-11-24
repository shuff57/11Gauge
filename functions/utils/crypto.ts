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

const deriveKey = async (secret: string): Promise<CryptoKey> => {
  const hashed = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', hashed, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

export const encryptText = async (plainText: string, secret: string): Promise<string> => {
  if (!secret) throw new Error('Missing encryption secret');
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plainText));
  const payload = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(ciphertext), iv.byteLength);
  return base64Encode(payload);
};

export const decryptText = async (payload: string, secret: string): Promise<string | null> => {
  if (!secret || !payload) return null;
  const key = await deriveKey(secret);
  const bytes = base64Decode(payload);
  if (bytes.byteLength <= 12) return null;
  const iv = bytes.slice(0, 12);
  const cipherBytes = bytes.slice(12);
  try {
    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes);
    return decoder.decode(plainBuffer);
  } catch (err) {
    console.error('Decrypt error:', err);
    return null;
  }
};
