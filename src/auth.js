import { createHmac, timingSafeEqual } from "node:crypto";

const USERS = [
  { id: "rodrigo", name: "Rodrigo", pin: "2312" },
  { id: "jess", name: "Jess", pin: "0310" }
];

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 90;

export function loginWithPin(pin, now = new Date()) {
  const user = USERS.find((candidate) => candidate.pin === String(pin || ""));
  if (!user) return null;
  const publicUser = { id: user.id, name: user.name };
  return { user: publicUser, token: createSessionToken(publicUser, now) };
}

export function authenticateRequest(req, now = new Date()) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return verifySessionToken(match[1], now);
}

function createSessionToken(user, now) {
  const payload = {
    sub: user.id,
    name: user.name,
    iat: now.toISOString(),
    exp: new Date(now.getTime() + TOKEN_TTL_MS).toISOString()
  };
  const payloadText = base64UrlEncode(JSON.stringify(payload));
  return `${payloadText}.${sign(payloadText)}`;
}

function verifySessionToken(token, now) {
  const [payloadText, signature] = String(token || "").split(".");
  if (!payloadText || !signature || !safeEqual(signature, sign(payloadText))) return null;

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadText));
  } catch {
    return null;
  }

  if (!payload.sub || !payload.name || new Date(payload.exp).getTime() <= now.getTime()) return null;
  return { id: payload.sub, name: payload.name };
}

function sign(value) {
  return createHmac("sha256", authSecret()).update(value).digest("base64url");
}

function authSecret() {
  return process.env.AUTH_SECRET || "pukis-local-dev-secret";
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}
