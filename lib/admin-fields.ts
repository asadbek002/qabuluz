// Extra columns of the "Shablon uchun" Excel export. Students never see these: the admin fills
// them in on the dashboard and they are stored as JSON in applications.admin_data.

export const schoolTypes = ["고등학교", "전문대학", "대학교", "대학원"];

export type AdminFieldKey =
  | "guardianPhone" | "guardianRelation" | "koreaPhone" | "arcExpiry" | "schoolType"
  | "gpa" | "major" | "grades" | "graduationDate" | "scoreExpiry";

export type AdminField = { key: AdminFieldKey; header: string; label: string; type: "text" | "tel" | "date" | "select"; placeholder?: string };

/** In Excel column order (R…AA, right after the template's A–Q). */
export const adminFields: AdminField[] = [
  { key: "guardianPhone", header: "보호자연락처", label: "Vasiy telefon raqami", type: "tel", placeholder: "+998 90 123 45 67" },
  { key: "guardianRelation", header: "관계", label: "Vasiy kimi (관계)", type: "text", placeholder: "부 / 모" },
  { key: "koreaPhone", header: "한국 내 연락처", label: "Koreyadagi aloqa raqami", type: "tel", placeholder: "010-1234-5678" },
  { key: "arcExpiry", header: "외국인등록증 유효기간", label: "ID karta amal qilish muddati", type: "date" },
  { key: "schoolType", header: "학교 구분", label: "Maktab turi (학교 구분)", type: "select" },
  { key: "gpa", header: "성적평균", label: "O‘rtacha baho (GPA)", type: "text", placeholder: "4.2 / 5" },
  { key: "major", header: "전공", label: "Mutaxassislik (전공)", type: "text" },
  { key: "grades", header: "성적", label: "Baholar (성적)", type: "text" },
  { key: "graduationDate", header: "졸업일자", label: "Bitirgan sana", type: "date" },
  { key: "scoreExpiry", header: "성적 유효기간", label: "Sertifikat amal qilish muddati", type: "date" },
];

export type AdminData = Partial<Record<AdminFieldKey, string>>;

export function parseAdminData(value: string | null | undefined): AdminData {
  try {
    const raw = JSON.parse(value || "{}") as Record<string, unknown>;
    return Object.fromEntries(adminFields.filter((f) => typeof raw[f.key] === "string").map((f) => [f.key, raw[f.key] as string]));
  } catch {
    return {};
  }
}

/** Keep only known fields with sane values (used by the save action). */
export function cleanAdminData(get: (key: string) => string): AdminData {
  const out: AdminData = {};
  for (const f of adminFields) {
    const v = get(f.key).trim().slice(0, 200);
    if (!v) continue;
    if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) continue;
    if (f.type === "select" && !schoolTypes.includes(v)) continue;
    out[f.key] = v;
  }
  return out;
}
