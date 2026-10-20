// Pure text parsers for OCR output of an Uzbek passport (ICAO 9303 TD3 MRZ + visual zone)
// and a Korean residence card (외국인등록증). No browser APIs here so it can be unit tested.

export type PassportData = {
  lastName?: string;
  firstName?: string;
  middleName?: string;
  passportNumber?: string;
  birthDate?: string; // YYYY-MM-DD
  gender?: "Erkak" | "Ayol";
  citizenship?: string;
  /** true when the MRZ check digits for number + birth date passed */
  verified: boolean;
};

export type ResidenceCardData = {
  arcNumber?: string; // 123456-1234567
  visaType?: string; // D-8
};

const countryByCode: Record<string, string> = {
  UZB: "O‘zbekiston", KAZ: "Qozog‘iston", KGZ: "Qirg‘iziston", TJK: "Tojikiston", TKM: "Turkmaniston",
  AZE: "Ozarbayjon", ARM: "Armaniston", BLR: "Belarus", MDA: "Moldova", RUS: "Rossiya", UKR: "Ukraina",
};

const toDigit: Record<string, string> = { O: "0", Q: "0", D: "0", U: "0", I: "1", L: "1", T: "7", Z: "2", S: "5", B: "8", G: "6", A: "4" };
const toLetter: Record<string, string> = { "0": "O", "1": "I", "2": "Z", "5": "S", "8": "B", "6": "G", "4": "A" };
const digits = (s: string) => s.replace(/[^0-9]/g, (c) => toDigit[c] ?? c);
const letters = (s: string) => s.replace(/[0-9]/g, (c) => toLetter[c] ?? c);

export function checkDigit(value: string) {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    const v = c === "<" ? 0 : /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55;
    sum += v * weights[i % 3];
  }
  return String(sum % 10);
}

