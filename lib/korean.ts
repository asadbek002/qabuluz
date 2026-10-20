// Korean renderings used by the admin Excel export (the universities' own applicant template).

// ---------------------------------------------------------------------------------------------
// Name transliteration: Uzbek/Russian names (Latin or Cyrillic) -> Hangul, following the usual
// Korean loanword conventions (Aliyev -> 알리예프, Muhammad -> 무함마드, Islom -> 이슬롬).
// It is a phonetic approximation; staff can still correct the cell in Excel.
// ---------------------------------------------------------------------------------------------

const cyrillic: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", ғ: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y",
  к: "k", қ: "q", л: "l", м: "m", н: "n", о: "o", ў: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "x", ҳ: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
};

type Phone = { kind: "V"; v: string } | { kind: "C"; c: string };

const vowels = "aeiou";

function toPhones(word: string): Phone[] {
  let s = word.toLowerCase().replace(/[а-яёўқғҳ]/g, (ch) => cyrillic[ch] ?? "");
  s = s.replace(/[‘’ʻʼ'`]/g, ""); // o‘ -> o, g‘ -> g, tutuq belgisi
  s = s.replace(/[^a-z]/g, "");
  const out: Phone[] = [];
  for (let i = 0; i < s.length; ) {
    const two = s.slice(i, i + 2);
    const three = s.slice(i, i + 3);
    if (three === "tch") { out.push({ kind: "C", c: "ch" }); i += 3; continue; }
    if (["sh", "ch", "kh", "zh", "ts", "ph"].includes(two)) {
      out.push({ kind: "C", c: two === "kh" ? "x" : two === "zh" ? "j" : two === "ph" ? "f" : two });
      i += 2; continue;
    }
    if (two === "ng" && !vowels.includes(s[i + 2] ?? "")) { out.push({ kind: "C", c: "ng" }); i += 2; continue; }
    const ch = s[i];
    if (vowels.includes(ch)) out.push({ kind: "V", v: ch });
    else if (ch === "y") {
      const next = s[i + 1];
      if (next && vowels.includes(next) && next !== "i") { out.push({ kind: "V", v: "y" + next }); i += 2; continue; }
      if (next === "i") { i += 1; continue; } // "yi" -> i
      // y after a vowel and before a consonant/end is the vowel "i" (Khayrullo -> 하이룰로)
      if (out.at(-1)?.kind === "V") out.push({ kind: "V", v: "i" });
    } else if (ch === "w") out.push({ kind: "V", v: "u" });
    else out.push({ kind: "C", c: ch === "c" ? "k" : ch });
    i += 1;
  }
  // Doubled consonants are written once (Sattarov -> 사타로프); ll/mm/nn stay (Abdulla -> 압둘라, Muhammad -> 무함마드).
  for (let i = out.length - 1; i > 0; i--) {
    const cur = out[i], prev = out[i - 1];
    if (cur.kind === "C" && prev.kind === "C" && cur.c === prev.c && !["l", "m", "n"].includes(cur.c)) out.splice(i, 1);
  }
  // Word-final -v is voiceless in -ov/-ev surnames (Karimov -> 카리모프).
  const last = out.at(-1);
  if (last?.kind === "C" && last.c === "v") out[out.length - 1] = { kind: "C", c: "f" };
  // A vowel directly followed by "e" sounds like "ye" (Abdullaev -> 압둘라예프).
  for (let i = 1; i < out.length; i++) {
    const cur = out[i], prev = out[i - 1];
    if (cur.kind === "V" && cur.v === "e" && prev.kind === "V") out[i] = { kind: "V", v: "ye" };
  }
  return out;
}

const L: Record<string, number> = { g: 0, n: 2, d: 3, l: 5, r: 5, m: 6, b: 7, v: 7, s: 9, z: 12, j: 12, ch: 14, ts: 14, k: 15, q: 15, t: 16, p: 17, f: 17, h: 18, x: 18, "": 11 };
const V: Record<string, number> = { a: 0, ya: 2, e: 5, ye: 7, o: 8, yo: 12, u: 13, yu: 17, eu: 18, i: 20 };
const T: Record<string, number> = { "": 0, k: 1, n: 4, l: 8, m: 16, b: 17, p: 17, ng: 21 };
// Consonants that may close a syllable when followed by another consonant or the word end.
const codaBeforeConsonant = new Set(["n", "l", "m", "ng", "k", "b", "p"]);
const codaAtEnd = new Set(["n", "l", "m", "ng", "k", "b", "p"]);

type Syllable = { onset: string; vowel: string; coda: string };

function syllable(onset: string, vowel: string): Syllable {
  // sh/sha -> 샤, she -> 셰, shu -> 슈 ...
  if (onset === "sh") {
    const glide: Record<string, string> = { a: "ya", o: "yo", u: "yu", e: "ye", eu: "yu" };
    return { onset: "s", vowel: glide[vowel] ?? vowel, coda: "" };
  }
  return { onset, vowel, coda: "" };
}

function compose({ onset, vowel, coda }: Syllable) {
  const l = L[onset] ?? 11, v = V[vowel] ?? 18, t = T[coda] ?? 0;
  return String.fromCharCode(0xac00 + (l * 21 + v) * 28 + t);
}

export function toHangulWord(word: string): string {
  const phones = toPhones(word);
  const syllables: Syllable[] = [];
  let pending: string[] = [];

  const flushConsonants = (beforeVowel: boolean) => {
    // Every consonant except (possibly) the last one before a vowel closes the previous
    // syllable or becomes its own "ㅡ" syllable.
    const keep = beforeVowel ? pending.pop() : undefined;
    pending.forEach((c, idx) => {
      const prev = syllables.at(-1);
      const isLast = idx === pending.length - 1;
      const next = isLast ? keep : pending[idx + 1];
      const allowed = beforeVowel || !isLast ? codaBeforeConsonant : codaAtEnd;
      // Stops stay a separate syllable before l/r (Ibrohim -> 이브로힘, Akrom -> 아크롬).
      const beforeLiquid = (next === "l" || next === "r") && ["k", "b", "p"].includes(c);
      if (prev && !prev.coda && allowed.has(c) && !beforeLiquid) { prev.coda = c; return; }
      if (c === "sh") { syllables.push({ onset: "s", vowel: !beforeVowel && isLast ? "i" : "yu", coda: "" }); return; }
      if (c === "ch" || c === "j") { syllables.push({ onset: c, vowel: "i", coda: "" }); return; }
      if (c === "ng") { syllables.push({ onset: "", vowel: "eu", coda: "ng" }); return; }
      syllables.push({ onset: c, vowel: "eu", coda: "" });
    });
    pending = [];
    return keep;
  };

  for (const p of phones) {
    if (p.kind === "C") { pending.push(p.c); continue; }
    const onset = flushConsonants(true) ?? "";
    // An intervocalic "l" doubles in Korean (Ali -> 알리, Islom -> 이슬롬).
    const prev = syllables.at(-1);
    if (onset === "l" && prev && !prev.coda) prev.coda = "l";
    syllables.push(syllable(onset === "ng" ? "n" : onset, p.v));
  }
  flushConsonants(false);
  return syllables.map(compose).join("");
}

export function toHangulName(...parts: string[]) {
  return parts.join(" ").split(/[\s-]+/).filter(Boolean).map(toHangulWord).filter(Boolean).join(" ");
}

/** Name as it appears in an Uzbek passport's Latin line (O‘ -> O, X -> KH). */
export function toPassportLatin(...parts: string[]) {
  return parts.join(" ").replace(/[а-яёўқғҳ]/gi, (ch) => {
    const lower = ch.toLowerCase();
    return cyrillic[lower] === "x" ? "kh" : cyrillic[lower] ?? "";
  })
    .replace(/[‘’ʻʼ'`]/g, "")
    .replace(/x/gi, "KH")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// ---------------------------------------------------------------------------------------------
// Value dictionaries (Uzbek form values -> Korean).
// Department names are working translations: check them against each university's official
// department list and adjust here if needed.
// ---------------------------------------------------------------------------------------------

export const countryKo: Record<string, string> = {
  "O‘zbekiston": "우즈베키스탄", "Qozog‘iston": "카자흐스탄", "Qirg‘iziston": "키르기스스탄", "Tojikiston": "타지키스탄",
  "Turkmaniston": "투르크메니스탄", "Ozarbayjon": "아제르바이잔", "Armaniston": "아르메니아", "Belarus": "벨라루스",
  "Moldova": "몰도바", "Rossiya": "러시아", "Ukraina": "우크라이나",
};

export const genderKo: Record<string, string> = { Erkak: "남", Ayol: "여" };

export const trackKo: Record<string, string> = { "Koreys tilida o‘qish": "한국어트랙", "Ingliz tilida o‘qish": "영어트랙" };

export const admissionKo: Record<string, string> = {
  "1-kurs": "신입학", "3-kursdan o‘qishni ko‘chirish": "3학년 편입", "4-kursdan o‘qishni ko‘chirish": "4학년 편입", Magistratura: "석사",
};

export const semesterKo: Record<string, string> = { "2027-yil mart": "2027년 3월", "2027-yil sentabr": "2027년 9월" };

export const campusKo: Record<string, string> = {
  Cheongju: "청주", Yangju: "양주", Imsil: "임실", Seoul: "서울", Gwangju: "광주", Paju: "파주", Ansan: "안산", Hongseong: "홍성", Incheon: "인천",
};

export const visaKo: Record<string, string> = { "Koreyada yashamayman": "국외 거주", Boshqa: "기타" };

export const programKo: Record<string, string> = {
  "Aqlli kompyuter va elektronika (IT)": "스마트컴퓨터전자과",
  "Mehmonxona ishi, barista va kafe": "호텔바리스타카페과",
  "K-kultura biznesi": "K-컬처비즈니스과",
  "Mehmonxona oshpazligi va qandolatchilik": "호텔조리제과제빵과",
  "Tibbiy kosmetologiya": "의료뷰티과",
  "Aviatsiya, avtomobil va mobil texnologiyalar": "항공자동차모빌리티과",
  "Aviatsiya xavfsizligi": "항공보안과",
  "Jismoniy tarbiya va sport": "생활체육과",
  "Elektr texnikasi": "전기과",
  "Politsiya boshqaruvi": "경찰행정과",
  "Xalqaro menejment": "국제경영학과",
  "Global madaniyat va san’at menejmenti": "글로벌문화예술경영학과",
  "Yo‘nalishni maslahatchi bilan tanlayman": "상담 후 결정",
  "Magistratura — yo‘nalishni maslahatchi bilan tanlayman": "석사 (상담 후 결정)",
};

export function languageScoreKo(type: string, level: string) {
  if (type === "TOPIK") return `TOPIK ${level.replace("-daraja", "급")}`;
  if (type === "KIIP") return `KIIP ${level.replace("-bosqich", "단계")}`;
  if (type === "IELTS") return `IELTS ${level.replace(" ball", "")}`;
  return "없음";
}

/** +821012345678 -> 010-1234-5678 */
export function phoneKo(phone: string) {
  const m = /^\+82(10)(\d{4})(\d{4})$/.exec(phone);
  return m ? `0${m[1]}-${m[2]}-${m[3]}` : phone;
}
