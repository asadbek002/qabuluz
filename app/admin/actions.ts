"use server";

import { headers } from "next/headers";
import { eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { checkAdminPassword, createAdminSession, clearAdminSession, isAdmin } from "@/lib/admin-auth";
import { removeApplicationUploads } from "@/lib/uploads";
import { cleanAdminData } from "@/lib/admin-fields";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function login(formData: FormData) {
  const ip = clientIp(await headers());
  if (!rateLimit(`login:${ip}`, 5, 15 * 60 * 1000)) redirect("/admin?error=limit");
  const password = String(formData.get("password") || "");
  if (!checkAdminPassword(password)) redirect("/admin?error=1");
  await createAdminSession();
  redirect("/admin");
}

export async function logout() {
  await clearAdminSession();
  redirect("/admin");
}

/** Permanently delete the ticked applications together with their uploaded documents. */
export async function deleteApplications(formData: FormData) {
  if (!await isAdmin()) redirect("/admin");
  const ids = formData.getAll("id").map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length) {
    await getDb().delete(applications).where(inArray(applications.id, ids));
    for (const id of ids) await removeApplicationUploads(id).catch((error) => console.error(error));
  }
  const back = new URLSearchParams();
  for (const key of ["q", "university"]) if (formData.get(key)) back.set(key, String(formData.get(key)));
  redirect("/admin" + (back.size ? "?" + back.toString() : ""));
}

/** Save the admin-only template columns of one application. */
export async function saveAdminData(formData: FormData) {
  if (!await isAdmin()) return { ok: false };
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false };
  const data = cleanAdminData((key) => String(formData.get(key) || ""));
  await getDb().update(applications).set({ adminData: JSON.stringify(data) }).where(eq(applications.id, id));
  return { ok: true };
}
