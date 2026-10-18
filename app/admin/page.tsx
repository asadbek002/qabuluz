import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { universities } from "@/lib/universities";
import { isAdmin } from "@/lib/admin-auth";
import { login, logout } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string; university?: string; q?: string }> }) {
  const params = await searchParams;
  if (!await isAdmin()) return <main className="admin-login"><form action={login}>
    <div className="brand admin-brand"><span className="brand-mark">A</span><span>Admin panel</span></div>
    <h1>Kirish</h1><p>Arizalarni ko‘rish uchun parolni kiriting.</p>
    <input name="password" type="password" placeholder="Admin paroli" required/>
    {params.error && <div className="error">{params.error === "limit" ? "Juda ko‘p urinish. 15 daqiqadan so‘ng qayta urinib ko‘ring." : "Parol noto‘g‘ri."}</div>}
    <button className="primary">Kirish</button>
  </form></main>;

  const all = await getDb().select().from(applications).orderBy(desc(applications.createdAt));
  const exportQuery = new URLSearchParams();
  if (params.university) exportQuery.set("university", params.university);
  if (params.q) exportQuery.set("q", params.q);
  const exportHref = "/api/applications/export" + (exportQuery.size ? "?" + exportQuery.toString() : "");
  const filtered = all.filter((a) => (!params.university || a.universityId === params.university) && (!params.q || `${a.firstName} ${a.lastName} ${a.middleName} ${a.phone} ${a.applicationNo}`.toLowerCase().includes(params.q.toLowerCase())));
  return <main className="admin-shell">
    <aside className="admin-side"><div className="brand"><span className="brand-mark">A</span><span>Admin panel</span></div><nav><a className="active" href="/admin">Barcha arizalar <b>{all.length}</b></a><Link href="/">Talaba sahifasi</Link></nav><form action={logout}><button>Chiqish</button></form></aside>
    <section className="admin-main">
      <div className="admin-head"><div><p className="eyebrow">Boshqaruv</p><h1>Talabalar arizalari</h1></div><div className="admin-head-actions"><span>{filtered.length} ta ariza</span><a className="export-button" href={exportHref}>Excel yuklab olish</a></div></div>
      <form className="filters"><input name="q" defaultValue={params.q} placeholder="Ism, telefon yoki ariza raqami"/><select name="university" defaultValue={params.university || ""}><option value="">Barcha universitetlar</option>{universities.map(u=><option value={u.id} key={u.id}>{u.ko} — {u.uz}</option>)}</select><button>Qidirish</button></form>
      <div className="application-list">
        {filtered.map((a) => { const u=universities.find(u=>u.id===a.universityId); const docs=parseDocs(a.documents); return <details className="application-row" key={a.id}>
          <summary><div><strong>{a.lastName} {a.firstName}</strong><span>{a.applicationNo}</span></div><div><strong>{u?.ko || a.universityId}</strong><span>{a.campus} · {a.program}</span></div><div><strong>{a.languageType}: {a.languageLevel}</strong><span>{new Date(a.createdAt).toLocaleDateString("uz-UZ")}</span></div></summary>
          <div className="application-detail">
            <Info title="Shaxsiy ma’lumotlar" rows={[["F.I.Sh.",`${a.lastName} ${a.firstName} ${a.middleName}`],["Tug‘ilgan sana",a.birthDate],["Jinsi",a.gender],["Fuqaroligi",a.citizenship],["Telefon",a.phone],["Telegram",a.telegram],["E-mail",a.email],["Manzil",a.address],["Viza",a.visaType],["Pasport",a.passportNumber],["ID karta",a.arcNumber || "—"]]}/>
            <Info title="Ta’lim va dastur" rows={[["Ta’lim muassasasi",a.previousSchool],["Qabul turi",a.admissionType],["Til sertifikati",`${a.languageType}: ${a.languageLevel}`],["Universitet",`${u?.ko} — ${u?.uz}`],["Kampus",a.campus],["Yo‘nalish",a.program],["Ta’lim tili",a.track],["Semestr",a.semester]]}/>
            <div className="admin-docs"><h3>Hujjatlar</h3>{Object.keys(docs).length ? Object.entries(docs).map(([field,d])=><a key={field} href={`/api/documents/${a.id}/${field}`} target="_blank" rel="noopener noreferrer">{d.name}</a>) : <span>Hujjat yuklanmagan</span>}</div>
          </div>
        </details>})}
        {!filtered.length && <div className="empty-admin">Arizalar topilmadi.</div>}
      </div>
    </section>
  </main>;
}

function Info({title,rows}:{title:string;rows:(string|null)[][]}) {
  return <div className="admin-info"><h3>{title}</h3>{rows.map(([k,v])=><div key={k!}><span>{k}</span><strong>{v || "—"}</strong></div>)}</div>;
}

function parseDocs(value: string): Record<string, { name: string }> {
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}
