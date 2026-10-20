import { readFile } from "node:fs/promises";
import path from "node:path";
import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { isAdmin } from "@/lib/admin-auth";
import { buildApplicantWorkbook } from "@/lib/applicant-export";
import { universities } from "@/lib/universities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const templatePath = path.resolve(process.env.TEMPLATE_DIR || "./templates", "applicants-template.xlsx");

export async function GET(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Ruxsat yo‘q." }, { status: 401 });

  const search = new URL(request.url).searchParams;
  const universityFilter = search.get("university") || "";
  const query = (search.get("q") || "").trim().toLowerCase();
  const all = await getDb().select().from(applications).orderBy(asc(applications.createdAt));
  const filtered = all.filter((application) => {
    const university = universities.find((item) => item.id === application.universityId);
    const searchable = [
      application.firstName, application.lastName, application.middleName,
      application.phone, application.applicationNo, university?.ko, university?.uz,
    ].join(" ").toLowerCase();
    return (!universityFilter || application.universityId === universityFilter) && (!query || searchable.includes(query));
  });

  const workbook = buildApplicantWorkbook(new Uint8Array(await readFile(templatePath)), filtered, universityFilter || undefined);
  const date = new Date().toISOString().slice(0, 10);
  const university = universities.find((u) => u.id === universityFilter);
  // ASCII-only name: browsers may ignore a non-Latin filename* and save the file as "download".
  const name = `applicants-${university ? university.id + "-" : ""}${date}.xlsx`;
  return new Response(workbook, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
