"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkAdminPassword, createAdminSession, clearAdminSession } from "@/lib/admin-auth";
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