function mrzDate(yymmdd: string, past: boolean) {
  if (!/^\d{6}$/.test(yymmdd)) return undefined;
  const yy = Number(yymmdd.slice(0, 2)), mm = yymmdd.slice(2, 4), dd = yymmdd.slice(4, 6);
  const nowYY = new Date().getFullYear() % 100;
  const year = past ? (yy > nowYY ? 1900 + yy : 2000 + yy) : 2000 + yy;
  const iso = `${year}-${mm}-${dd}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : undefined;
}

const clean = (line: string) => line.toUpperCase().replace(/\s+/g, "").replace(/[«‹(\[{]/g, "<");

/** Uzbek passport numbers are 2 letters + 7 digits (FA3852303). */
function fixPassportNumber(raw: string) {
  const s = raw.replace(/</g, "");
  if (s.length !== 9) return s;
  return letters(s.slice(0, 2)) + digits(s.slice(2));
}

/** "RAKHIMJONUGLI" -> "RAKHIMJON UGLI" when the separator was lost. */
function fixPatronymic(v: string) {
  return v.replace(/([A-Z])(UGLI|OGLI|OʻGʻLI|QIZI|KIZI)$/, "$1 $2");
}

function splitGivenNames(tokens: string[]) {
  // MRZ / visual zone given names hold "ELBEK RAKHIMJON UGLI": first token is the name,
  // the rest is the patronymic (otchestvo).
  return { firstName: tokens[0], middleName: fixPatronymic(tokens.slice(1).join(" ")) || undefined };
}

/** Find and decode a TD3 MRZ in OCR text. */
export function parseMrz(text: string): PassportData | null {
  const lines = text.split(/\n/).map(clean).filter((l) => l.length >= 30 && /^[A-Z0-9<]+$/.test(l.replace(/[^A-Z0-9<]/g, "")));
  const l1Index = lines.findIndex((l) => /^P[A-Z<]/.test(l) && l.includes("<"));
  if (l1Index < 0) return null;
  const line1 = lines[l1Index].replace(/[^A-Z0-9<]/g, "");
  const line2 = (lines[l1Index + 1] ?? "").replace(/[^A-Z0-9<]/g, "");

  // Line 1: P<UZBSURNAME<<GIVEN<NAMES<<<<
  const names = letters(line1.slice(5)).replace(/[KC<]{3,}$/, "").replace(/<+$/, "");
  const [surnamePart, givenPart = ""] = names.split(/<</);
  const given = givenPart.split("<").filter(Boolean);
  const result: PassportData = {
    lastName: surnamePart.replace(/</g, " ").trim() || undefined,
    ...splitGivenNames(given),
    verified: false,
  };
  const issuing = letters(line1.slice(2, 5));

  if (line2.length >= 28) {
    const number = fixPassportNumber(line2.slice(0, 9));
    const numberCheck = digits(line2[9]);
    const nationality = letters(line2.slice(10, 13));
    const dob = digits(line2.slice(13, 19));
    const dobCheck = digits(line2[19]);
    const sex = line2[20];
    const numberOk = checkDigit(number.padEnd(9, "<")) === numberCheck;
    const dobOk = checkDigit(dob) === dobCheck;
    result.passportNumber = number || undefined;
    result.birthDate = mrzDate(dob, true);
    result.gender = sex === "M" ? "Erkak" : sex === "F" ? "Ayol" : undefined;
    result.citizenship = countryByCode[nationality] ?? countryByCode[issuing];
    result.verified = numberOk && dobOk;
  } else {
    result.citizenship = countryByCode[issuing];
  }
  return result;
}

function valueAfter(lines: string[], label: RegExp) {
  const i = lines.findIndex((l) => label.test(l));
  if (i < 0) return undefined;
  for (const candidate of lines.slice(i + 1, i + 3)) {
    const v = candidate.replace(/[^A-Z' -]/g, "").replace(/\s+/g, " ").trim();
    if (v.length >= 2 && !/[A-Z]+ ?\/ ?[A-Z]+/.test(candidate) && !label.test(candidate)) return v;
  }
  return undefined;
}

/** Labelled fields printed on the Uzbek passport data page (fallback when the MRZ is unreadable). */
export function parsePassportVisual(text: string): Partial<PassportData> {
  const lines = text.toUpperCase().split(/\n/).map((l) => l.trim()).filter(Boolean);
  const out: Partial<PassportData> = {};
  const surname = valueAfter(lines, /SURNAME/);
  const given = valueAfter(lines, /GIVEN NAMES?/);
  const father = valueAfter(lines, /FATHER/);
  if (surname) out.lastName = surname;
  if (given) out.firstName = given.split(" ")[0];
  if (father) out.middleName = fixPatronymic(father);
  const number = /\b([A-Z]{2})\s?(\d{7})\b/.exec(text.toUpperCase());
  if (number) out.passportNumber = number[1] + number[2];
  const dobLine = lines.findIndex((l) => /DATE OF BIRTH/.test(l));
  if (dobLine >= 0) {
    const m = /(\d{2})[ .\/-]?(\d{2})[ .\/-]?(\d{4})/.exec(lines.slice(dobLine + 1, dobLine + 3).join(" "));
    if (m) out.birthDate = `${m[3]}-${m[2]}-${m[1]}`;
  }
  if (/UZBEKISTAN|\bUZB\b/.test(text.toUpperCase())) out.citizenship = "O‘zbekiston";
  return out;
}

/** Merge MRZ (authoritative when its check digits pass) with the visual zone. */
export function parsePassport(text: string): PassportData | null {
  const mrz = parseMrz(text);
  const visual = parsePassportVisual(text);
  if (!mrz && !Object.keys(visual).length) return null;
  const base: PassportData = { ...visual, ...Object.fromEntries(Object.entries(mrz ?? {}).filter(([, v]) => v !== undefined)), verified: mrz?.verified ?? false };
  // The MRZ truncates long names and can confuse '<' fillers with K; prefer the printed
  // name when it agrees with the MRZ letters.
  const mrzLetters = (mrz?.lastName ?? "") + (mrz?.firstName ?? "") + (mrz?.middleName ?? "");
  const agrees = (v?: string) => !!v && (!mrz || mrzLetters.replace(/\s/g, "").includes(v.replace(/[\s']/g, "").slice(0, 4)));
  if (agrees(visual.lastName)) base.lastName = visual.lastName;
  if (agrees(visual.firstName)) base.firstName = visual.firstName;
  if (agrees(visual.middleName)) base.middleName = visual.middleName;
  return base;
}

// "(D-8)" on the card; a leading D is often read as O/0.
const visaPattern = /\(\s*([A-HO0])\s*[-–—~]\s*([0-9OISZ]{1,2})(?:\s*[-–—~]\s*([0-9OISZ]{1,2}))?\s*\)/;

/** Korean residence card front side. */
export function parseResidenceCard(text: string): ResidenceCardData | null {
  const upper = text.toUpperCase();
  const out: ResidenceCardData = {};
  // OCR often glues a stray mark to the number ("1123456-1234567", "N23456-…"): take the
  // last 6 characters before the dash and accept the first candidate that is all digits.
  for (const m of upper.matchAll(/([0-9A-Z]{5,8})\s*[-–—~=]\s*([0-9A-Z]{7})(?![0-9A-Z])/g)) {
    const front = digits(m[1].slice(-6)), back = digits(m[2]);
    if (/^\d{6}$/.test(front) && /^\d{7}$/.test(back)) { out.arcNumber = `${front}-${back}`; break; }
  }
  const withoutNumber = upper.replace(/[0-9A-Z]{5,8}\s*[-–—~=]\s*[0-9A-Z]{7}/g, " ");
  const visa = visaPattern.exec(withoutNumber) ?? /\b([A-H])\s*[-–]\s*(\d{1,2})\b/.exec(withoutNumber);
  if (visa) out.visaType = `${visa[1].replace(/[O0]/, "D")}-${digits(visa[2])}${visa[3] ? `-${digits(visa[3])}` : ""}`;
  return Object.keys(out).length ? out : null;
}

/** First 6 digits of an ARC number are the holder's birth date (YYMMDD). */
export function arcMatchesBirthDate(arcNumber: string, birthDate: string) {
  return arcNumber.slice(0, 6) === birthDate.replaceAll("-", "").slice(2);
}
