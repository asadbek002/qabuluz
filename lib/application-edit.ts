// Admin edits of a submitted application (personal data and the chosen programme). Uses the
// same lists as the student form; only the programme name is free text so the admin can type
// the exact department.
import { baseAdmissionTypes, certificateLevels, cisCountries, genders, languageTypes, semesters, universities, visaCodePattern, visaTypes } from "@/lib/universities";

export const editableKeys = [
  "lastName", "firstName", "middleName", "birthDate", "gender", "citizenship", "phone", "email",
  "visaType", "passportNumber", "arcNumber", "address",
  "previousSchool", "graduationDate", "universityId", "campus", "admissionType", "program", "track", "semester", "languageType", "languageLevel",
] as const;

export type EditableKey = (typeof editableKeys)[number];
/** May be left empty (no longer asked on the student form; the admin fills them in). */
export const optionalKeys: EditableKey[] = ["arcNumber", "address", "previousSchool", "graduationDate"];
export type ApplicationEdit = Record<EditableKey, string>;

/** Admission types a university offers (Magistratura only where it has masters). */
export function admissionTypesFor(universityId: string) {
  const u = universities.find((x) => x.id === universityId);
  return [...baseAdmissionTypes, ...(u?.hasMasters ? ["Magistratura"] : [])];
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value && value > "1940-01-01" && value < new Date().toISOString().slice(0, 10);
}

/** A real calendar date or month ("2024-06-25" / "2024-06"); may lie in the future (expected graduation). */
function validGraduation(value: string) {
  const full = /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(full)) return false;
  const d = new Date(`${full}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === full && full > "1950-01-01" && full < "2040-01-01";
}

/** Check an edit; returns the cleaned values or the first error (in Uzbek, shown to the admin). */
export function validateApplicationEdit(get: (key: string) => string): { values: ApplicationEdit } | { error: string } {
  const v = Object.fromEntries(editableKeys.map((k) => [k, get(k).trim()])) as ApplicationEdit;
  v.passportNumber = v.passportNumber.toUpperCase();
  for (const k of editableKeys) {
    if (!optionalKeys.includes(k) && !v[k]) return { error: "Barcha maydonlarni to‘ldiring." };
    if (v[k].length > 200) return { error: "Ba’zi maydonlar juda uzun." };
  }
  if (!validDate(v.birthDate)) return { error: "Tug‘ilgan sana noto‘g‘ri." };
  // Older applications stored the graduation month only ("2024-06").
  if (v.graduationDate && !validGraduation(v.graduationDate)) return { error: "Bitirgan sana 2024-06-25 (yoki 2024-06) ko‘rinishida bo‘lsin." };
  if (!genders.includes(v.gender) || !cisCountries.includes(v.citizenship)) return { error: "Jinsi yoki fuqaroligi noto‘g‘ri." };
  if (!visaTypes.includes(v.visaType) && !visaCodePattern.test(v.visaType)) return { error: "Viza turi noto‘g‘ri." };
  if (!/^\+?\d[\d\s-]{6,19}$/.test(v.phone)) return { error: "Telefon raqami noto‘g‘ri." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return { error: "Elektron pochta noto‘g‘ri." };
  const u = universities.find((x) => x.id === v.universityId);
  if (!u) return { error: "Universitet noto‘g‘ri." };
  if (!u.campuses.includes(v.campus)) return { error: "Kampus bu universitetga tegishli emas." };
  if (!u.tracks.includes(v.track)) return { error: "Ta’lim tili bu universitetda yo‘q." };
  if (!semesters.includes(v.semester)) return { error: "Semestr noto‘g‘ri." };
  if (!admissionTypesFor(u.id).includes(v.admissionType)) return { error: "Bu universitetda bunday qabul turi yo‘q." };
  if (!languageTypes.includes(v.languageType)) return { error: "Til sertifikati noto‘g‘ri." };
  if (v.languageType === "Mavjud emas" ? v.languageLevel !== "Mavjud emas" : !certificateLevels[v.languageType]?.includes(v.languageLevel)) {
    return { error: "Til sertifikati darajasini tanlang." };
  }
  return { values: v };
}
