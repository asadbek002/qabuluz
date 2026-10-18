import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

const adminPassword = () => process.env.ADMIN_PASSWORD || "";

// Behind an HTTPS reverse proxy the cookie must be Secure; allow opting out for plain-HTTP testing.
const secureCookie = () => process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production";

function sign(payload: string, password: string) {
  return createHmac("sha256", `admin-session:${password}`).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function checkAdminPassword(candidate: string) {
  const password = adminPassword();
  if (password.length < 12) return false;
  // Compare HMAC digests so the comparison is constant-time regardless of input length.
  return safeEqual(sign(candidate, "login"), sign(password, "login"));
}

export async function isAdmin() {
  const password = adminPassword();
  if (!password) return false;
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || !/^\d+$/.test(expires)) return false;
  if (Number(expires) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, sign(expires, password));
}

export async function createAdminSession() {
  const password = adminPassword();
  if (!password) throw new Error("ADMIN_PASSWORD environment variable is required.");
  const expires = String(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS);
  (await cookies()).set(COOKIE_NAME, `${expires}.${sign(expires, password)}`, {
    httpOnly: true, secure: secureCookie(), sameSite: "strict", path: "/", maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearAdminSession() {
  (await cookies()).delete(COOKIE_NAME);
}
