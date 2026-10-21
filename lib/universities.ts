export type University = {
  id: string;
  ko: string;
  uz: string;
  en: string;
  location: string;
  campuses: string[];
  duration: string;
  tracks: string[];
  programs: string[];
  hasMasters?: boolean;
  summary: string;
  accent: string;
};

export const universities: University[] = [
  {
    id: "chungcheong",
    ko: "충청대학교",
    uz: "Chung Cheong universiteti",
    en: "Chung Cheong University",
    location: "Cheongju",
    campuses: ["Cheongju"],
    duration: "2–3 yillik kasbiy ta’lim",
    tracks: ["Koreys tilida o‘qish", "Ingliz tilida o‘qish"],
    programs: ["Aqlli kompyuter va elektronika (IT)", "Mehmonxona ishi, barista va kafe", "K-kultura biznesi", "Mehmonxona oshpazligi va qandolatchilik", "Tibbiy kosmetologiya", "Aviatsiya, avtomobil va mobil texnologiyalar", "Aviatsiya xavfsizligi", "Jismoniy tarbiya va sport", "Elektr texnikasi", "Politsiya boshqaruvi"],
    summary: "Ichki imtihon mavjud. Haftada 2 kun dars.",
    accent: "#2563eb",
  },
  {
    id: "yewon",
    ko: "예원예술대학교",
    uz: "Yewon san’at universiteti",
    en: "Yewon Arts University",
    location: "Yangju / Imsil",
    campuses: ["Yangju", "Imsil"],
    duration: "4 yillik bakalavr",
    tracks: ["Koreys tilida o‘qish", "Ingliz tilida o‘qish"],
    programs: ["Xalqaro menejment", "Global madaniyat va san’at menejmenti"],
    hasMasters: true,
    summary: "Bakalavriat va magistratura qabuli mavjud. TOPIK bo‘lmasa ichki imtihon orqali topshirish mumkin.",
    accent: "#7c3aed",
  },
  {
    id: "induk",
    ko: "인덕대학교",
    uz: "Induk universiteti",
    en: "Induk University",
    location: "Seoul",
    campuses: ["Seoul"],
    duration: "2 yillik kasbiy ta’lim",
    tracks: ["Koreys tilida o‘qish", "Ingliz tilida o‘qish"],
    programs: ["Yo‘nalishni maslahatchi bilan tanlayman"],
    summary: "Seul shahrida joylashgan kasbiy ta’lim universiteti.",
    accent: "#0891b2",
  },
  {
    id: "seoyeong",
    ko: "서영대학교",
    uz: "Seoyeong universiteti",
    en: "Seoyeong University",
    location: "Gwangju / Paju",
    campuses: ["Gwangju", "Paju"],
    duration: "2 yillik kasbiy ta’lim",
    tracks: ["Koreys tilida o‘qish"],
    programs: ["Yo‘nalishni maslahatchi bilan tanlayman"],
    summary: "Gwangju va Paju kampuslaridan birini tanlash mumkin.",
    accent: "#059669",
  },
  {
    id: "shinansan",
    ko: "신안산대학교",
    uz: "Shin Ansan universiteti",
    en: "Shin Ansan University",
    location: "Ansan",
    campuses: ["Ansan"],
    duration: "2–3 yillik kasbiy ta’lim",
    tracks: ["Koreys tilida o‘qish"],
    programs: ["Yo‘nalishni maslahatchi bilan tanlayman"],
    summary: "Ansan shahrida joylashgan kasbiy ta’lim universiteti.",
    accent: "#ea580c",
  },
  {
    id: "chungwoon",
    ko: "청운대학교",
    uz: "Chungwoon universiteti",
    en: "Chungwoon University",
    location: "Hongseong / Incheon",
    campuses: ["Hongseong", "Incheon"],
    duration: "4 yillik bakalavr",
    tracks: ["Koreys tilida o‘qish", "Ingliz tilida o‘qish"],
    programs: ["Yo‘nalishni maslahatchi bilan tanlayman"],
    hasMasters: true,
    summary: "Bakalavriat, magistratura va o‘qishni ko‘chirish uchun ariza topshirish mumkin.",
    accent: "#dc2626",
  },
];

export const cisCountries = ["O‘zbekiston", "Qozog‘iston", "Qirg‘iziston", "Tojikiston", "Turkmaniston", "Ozarbayjon", "Armaniston", "Belarus", "Moldova", "Rossiya", "Ukraina"];

// Shared by the form and the API so server-side validation matches what the UI offers.
export const mastersProgram = "Magistratura — yo‘nalishni maslahatchi bilan tanlayman";
export const genders = ["Erkak", "Ayol"];
export const visaCodes = ["D-2", "D-4", "D-8", "D-10", "E-7", "E-9", "F-1", "F-2", "F-3", "F-4", "F-5", "F-6", "G-1", "H-2"];
export const visaTypes = [...visaCodes, "Boshqa"];
/** Any Korean status code read from a residence card, e.g. "C-3" or "F-2-7". */
export const visaCodePattern = /^[A-H]-\d{1,2}(-\d{1,2})?$/;
export const semesters = ["2027-yil mart", "2027-yil sentabr"];
export const baseAdmissionTypes = ["1-kurs", "3-kursdan o‘qishni ko‘chirish", "4-kursdan o‘qishni ko‘chirish"];
export const languageTypes = ["Mavjud emas", "TOPIK", "KIIP", "IELTS"];
export const certificateLevels: Record<string, string[]> = {
  TOPIK: ["1-daraja", "2-daraja", "3-daraja", "4-daraja", "5-daraja", "6-daraja"],
  KIIP: ["1-bosqich", "2-bosqich", "3-bosqich", "4-bosqich", "5-bosqich"],
  IELTS: Array.from({ length: 18 }, (_, i) => `${(i + 1) / 2} ball`),
};
