import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { isAdmin } from "@/lib/admin-auth";
import { readUpload } from "@/lib/uploads";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string; field: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: "Ruxsat yo‘q." }, { status: 401 });
  const { id, field } = await context.params;
  const [application] = await getDb().select({ documents: applications.documents }).from(applications).where(eq(applications.id, id)).limit(1);
  if (!application) return NextResponse.json({ error: "Topilmadi." }, { status: 404 });
  const docs = JSON.parse(application.documents || "{}") as Record<string,{key:string;name:string;type:string}>;
  const doc = docs[field];
  if (!doc) return NextResponse.json({ error: "Fayl topilmadi." }, { status: 404 });
  const file = await readUpload(doc.key);
  if (!file) return NextResponse.json({ error: "Fayl topilmadi." }, { status: 404 });
  return new Response(new Uint8Array(file).buffer as ArrayBuffer, { headers: { "Content-Type": doc.type, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.name)}`, "Cache-Control": "private, no-store" } });
}
