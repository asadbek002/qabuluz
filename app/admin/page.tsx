import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { universities } from "@/lib/universities";
import { isAdmin } from "@/lib/admin-auth";
import { toHangulName } from "@/lib/korean";
import { arcMatchesBirthDate } from "@/lib/ocr/parse";
import { login, logout } from "./actions";
import { BulkActions } from "./bulk-actions";
import { AdminDataForm } from "./admin-data-form";
import { parseAdminData } from "@/lib/admin-fields";

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
  const filtered = all.filter((a) => (!params.university || a.universityId === params.university) && (!params.q || `${a.firstName} ${a.lastName} ${a.middleName} ${a.phone} ${a.applicationNo}`.toLowerCase().includes(params.q.toLowerCase())));
  return <main className="admin-shell">
    <aside className="admin-side"><div className="brand"><span className="brand-mark">A</span><span>Admin panel</span></div><nav><a className="active" href="/admin">Barcha arizalar <b>{all.length}</b></a><Link href="/">Talaba sahifasi</Link></nav><form action={logout}><button>Chiqish</button></form></aside>
    <section className="admin-main">
      <div className="admin-head"><div><p className="eyebrow">Boshqaruv</p><h1>Talabalar arizalari</h1></div><BulkActions q={params.q} university={params.university} total={filtered.length}/></div>
      <form className="filters"><input name="q" defaultValue={params.q} placeholder="Ism, telefon yoki ariza raqami"/><select name="university" defaultValue={params.university || ""}><option value="">Barcha universitetlar</option>{universities.map(u=><option value={u.id} key={u.id}>{u.ko} — {u.uz}</option>)}</select><button>Qidirish</button></form>
      <div className="application-list">
        {filtered.map((a) => { const u=universities.find(u=>u.id===a.universityId); const docs=parseDocs(a.documents); const checks=ocrChecks(a); const mismatches=checks.filter(c=>c.status==="diff").length; return <div className="application-item" key={a.id}><input type="checkbox" form="bulk" name="id" value={a.id} aria-label={`${a.lastName} ${a.firstName} — tanlash`}/><details className="application-row">
          <summary><div><strong>{a.lastName} {a.firstName} {a.middleName}</strong><span>{a.applicationNo}</span></div><div><strong>{u?.ko || a.universityId}</strong><span>{a.campus} · {a.program}</span></div><div><strong>{a.languageType}: {a.languageLevel}</strong><span>{new Date(a.createdAt).toLocaleDateString("uz-UZ")}{mismatches ? ` · ⚠ ${mismatches} ta farq` : ""}</span></div></summary>
          <div className="application-detail">
            <Info title="Shaxsiy ma’lumotlar" rows={[["F.I.Sh.",`${a.lastName} ${a.firstName} ${a.middleName}`],["Koreyscha ism",toHangulName(a.lastName, a.firstName, a.middleName)],["Tug‘ilgan sana",a.birthDate],["Jinsi",a.gender],["Fuqaroligi",a.citizenship],["Telefon",a.phone],["E-mail",a.email],...optional([["Telegram",a.telegram],["Manzil",a.address]]),["Viza",a.visaType],["Pasport",a.passportNumber],["ID karta",a.arcNumber || "—"]]}/>
            <Info title="Ta’lim va dastur" rows={[...optional([["Ta’lim muassasasi",a.previousSchool],["Bitirgan sana",a.graduationDate]]),["Qabul turi",a.admissionType],["Til sertifikati",`${a.languageType}: ${a.languageLevel}`],["Universitet",`${u?.ko} — ${u?.uz}`],["Kampus",a.campus],["Yo‘nalish",a.program],["Ta’lim tili",a.track],["Semestr",a.semester]]}/>
            <div className="admin-docs"><h3>Hujjat bilan solishtirish</h3>{checks.length ? <table className="ocr-table"><thead><tr><th>Maydon</th><th>Arizada</th><th>Hujjatda (OCR)</th><th></th></tr></thead><tbody>{checks.map(c=><tr key={c.label} className={c.status}><td>{c.label}</td><td>{c.submitted || "—"}</td><td>{c.read || "—"}</td><td>{c.status==="same" ? "✓ mos" : c.status==="diff" ? "⚠ o‘zgartirilgan" : "o‘qilmagan"}</td></tr>)}</tbody></table> : <span>Hujjatdan avtomatik o‘qilmagan (qo‘lda kiritilgan).</span>}</div>
            <AdminDataForm id={a.id} initial={parseAdminData(a.adminData)}/>
            <div className="admin-docs"><h3>Hujjatlar</h3>{Object.keys(docs).length ? Object.entries(docs).map(([field,d])=><a key={field} href={`/api/documents/${a.id}/${field}`} target="_blank" rel="noopener noreferrer">{d.name}</a>) : <span>Hujjat yuklanmagan</span>}</div>
          </div>
        </details></div>})}
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

const passportLabels: [string, string][] = [["lastName","Familiya"],["firstName","Ism"],["middleName","Otchestvo"],["passportNumber","Pasport raqami"],["birthDate","Tug‘ilgan sana"],["gender","Jinsi"],["citizenship","Fuqarolik"]];

type Application = typeof applications.$inferSelect;
type Check = { label: string; submitted: string; read?: string; status: "same" | "diff" | "missing" };

/** Compare what the student submitted with what OCR read from the uploaded documents. */
function ocrChecks(a: Application): Check[] {
  let ocr: { passport?: Record<string, string>; arc?: Record<string, string>; merged?: Record<string, string>; sources?: Record<string, string> } = {};
  try { ocr = JSON.parse(a.ocrData || "{}"); } catch {}
  const norm = (v?: string | null) => (v || "").toUpperCase().replace(/\s+/g, " ").trim();
  const sourceLabel: Record<string, string> = { passport: "pasport", arc: "ID karta", both: "pasport + ID karta" };
  const row = (label: string, submitted: string | null, read?: string, source?: string): Check =>
    ({ label: source ? `${label} (${sourceLabel[source] ?? source})` : label, submitted: submitted || "", read, status: !read ? "missing" : norm(read) === norm(submitted) ? "same" : "diff" });
  const out: Check[] = [];
  // Newer applications store the passport + ID card values combined; older ones only the passport.
  const read = ocr.merged ?? ocr.passport;
  if (read) for (const [key, label] of passportLabels) out.push(row(label, a[key as keyof Application] as string, read[key], ocr.sources?.[key]));
  const arc = ocr.merged ?? ocr.arc;
  if (ocr.arc || ocr.merged?.arcNumber) {
    out.push(row("ID karta raqami", a.arcNumber, arc?.arcNumber, ocr.sources?.arcNumber));
    out.push(row("Viza", a.visaType, arc?.visaType, ocr.sources?.visaType));
  }
  if (a.arcNumber && /^\d{6}-\d{7}$/.test(a.arcNumber) && !arcMatchesBirthDate(a.arcNumber, a.birthDate)) {
    out.push({ label: "ID raqam ↔ tug‘ilgan sana", submitted: a.birthDate, read: a.arcNumber.slice(0, 6), status: "diff" });
  }
  return out;
}

/** Fields the form no longer asks for: shown only on older applications that have them. */
function optional(rows: [string, string | null][]) {
  return rows.filter(([, v]) => v);
}
