import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { baseAdmissionTypes, certificateLevels, cisCountries, genders, mastersProgram, nonResident, semesters, universities, visaCodePattern, visaTypes } from "@/lib/universities";
import { detectFileType, removeApplicationUploads, saveUpload } from "@/lib/uploads";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_REQUEST_BYTES = 4 * MAX_FILE_BYTES + 1024 * 1024;
const MAX_TEXT_LENGTH = 200;
const fileFields = ["passportFile", "certificateFile", "arcFrontFile", "arcBackFile"];
const required = ["lastName","firstName","middleName","birthDate","gender","citizenship","phone","email","visaType","admissionType","languageType","languageLevel","passportNumber","universityId","campus","program","track","semester"];

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

const mergedKeys = ["lastName", "firstName", "middleName", "passportNumber", "birthDate", "gender", "citizenship", "arcNumber", "visaType"] as const;
const ocrKeys = {
  passport: [...mergedKeys.slice(0, 7), "verified"],
  arc: ["arcNumber", "visaType", "birthDate", "gender", "citizenship"],
  merged: mergedKeys,
  sources: mergedKeys,
} as const;

/** Keep only the known OCR fields (short strings) sent by the form. */
function sanitizeOcr(raw: string) {
  try {
    const input = JSON.parse(raw) as Record<string, Record<string, unknown> | null>;
    const out: Record<string, Record<string, string | boolean>> = {};
    for (const [doc, keys] of Object.entries(ocrKeys)) {
      const src = input?.[doc];
      if (!src || typeof src !== "object") continue;
      const picked: Record<string, string | boolean> = {};
      for (const k of keys) {
        const v = src[k];
        if (typeof v === "boolean" || (typeof v === "string" && v.length <= MAX_TEXT_LENGTH)) picked[k] = v;
      }
      if (Object.keys(picked).length) out[doc] = picked;
    }
    return Object.keys(out).length ? JSON.stringify(out) : null;
  } catch {
    return null;
  }
}

function validBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  const year = date.getUTCFullYear();
  return year >= 1950 && date.getTime() < Date.now();
}

export async function POST(request: Request) {
  const id = crypto.randomUUID();
  let savedFiles = false;
  try {
    if (!rateLimit(`apply:${clientIp(request.headers)}`, 10, 60 * 60 * 1000)) {
      return bad("Juda ko‘p urinish. Birozdan so‘ng qayta urinib ko‘ring.", 429);
    }
    if (Number(request.headers.get("content-length") || 0) > MAX_REQUEST_BYTES) {
      return bad("Yuklangan fayllar hajmi juda katta.", 413);
    }

    const data = await request.formData();
    const get = (key: string) => String(data.get(key) || "").trim();
    if (required.some((key) => !get(key))) return bad("Majburiy ma’lumotlar to‘liq kiritilmagan.");
    if ([...required, "arcNumber"].some((key) => get(key).length > MAX_TEXT_LENGTH)) return bad("Ba’zi maydonlar juda uzun.");

    const university = universities.find((u) => u.id === get("universityId"));
    if (!university) return bad("Universitet noto‘g‘ri tanlangan.");
    if (!/^\+8210\d{8}$/.test(get("phone"))) return bad("Telefon raqamini +8210 dan keyin 8 ta raqam bilan kiriting.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(get("email"))) return bad("Elektron pochta manzili noto‘g‘ri.");
    if (!validBirthDate(get("birthDate"))) return bad("Tug‘ilgan sana noto‘g‘ri.");
    if (!genders.includes(get("gender")) || !cisCountries.includes(get("citizenship")) || !(visaTypes.includes(get("visaType")) || visaCodePattern.test(get("visaType")))) {
      return bad("Shaxsiy ma’lumotlar noto‘g‘ri tanlangan.");
    }
    if (!university.campuses.includes(get("campus")) || !university.tracks.includes(get("track")) || !semesters.includes(get("semester"))) {
      return bad("Dastur ma’lumotlari noto‘g‘ri tanlangan.");
    }
    const isMasters = get("admissionType") === "Magistratura";
    if (isMasters && !university.hasMasters) return bad("Bu universitet uchun magistratura qabuli ko‘rsatilmagan.");
    if (!isMasters && !baseAdmissionTypes.includes(get("admissionType"))) return bad("Qabul turi noto‘g‘ri tanlangan.");
    if (isMasters ? get("program") !== mastersProgram : !university.programs.includes(get("program"))) {
      return bad("Tanlangan ta’lim bosqichi va yo‘nalish mos kelmadi.");
    }
    if (get("languageType") === "Mavjud emas" ? get("languageLevel") !== "Mavjud emas" : !certificateLevels[get("languageType")]?.includes(get("languageLevel"))) {
      return bad("Til sertifikati darajasi noto‘g‘ri tanlangan.");
    }
    const livesInKorea = get("visaType") !== nonResident;
    if (livesInKorea && !get("arcNumber")) return bad("Koreya ID karta raqamini kiriting.");
    const hasFile = (field: string) => { const f = data.get(field); return f instanceof File && f.size > 0; };
    if (!hasFile("passportFile")) return bad("Xorijga chiqish pasporti faylini yuklang.");
    if (livesInKorea && (!hasFile("arcFrontFile") || !hasFile("arcBackFile"))) return bad("Koreya ID kartaning ikkala tomonini yuklang.");

    // Validate every file before writing anything to disk.
    const pending: { field: string; name: string; bytes: Uint8Array; type: string; ext: string }[] = [];
    for (const field of fileFields) {
      const file = data.get(field);
      if (!(file instanceof File) || file.size === 0) continue;
      if (file.size > MAX_FILE_BYTES) return bad(`${file.name} fayli 20 MB dan katta.`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const detected = detectFileType(bytes);
      if (!detected) return bad("Faqat PDF, JPG va PNG fayllar qabul qilinadi. Rasmni JPG formatida qayta tanlang.");
      const name = file.name.replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 150) || `${field}.${detected.ext}`;
      pending.push({ field, name, bytes, type: detected.type, ext: detected.ext });
    }

    const documents: Record<string, { key: string; name: string; type: string }> = {};
    for (const file of pending) {
      const key = `applications/${id}/${file.field}.${file.ext}`;
      savedFiles = true;
      await saveUpload(key, file.bytes);
      documents[file.field] = { key, name: file.name, type: file.type };
    }

    const applicationNo = `APP-${new Date().getUTCFullYear()}-${id.slice(0, 8).toUpperCase()}`;
    await getDb().insert(applications).values({
      id, applicationNo, createdAt: new Date().toISOString(),
      lastName:get("lastName"), firstName:get("firstName"), middleName:get("middleName"),
      birthDate:get("birthDate"), gender:get("gender"), citizenship:get("citizenship"),
      phone:get("phone"), email:get("email"),
      visaType:get("visaType"), admissionType:get("admissionType"),
      languageType:get("languageType"), languageLevel:get("languageLevel"), passportNumber:get("passportNumber"),
      arcNumber: livesInKorea ? get("arcNumber") : null, universityId:get("universityId"), campus:get("campus"),
      program:get("program"), track:get("track"), semester:get("semester"), documents:JSON.stringify(documents),
      ocrData: sanitizeOcr(String(data.get("ocr") || "")),
    });
    return NextResponse.json({ ok: true, applicationNo });
  } catch (error) {
    console.error(error);
    if (savedFiles) await removeApplicationUploads(id).catch((cleanupError) => console.error(cleanupError));
    return bad("Serverda xatolik yuz berdi. Qayta urinib ko‘ring.", 500);
  }
}
