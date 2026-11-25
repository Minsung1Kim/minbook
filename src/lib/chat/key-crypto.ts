import crypto from "node:crypto";

const ENC_PREFIX = "enc:v1:";

function getEncryptionKeyBuffer(): Buffer | null {
  const secret = process.env.MINBOOK_KEY_SECRET?.trim();
  if (!secret) return null;
  return crypto.createHash("sha256").update(secret).digest();
}

export function maskApiKey(rawKey: string): string {
  const clean = rawKey.trim();
  if (clean.length <= 8) return "••••";
  return `${clean.slice(0, 4)}••••${clean.slice(-4)}`;
}

export function encryptApiKey(plaintext: string): string {
  const keyBuf = getEncryptionKeyBuffer();
  if (!keyBuf) {
    return plaintext;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuf, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENC_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptApiKey(storedValue: string): string {
  if (!storedValue) return "";
  if (!storedValue.startsWith(ENC_PREFIX)) {
    return storedValue;
  }

  const keyBuf = getEncryptionKeyBuffer();
  if (!keyBuf) {
    throw new Error("Server encryption key (MINBOOK_KEY_SECRET) is missing.");
  }

  const payload = storedValue.slice(ENC_PREFIX.length);
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Corrupted encrypted API key payload.");
  }

  const [ivB64, tagB64, cipherB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(cipherB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuf, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
