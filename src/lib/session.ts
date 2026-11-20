// Signed-cookie session (HMAC-SHA256 "JWT").
// Implemented with Web Crypto so it works in both Node route handlers
// and the Edge middleware runtime. Stateless like Auth.js JWT sessions.

export interface SessionPayload {
  sub: string;
  role: string;
  name: string;
  username: string;
  iat: number;
  exp: number;
}

const COOKIE_NAME = "session";
const SESSION_DAYS = 7;

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET || "insecure-dev-secret-change-me";
  return new TextEncoder().encode(secret);
}

// Copy bytes into a standalone ArrayBuffer (Web Crypto needs BufferSource
// backed by a plain ArrayBuffer, not a shared buffer view).
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

// UTF-8 safe base64url
function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    toArrayBuffer(new TextEncoder().encode(data))
  );
  return bytesToBase64Url(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(
  user: { id: string; role: string; name: string; username: string }
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: user.id,
    role: user.role,
    name: user.name,
    username: user.username,
    iat: now,
    exp: now + SESSION_DAYS * 24 * 60 * 60,
  };
  const header = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  );
  const body = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const signature = await hmac(`${header}.${body}`);
  return `${header}.${body}.${signature}`;
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = await hmac(`${header}.${body}`);
  if (!timingSafeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export const sessionCookieName = COOKIE_NAME;

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  // Set to true behind HTTPS in production; the preview gateway may serve plain http.
  secure: false,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};
