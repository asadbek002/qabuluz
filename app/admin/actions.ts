"use server";

import { redirect } from "next/navigation";
import { createAdminSession, clearAdminSession } from "@/lib/admin-auth";

export async function login(formData: FormData) {
  const password = String(formData.get("password") || "");
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) redirect("/admin?error=1");
  await createAdminSession();
  redirect("/admin");
}

export async function logout() {
  await clearAdminSession();
  redirect("/admin");
}
