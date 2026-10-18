export type University = {
  id: string;
  ko: string;
  uz: string;
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
