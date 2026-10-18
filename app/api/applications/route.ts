import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { universities } from "@/lib/universities";
import { saveUpload } from "@/lib/uploads";

export const runtime = "nodejs";

const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const fileFields = ["passportFile", "certificateFile", "arcFrontFile", "arcBackFile"];
const required = ["lastName","firstName","middleName","birthDate","gender","citizenship","phone","telegram","email","address","visaType","previousSchool","admissionType","languageType","languageLevel","passportNumber","universityId","campus","program","track","semester"];
const certificateLevels: Record<string, string[]> = {
  TOPIK: ["1-daraja", "2-daraja", "3-daraja", "4-daraja", "5-daraja", "6-daraja"],
  KIIP: ["1-bosqich", "2-bosqich", "3-bosqich", "4-bosqich", "5-bosqich"],
  IELTS: Array.from({ length: 18 }, (_, i) => `${(i + 1) / 2} ball`),
};

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const get = (key: string) => String(data.get(key) || "").trim();
    const missing = required.find((key) => !get(key));
    if (missing) return NextResponse.json({ error: "Majburiy ma’lumotlar to‘liq kiritilmagan." }, { status: 400 });
    const university = universities.find((u) => u.id === get("universityId"));
    if (!university) return NextResponse.json({ error: "Universitet noto‘g‘ri tanlangan." }, { status: 400 });
    if (!/^\+8210\d{8}$/.test(get("phone"))) return NextResponse.json({ error: "Telefon raqamini +8210 dan keyin 8 ta raqam bilan kiriting." }, { status: 400 });
    if (get("admissionType") === "Magistratura" && !university.hasMasters) return NextResponse.json({ error: "Bu universitet uchun magistratura qabuli ko‘rsatilmagan." }, { status: 400 });
    if ((get("admissionType") === "Magistratura") !== get("program").startsWith("Magistratura —")) {
      return NextResponse.json({ error: "Tanlangan ta’lim bosqichi va yo‘nalish mos kelmadi." }, { status: 400 });
    }
    if (get("languageType") === "Mavjud emas" ? get("languageLevel") !== "Mavjud emas" : !certificateLevels[get("languageType")]?.includes(get("languageLevel"))) {
      return NextResponse.json({ error: "Til sertifikati darajasi noto‘g‘ri tanlangan." }, { status: 400 });
    }
    if (get("visaType") !== "Koreyada yashamayman" && !get("arcNumber")) return NextResponse.json({ error: "Koreya ID karta raqamini kiriting." }, { status: 400 });

    const id = crypto.randomUUID();
    const applicationNo = `APP-${new Date().getUTCFullYear()}-${id.slice(0, 8).toUpperCase()}`;
    const documents: Record<string, { key: string; name: string; type: string }> = {};
    for (const field of fileFields) {
      const file = data.get(field);
      if (!(file instanceof File) || file.size === 0) continue;
      if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: `${file.name} fayli 10 MB dan katta.` }, { status: 400 });
      if (!allowedTypes.has(file.type)) return NextResponse.json({ error: "Faqat PDF, JPG va PNG fayllar qabul qilinadi." }, { status: 400 });
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      const key = `applications/${id}/${field}.${ext}`;
      await saveUpload(key, file);
      documents[field] = { key, name: file.name, type: file.type };
    }

    await getDb().insert(applications).values({
      id, applicationNo, createdAt: new Date().toISOString(),
      lastName:get("lastName"), firstName:get("firstName"), middleName:get("middleName"),
      birthDate:get("birthDate"), gender:get("gender"), citizenship:get("citizenship"),
      phone:get("phone"), telegram:get("telegram"), email:get("email"), address:get("address"),
      visaType:get("visaType"), previousSchool:get("previousSchool"), admissionType:get("admissionType"),
      languageType:get("languageType"), languageLevel:get("languageLevel"), passportNumber:get("passportNumber"),
      arcNumber:get("arcNumber") || null, universityId:get("universityId"), campus:get("campus"),
      program:get("program"), track:get("track"), semester:get("semester"), documents:JSON.stringify(documents),
    });
    return NextResponse.json({ ok: true, applicationNo });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Serverda xatolik yuz berdi. Qayta urinib ko‘ring." }, { status: 500 });
  }
}
