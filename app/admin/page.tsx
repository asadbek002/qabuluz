import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { universities } from "@/lib/universities";
import { isAdmin } from "@/lib/admin-auth";
import { arcMatchesBirthDate } from "@/lib/ocr/parse";
import { login, logout } from "./actions";
import { BulkActions } from "./bulk-actions";
import { AdminDataForm } from "./admin-data-form";
import { ApplicationEditor } from "./application-editor";
import { editableKeys, type ApplicationEdit } from "@/lib/application-edit";
import { parseAdminData } from "@/lib/admin-fields";
import { completeness, statusLabels, type CompletionStatus } from "@/lib/completeness";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string; university?: string; q?: string; status?: string }> }) {
  const params = await searchParams;
  if (!await isAdmin()) return <main className="admin-login"><form action={login}>
    <div className="brand admin-brand"><span className="brand-mark">A</span><span>Admin panel</span></div>
    <h1>Kirish</h1><p>Arizalarni ko‘rish uchun parolni kiriting.</p>
    <input name="password" type="password" placeholder="Admin paroli" required/>
    {params.error && <div className="error">{params.error === "limit" ? "Juda ko‘p urinish. 15 daqiqadan so‘ng qayta urinib ko‘ring." : "Parol noto‘g‘ri."}</div>}
    <button className="primary">Kirish</button>
  </form></main>;

  const all = await getDb().select().from(applications).orderBy(desc(applications.createdAt));
  const matching = all.filter((a) => (!params.university || a.universityId === params.university) && (!params.q || `${a.firstName} ${a.lastName} ${a.middleName} ${a.phone} ${a.applicationNo}`.toLowerCase().includes(params.q.toLowerCase())))
    .map((a) => ({ a, done: completeness(a) }));
  const counts = Object.fromEntries((["full", "partial", "empty"] as const).map((s) => [s, matching.filter((m) => m.done.status === s).length])) as Record<CompletionStatus, number>;
  const status = params.status && params.status in statusLabels ? params.status as CompletionStatus : undefined;
  const filtered = matching.filter((m) => !status || m.done.status === status);
  const statusHref = (s?: CompletionStatus) => {
    const q = new URLSearchParams();
    if (params.q) q.set("q", params.q);
    if (params.university) q.set("university", params.university);
    if (s) q.set("status", s);
    return "/admin" + (q.size ? "?" + q.toString() : "");
  };
  return <main className="admin-shell">
    <aside className="admin-side"><div className="brand"><span className="brand-mark">A</span><span>Admin panel</span></div><nav><a className="active" href="/admin">Barcha arizalar <b>{all.length}</b></a><Link href="/">Talaba sahifasi</Link></nav><form action={logout}><button>Chiqish</button></form></aside>
    <section className="admin-main">
      <div className="admin-head"><div><p className="eyebrow">Boshqaruv</p><h1>Talabalar arizalari</h1></div><BulkActions q={params.q} university={params.university} status={status} total={filtered.length}/></div>
      <form className="filters"><input name="q" defaultValue={params.q} placeholder="Ism, telefon yoki ariza raqami"/><select name="university" defaultValue={params.university || ""}><option value="">Barcha universitetlar</option>{universities.map(u=><option value={u.id} key={u.id}>{u.ko} — {u.uz}</option>)}</select>{status && <input type="hidden" name="status" value={status}/>}<button>Qidirish</button></form>
      <nav className="status-tabs" aria-label="To‘ldirilganlik holati">
        <a href={statusHref()} className={!status ? "active" : ""}>Hammasi <b>{matching.length}</b></a>
        {(["empty", "partial", "full"] as const).map((s) => <a key={s} href={statusHref(s)} className={`${s}${status === s ? " active" : ""}`}>{statusLabels[s]} <b>{counts[s]}</b></a>)}
      </nav>
      <div className="application-list">
        {filtered.map(({ a, done }) => { const u=universities.find(u=>u.id===a.universityId); const docs=parseDocs(a.documents); const checks=ocrChecks(a); const mismatches=checks.filter(c=>c.status==="diff").length; return <div className="application-item" key={a.id}><input type="checkbox" form="bulk" name="id" value={a.id} aria-label={`${a.lastName} ${a.firstName} — tanlash`}/><details className="application-row">
          <summary><div><strong>{a.lastName} {a.firstName} {a.middleName}</strong><span>{a.applicationNo}</span></div><div><strong>{u?.ko || a.universityId}</strong><span>{a.campus} · {a.program}</span></div><div><strong>{a.languageType}: {a.languageLevel}</strong><span>{new Date(a.createdAt).toLocaleDateString("uz-UZ")}{mismatches ? ` · ⚠ ${mismatches} ta farq` : ""}</span></div><div className={`completion ${done.status}`} title={done.missing.length ? `Yetishmayapti: ${done.missing.join(", ")}` : "Hammasi to‘ldirilgan"}><strong>{done.percent}% <em>{statusLabels[done.status]}</em></strong><span className="bar"><i style={{ width: `${done.percent}%` }}/></span></div></summary>
          <div className="application-detail">
            <div className={`completion-detail ${done.status}`}>{done.missing.length ? <><b>{done.filled}/{done.total} to‘ldirilgan.</b> Yetishmayapti: {done.missing.join(", ")}</> : <b>✓ Excel uchun barcha ma’lumotlar to‘ldirilgan.</b>}</div>
            <ApplicationEditor id={a.id} legacy={{ telegram: a.telegram }}
              initial={{ ...Object.fromEntries(editableKeys.map((k) => [k, a[k] ?? ""])), graduationDate: a.graduationDate || parseAdminData(a.adminData).graduationDate || "" } as ApplicationEdit}/>
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

