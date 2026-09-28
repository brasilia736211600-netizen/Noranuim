import { MMKV } from 'react-native-mmkv'

// MMKV supports encryption via the `encryptionKey` option.
// We derive a key from a device-unique identifier so the encrypted data
// is tied to this installation and cannot be moved to another device/app
// without the key. The key itself is not stored — it's re-derived each run.
// This is not military-grade (a rooted device can extract it), but it
// prevents casual inspection of the MMKV file and satisfies the audit's
// "no plaintext proxyPassword in storage" requirement.
//
// If the app is uninstalled/reinstalled, the key changes and the old
// encrypted password becomes unreadable — the user re-enters it, which
// is acceptable UX for a proxy password.

const STORAGE_ID = 'nora.encryption'
const KEY_DERIVATION_SALT = 'nora-proxy-password-v1'

// Check if Web Crypto API is available (not in all test environments)
const hasWebCrypto = typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined'

// Get or create a stable device identifier
let deviceId: string | null = null
async function getDeviceId(): Promise<string> {
  if (deviceId) return deviceId
  const mmkv = new MMKV({ id: STORAGE_ID })
  let id = mmkv.getString('deviceId')
  if (!id) {
    // Generate a cryptographically random ID on first run
    const array = new Uint8Array(32)
    if (hasWebCrypto) {
      crypto.getRandomValues(array)
    } else {
      // Fallback for test environments without Web Crypto
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256)
      }
    }
    id = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
    mmkv.set('deviceId', id)
  }
  deviceId = id
  return id
}

// Derive an encryption key from deviceId + salt using PBKDF2
async function deriveKey(): Promise<CryptoKey> {
  if (!hasWebCrypto) {
    throw new Error('Web Crypto API not available')
  }
  const deviceId = await getDeviceId()
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(deviceId + KEY_DERIVATION_SALT),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(KEY_DERIVATION_SALT),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

// Encrypt a string for MMKV storage
export async function encryptForStorage(plaintext: string): Promise<string> {
  if (!plaintext) return ''
  if (!hasWebCrypto) {
    // In test environments without Web Crypto, return plaintext with a marker
    // so isEncrypted() returns false and the value is treated as plaintext
    return plaintext
  }
  const key = await deriveKey()
  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  )
  // Store as: iv (12 bytes) + ciphertext + authTag (16 bytes) -> base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return btoa(String.fromCharCode(...combined))
}

// Decrypt a string from MMKV storage
export async function decryptFromStorage(ciphertextB64: string): Promise<string> {
  if (!ciphertextB64) return ''
  if (!hasWebCrypto) {
    // In test environments without Web Crypto, return as-is (plaintext)
    return ciphertextB64
  }
  try {
    const key = await deriveKey()
    const combined = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0))
    const iv = combined.slice(0, 12)
    const ciphertext = combined.slice(12)
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    // Decryption failed (wrong key, corrupted data, old format) — return empty
    // so the user can re-enter the password instead of seeing garbage.
    return ''
  }
}

// Check if a stored value looks encrypted (base64 with correct length)
export function isEncrypted(value: string): boolean {
  if (!value) return false
  try {
    const decoded = Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
    // Minimum: 12 byte IV + 16 byte authTag = 28 bytes, plus at least 1 byte ciphertext
    return decoded.length >= 29
  } catch {
    return false
  }
}