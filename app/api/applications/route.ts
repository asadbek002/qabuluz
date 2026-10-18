import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { baseAdmissionTypes, certificateLevels, cisCountries, genders, mastersProgram, semesters, universities, visaTypes } from "@/lib/universities";
import { detectFileType, removeApplicationUploads, saveUpload } from "@/lib/uploads";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = 4 * MAX_FILE_BYTES + 1024 * 1024;
const MAX_TEXT_LENGTH = 200;
const fileFields = ["passportFile", "certificateFile", "arcFrontFile", "arcBackFile"];
const required = ["lastName","firstName","middleName","birthDate","gender","citizenship","phone","telegram","email","address","visaType","previousSchool","admissionType","languageType","languageLevel","passportNumber","universityId","campus","program","track","semester"];

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

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
    if (!genders.includes(get("gender")) || !cisCountries.includes(get("citizenship")) || !visaTypes.includes(get("visaType"))) {
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
    const livesInKorea = get("visaType") !== "Koreyada yashamayman";
    if (livesInKorea && !get("arcNumber")) return bad("Koreya ID karta raqamini kiriting.");

    // Validate every file before writing anything to disk.
    const pending: { field: string; name: string; bytes: Uint8Array; type: string; ext: string }[] = [];
    for (const field of fileFields) {
      const file = data.get(field);
      if (!(file instanceof File) || file.size === 0) continue;
      if (file.size > MAX_FILE_BYTES) return bad(`${file.name} fayli 10 MB dan katta.`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const detected = detectFileType(bytes);
      if (!detected) return bad("Faqat PDF, JPG va PNG fayllar qabul qilinadi.");
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
      phone:get("phone"), telegram:get("telegram"), email:get("email"), address:get("address"),
      visaType:get("visaType"), previousSchool:get("previousSchool"), admissionType:get("admissionType"),
      languageType:get("languageType"), languageLevel:get("languageLevel"), passportNumber:get("passportNumber"),
      arcNumber: livesInKorea ? get("arcNumber") : null, universityId:get("universityId"), campus:get("campus"),
      program:get("program"), track:get("track"), semester:get("semester"), documents:JSON.stringify(documents),
    });
    return NextResponse.json({ ok: true, applicationNo });
  } catch (error) {
    console.error(error);
    if (savedFiles) await removeApplicationUploads(id).catch((cleanupError) => console.error(cleanupError));
    return bad("Serverda xatolik yuz berdi. Qayta urinib ko‘ring.", 500);
  }
}
