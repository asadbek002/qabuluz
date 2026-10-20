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
  numberOk?: boolean;
  birthDateOk?: boolean;
  /** MRZ names were split cleanly (separators found, no filler noise) */
  namesClean?: boolean;
  /** MRZ check digit of the passport number, used to verify the printed number */
  numberCheck?: string;
};

export type ResidenceCardData = {
  citizenship?: string;
  arcNumber?: string; // 123456-1234567
  visaType?: string; // D-8
  /** Latin name printed on the card ("SATTAROV ELBEK"), candidates in reading order */
  names?: string[];
  /** Derived from the ARC number: YYMMDD + century/sex digit */
  birthDate?: string;
  gender?: "Erkak" | "Ayol";
};

const countryByCode: Record<string, string> = {
  UZB: "O‘zbekiston", KAZ: "Qozog‘iston", KGZ: "Qirg‘iziston", TJK: "Tojikiston", TKM: "Turkmaniston",
  AZE: "Ozarbayjon", ARM: "Armaniston", BLR: "Belarus", MDA: "Moldova", RUS: "Rossiya", UKR: "Ukraina",
};

/** Country code with OCR tolerance: only Uzbek passports are supported, so "UIB"/"U2B" count as UZB. */
function country(code: string) {
  if (countryByCode[code]) return countryByCode[code];
  const hits = [...code].filter((c, i) => "UZB"[i] === c || (i === 1 && /[2Z7]/.test(c))).length;
  return hits >= 2 ? countryByCode.UZB : undefined;
}

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
  let names = letters(line1.slice(5)).replace(/[KC<]{3,}$/, "").replace(/<+$/, "");
  // Uzbek patronymics end in UGLI / QIZI; anything after is filler read as letters.
  const suffix = /(UGLI|OGLI|QIZI|KIZI)/.exec(names);
  if (suffix) names = names.slice(0, suffix.index + suffix[0].length);
  const [surnamePart, givenPart = ""] = names.split(/<</);
  const given = givenPart.split("<").filter(Boolean);
  const lastName = surnamePart.replace(/</g, " ").trim();
  const result: PassportData = {
    lastName: lastName || undefined,
    ...splitGivenNames(given),
    verified: false,
    namesClean: names.includes("<<") && /^[A-Z]{3,20}$/.test(lastName) && given.length > 0
      && given.every((t, i) => /^[A-Z]{2,15}$/.test(t) && (i === given.length - 1 || !/UGLI|OGLI|QIZI|KIZI/.test(t)))
      // the patronymic suffix must be its own word, not glued to a name by a misread '<'
      && (!suffix || /^(UGLI|OGLI|QIZI|KIZI)$/.test(given.at(-1) ?? "")),
  };
  const issuing = letters(line1.slice(2, 5));

  if (line2.length >= 28) {
    const number = fixPassportNumber(line2.slice(0, 9));
    const numberCheck = digits(line2[9]);
    const nationality = letters(line2.slice(10, 13));
    const dob = digits(line2.slice(13, 19));
    const dobCheck = digits(line2[19]);
    const sex = line2[20];
    const numberOk = /^[A-Z]{2}\d{7}$/.test(number) && checkDigit(number) === numberCheck;
    const dobOk = checkDigit(dob) === dobCheck;
    result.passportNumber = number || undefined;
    result.numberCheck = numberCheck;
    result.numberOk = numberOk;
    result.birthDateOk = dobOk && !!mrzDate(dob, true);
    result.birthDate = mrzDate(dob, true);
    result.gender = sex === "M" ? "Erkak" : sex === "F" ? "Ayol" : undefined;
    result.citizenship = country(nationality) ?? country(issuing);
    result.verified = numberOk && dobOk;
  } else {
    result.citizenship = country(issuing);
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
  // The printed number is larger than the MRZ; accept it when it satisfies the MRZ check digit.
  if (mrz && !mrz.numberOk && visual.passportNumber && mrz.numberCheck && checkDigit(visual.passportNumber) === mrz.numberCheck) {
    base.passportNumber = visual.passportNumber;
    base.numberOk = true;
    base.verified = !!mrz.birthDateOk;
  }
  // Noisy MRZ names (fillers read as letters): trust the printed labelled names instead.
  if (mrz && !mrz.namesClean && (visual.lastName || visual.firstName)) {
    base.lastName = visual.lastName ?? base.lastName;
    base.firstName = visual.firstName ?? base.firstName;
    base.middleName = visual.middleName ?? base.middleName;
  }
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
  if (out.arcNumber) Object.assign(out, birthFromArc(out.arcNumber));
  if (/UZBEK|UZBEKI?STAN/.test(upper)) out.citizenship = countryByCode.UZB;
  // Latin name lines (surname, name and possibly patronymic), skipping the card's fixed labels.
  // A long name can wrap onto the next line, sometimes with a hyphen ("RAKHIM-" / "JON UGLI").
  const stop = /RESIDENCE|CARD|\bKOR\b|REPUBLIC|CHIEF|IMMIGRATION|OFFICE|SEOUL|STATUS|UZBEKISTAN|UTOPIA|NAME|\bSEX\b/;
  const rawLines = upper.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const letterWords = (l: string) => l.replace(/[^A-Z\s-]/g, " ").split(/\s+/).map((t) => t.replace(/^-+|-+$/g, "")).filter((t) => t.length >= 2);
  const names: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const words = letterWords(rawLines[i]);
    const line = words.join(" ");
    if (words.length < 2 || words.length > 6 || stop.test(line) || /\d/.test(rawLines[i].replace(/^[^A-Z]*/, "").slice(0, 3))) continue;
    let joined = line;
    const next = rawLines[i + 1] ? letterWords(rawLines[i + 1]) : [];
    const nextLine = next.join(" ");
    const hyphenated = /[-–—]\s*$/.test(rawLines[i]);
    if (next.length && next.length <= 3 && !stop.test(nextLine) && !/\d/.test(rawLines[i + 1]) && (hyphenated || /UGLI|OGLI|QIZI|KIZI/.test(nextLine) || next.length === 1)) {
      joined = hyphenated ? `${joined}${next[0]}${next.length > 1 ? " " + next.slice(1).join(" ") : ""}` : `${joined} ${nextLine}`;
      i++;
    }
    // Drop any dashes left inside words ("RAKHIM-JON" -> "RAKHIMJON").
    names.push(joined.replace(/-/g, "").replace(/\s+/g, " ").trim());
  }
  if (names.length) out.names = names;
  return Object.keys(out).length ? out : null;
}

