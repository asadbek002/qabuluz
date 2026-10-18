import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { isAdmin } from "@/lib/admin-auth";
import { readUpload } from "@/lib/uploads";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(_request: Request, context: { params: Promise<{ id: string; field: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: "Ruxsat yo‘q." }, { status: 401 });
  const { id, field } = await context.params;
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Topilmadi." }, { status: 404 });
  const [application] = await getDb().select({ documents: applications.documents }).from(applications).where(eq(applications.id, id)).limit(1);
  if (!application) return NextResponse.json({ error: "Topilmadi." }, { status: 404 });
  let docs: Record<string, { key: string; name: string; type: string }> = {};
  try { docs = JSON.parse(application.documents || "{}"); } catch {}
  const doc = Object.hasOwn(docs, field) ? docs[field] : undefined;
  if (!doc?.key) return NextResponse.json({ error: "Fayl topilmadi." }, { status: 404 });
  const file = await readUpload(doc.key);
  if (!file) return NextResponse.json({ error: "Fayl topilmadi." }, { status: 404 });
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": doc.type,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
