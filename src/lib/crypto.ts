import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 32;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

function scryptAsync(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(secret, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** Hashes a circle passcode with a random salt. Format: `scrypt$<salt>$<hash>` (base64url). */
export async function hashPasscode(passcode: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(passcode, salt);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/** Constant-time passcode verification. */
export async function verifyPasscode(passcode: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = await scryptAsync(passcode, Buffer.from(saltB64, "base64url"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// No 0/O/1/I/L to keep codes easy to read aloud over the phone.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Human-friendly circle code, e.g. "KQ7M-P3XA". */
export function generateCircleCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export function normalizeCircleCode(code: string): string {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

/** Opaque random token for sessions and shareable links. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Constant-time string comparison (for secrets such as the cron bearer token). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

/** Only token hashes are stored, so a database leak doesn't leak live sessions. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