/** ARC number YYMMDD-SXXXXXX: S gives the century (1,2,5,6 → 1900s; 3,4,7,8 → 2000s) and sex (odd = male). */
export function birthFromArc(arcNumber: string): Pick<ResidenceCardData, "birthDate" | "gender"> {
  const m = /^(\d{2})(\d{2})(\d{2})-(\d)/.exec(arcNumber);
  if (!m) return {};
  const s = Number(m[4]);
  const century = [1, 2, 5, 6].includes(s) ? 1900 : [3, 4, 7, 8].includes(s) ? 2000 : 0;
  if (!century) return {};
  const iso = `${century + Number(m[1])}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return {};
  return { birthDate: iso, gender: s % 2 === 1 ? "Erkak" : "Ayol" };
}

/** First 6 digits of an ARC number are the holder's birth date (YYMMDD). */
export function arcMatchesBirthDate(arcNumber: string, birthDate: string) {
  return arcNumber.slice(0, 6) === birthDate.replaceAll("-", "").slice(2);
}

// -----------------------------------------------------------------------------------------
// Cross-checking the passport with the residence card
// -----------------------------------------------------------------------------------------

export type MergedField = "lastName" | "firstName" | "middleName" | "passportNumber" | "birthDate" | "gender" | "citizenship" | "arcNumber" | "visaType";
export type Source = "passport" | "arc" | "both";
export type Merged = {
  values: Partial<Record<MergedField, string>>;
  sources: Partial<Record<MergedField, Source>>;
  /** Both documents were read but disagree; the student must pick */
  conflicts: Partial<Record<MergedField, { passport: string; arc: string }>>;
  /** Read from one document only and not confirmed by a check digit: ask the student to check */
  uncertain: MergedField[];
};

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function similarity(a = "", b = "") {
  const x = a.toUpperCase().replace(/[^A-Z]/g, ""), y = b.toUpperCase().replace(/[^A-Z]/g, "");
  if (!x || !y) return 0;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

/**
 * Locate the card's clean name tokens inside a noisy MRZ name string ("SATTAROVCSELBEXCRAKMIMJONCUGLI")
 * and return what follows them (the patronymic), with filler letters removed.
 */
function remainderAfter(noisy: string, tokens: string[]) {
  let pos = 0;
  for (const token of tokens) {
    let best = { score: 0, end: -1 };
    for (let start = pos; start <= pos + 3 && start < noisy.length; start++) {
      for (const len of [token.length - 1, token.length, token.length + 1]) {
        const score = similarity(noisy.slice(start, start + len), token);
        if (score >= best.score && score > 0) best = { score, end: start + len };
      }
    }
    if (best.score < 0.7) return null;
    pos = best.end;
  }
  const rest = noisy.slice(pos).replace(/^[<CKSLE]{1,2}/, "").replace(/[<]+/g, " ").trim();
  const m = /^([A-Z]{2,})(UGLI|OGLI|QIZI|KIZI)$/.exec(rest.replace(/\s/g, ""));
  if (!m) return rest || null;
  // "RAKHIMJONCUGLI": a C/K right after a consonant is the '<' separator; "OTABEKUGLI" keeps its K.
  const father = /[^AEIOU][CK]$/.test(m[1]) ? m[1].slice(0, -1) : m[1];
  return `${father} ${m[2]}`;
}

/** Pick the card's name line that best matches the passport (or the first one). */
function arcName(arc: ResidenceCardData | null, passport: PassportData | null) {
  const lines = arc?.names ?? [];
  if (!lines.length) return null;
  const ref = [passport?.lastName, passport?.firstName].filter(Boolean).join(" ");
  const best = ref ? [...lines].sort((a, b) => similarity(b, ref) - similarity(a, ref))[0] : lines[0];
  const tokens = best.split(" ");
  // A name line that has nothing in common with a readable passport name is OCR noise.
  if (ref && passport?.namesClean && similarity(best, ref) < 0.4) return null;
  return { lastName: tokens[0], firstName: tokens[1], middleName: tokens.length > 2 ? fixPatronymic(tokens.slice(2).join(" ")) : undefined };
}

/**
 * Combine what was read from the passport and the residence card. A passport value that
 * passed its MRZ check digit wins; otherwise the residence card (printed in a larger, cleaner
 * font, with the birth date and sex encoded in the ARC number) fills or corrects it.
 */
export function reconcile(passport: PassportData | null, arc: ResidenceCardData | null): Merged {
  const merged: Merged = { values: {}, sources: {}, conflicts: {}, uncertain: [] };
  const set = (field: MergedField, value: string | undefined, source: Source) => {
    if (!value) return;
    merged.values[field] = value;
    merged.sources[field] = source;
  };
  const pick = (field: MergedField, p: string | undefined, a: string | undefined, passportReliable: boolean, same: (x: string, y: string) => boolean) => {
    if (p && a) {
      if (same(p, a)) return set(field, passportReliable ? p : a, "both");
      merged.conflicts[field] = { passport: p, arc: a };
      return set(field, passportReliable ? p : a, passportReliable ? "passport" : "arc");
    }
    if (p) return set(field, p, "passport");
    if (a) return set(field, a, "arc");
  };

  const fromCard = arcName(arc, passport);
  const namesReliable = !!passport?.namesClean;
  const nameSame = (x: string, y: string) => similarity(x, y) >= 0.75;
  let p = passport;
  // Noisy MRZ names that still contain the card's name: not a real conflict. Use the card's
  // spelling and recover the patronymic from what follows it.
  if (p && !namesReliable && fromCard?.lastName && fromCard.firstName) {
    const noisy = [p.lastName, p.firstName, p.middleName].filter(Boolean).join("").replace(/\s/g, "");
    const rest = remainderAfter(noisy, [fromCard.lastName, fromCard.firstName]);
    if (rest !== null) {
      p = { ...p, lastName: fromCard.lastName, firstName: fromCard.firstName, middleName: fromCard.middleName ?? (rest || undefined) };
      if (!fromCard.middleName && rest) merged.uncertain.push("middleName");
    }
  }
  if (p && !namesReliable && fromCard) {
    // Unreadable passport names are not a disagreement: the card's name is used as is.
    p = { ...p, lastName: fromCard.lastName, firstName: fromCard.firstName, middleName: fromCard.middleName ?? p.middleName };
  }
  pick("lastName", p?.lastName, fromCard?.lastName, namesReliable, nameSame);
  pick("firstName", p?.firstName, fromCard?.firstName, namesReliable, nameSame);
  pick("middleName", p?.middleName, fromCard?.middleName, namesReliable || !fromCard?.middleName, nameSame);

  pick("birthDate", passport?.birthDate, arc?.birthDate, !!passport?.birthDateOk, (x, y) => x === y);
  pick("gender", passport?.gender, arc?.gender, false, (x, y) => x === y);
  set("passportNumber", passport?.passportNumber, "passport");
  pick("citizenship", passport?.citizenship, arc?.citizenship, true, (x, y) => x === y);
  set("arcNumber", arc?.arcNumber, "arc");
  set("visaType", arc?.visaType, "arc");

  const unconfirmed = (field: MergedField, ok: boolean) => {
    if (merged.values[field] && merged.sources[field] !== "both" && !ok && !merged.uncertain.includes(field)) merged.uncertain.push(field);
  };
  unconfirmed("passportNumber", !!passport?.numberOk);
  unconfirmed("birthDate", !!passport?.birthDateOk || merged.sources.birthDate === "arc");
  for (const f of ["lastName", "firstName", "middleName"] as const) unconfirmed(f, namesReliable || merged.sources[f] === "arc");
  return merged;
}
