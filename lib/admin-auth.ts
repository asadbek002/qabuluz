import { cookies } from "next/headers";

const adminPassword = () => process.env.ADMIN_PASSWORD;

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isAdmin() {
  const password = adminPassword();
  if (!password) return false;
  const jar = await cookies();
  return jar.get("admin_session")?.value === await digest(password);
}

export async function createAdminSession() {
  const password = adminPassword();
  if (!password) throw new Error("ADMIN_PASSWORD environment variable is required.");
  const jar = await cookies();
  jar.set("admin_session", await digest(password), {
    httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 60 * 60 * 12,
  });
}

export async function clearAdminSession() {
  const jar = await cookies();
  jar.delete("admin_session");
}
