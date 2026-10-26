"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toHangulName } from "@/lib/korean";
import { admissionTypesFor, editableKeys, type ApplicationEdit } from "@/lib/application-edit";
import { certificateLevels, cisCountries, genders, languageTypes, mastersProgram, semesters, universities, visaCodes } from "@/lib/universities";
import { updateApplication } from "./actions";

type Legacy = { telegram?: string | null; address?: string | null; previousSchool?: string | null; graduationDate?: string | null };

/** "Shaxsiy ma’lumotlar" and "Ta’lim va dastur" blocks, editable by the admin. */
export function ApplicationEditor({ id, initial, legacy }: { id: string; initial: ApplicationEdit; legacy: Legacy }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const university = universities.find((u) => u.id === form.universityId);

  function set(key: keyof ApplicationEdit, value: string) {
    setForm((old) => {
      const next = { ...old, [key]: value };
      const u = universities.find((x) => x.id === next.universityId);
      if (key === "universityId" && u) {
        // Keep what still exists at the new university, otherwise its first option.
        if (!u.campuses.includes(next.campus)) next.campus = u.campuses[0];
        if (!u.tracks.includes(next.track)) next.track = u.tracks[0];
        if (!admissionTypesFor(u.id).includes(next.admissionType)) next.admissionType = "1-kurs";
      }
      if (key === "admissionType" || key === "universityId") {
        if (next.admissionType === "Magistratura" && old.admissionType !== "Magistratura") next.program = mastersProgram;
        if (next.admissionType !== "Magistratura" && next.program === mastersProgram) next.program = u?.programs[0] ?? "";
      }
      if (key === "languageType") next.languageLevel = value === "Mavjud emas" ? "Mavjud emas" : "";
      return next;
    });
    setError("");
  }

  async function save() {
    setBusy(true); setError("");
    const data = new FormData();
    data.append("id", id);
    for (const k of editableKeys) data.append(k, form[k] ?? "");
    const result = await updateApplication(data).catch(() => ({ ok: false, error: "Saqlab bo‘lmadi." }));
    setBusy(false);
    if (!result.ok) return setError(result.error || "Saqlab bo‘lmadi.");
    setSaved(form); setEditing(false);
    router.refresh(); // list summary (name, university) and mismatch table
  }

  const s = saved;
  const u = universities.find((x) => x.id === s.universityId);
  if (!editing) return <>
    <Info title="Shaxsiy ma’lumotlar" onEdit={() => { setForm(saved); setEditing(true); }} rows={[
      ["F.I.Sh.", `${s.lastName} ${s.firstName} ${s.middleName}`], ["Koreyscha ism", toHangulName(s.lastName, s.firstName, s.middleName)],
      ["Tug‘ilgan sana", s.birthDate], ["Jinsi", s.gender], ["Fuqaroligi", s.citizenship], ["Telefon", s.phone], ["E-mail", s.email],
      ...present([["Telegram", legacy.telegram], ["Manzil", legacy.address]]),
      ["Viza", s.visaType], ["Pasport", s.passportNumber], ["ID karta", s.arcNumber || "—"],
    ]}/>
    <Info title="Ta’lim va dastur" onEdit={() => { setForm(saved); setEditing(true); }} rows={[
      ...present([["Ta’lim muassasasi", legacy.previousSchool], ["Bitirgan sana", legacy.graduationDate]]),
      ["Qabul turi", s.admissionType], ["Til sertifikati", `${s.languageType}: ${s.languageLevel}`], ["Universitet", `${u?.ko} — ${u?.uz}`],
      ["Kampus", s.campus], ["Yo‘nalish", s.program], ["Ta’lim tili", s.track], ["Semestr", s.semester],
    ]}/>
  </>;

  const text = (key: keyof ApplicationEdit, label: string, type = "text") =>
    <label><span>{label}</span><input type={type} value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)}/></label>;
  const select = (key: keyof ApplicationEdit, label: string, options: string[], labels?: Record<string, string>) =>
    <label><span>{label}</span><select value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)}>
      {!options.includes(form[key]) && <option value={form[key]}>{form[key] || "Tanlang"}</option>}
      {options.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}
    </select></label>;
  const listId = `programs-${id}`;

  return <div className="admin-edit">
    <div className="admin-edit-section">
      <h3>Shaxsiy ma’lumotlar</h3>
      <div className="admin-extra-grid">
        {text("lastName", "Familiya")}{text("firstName", "Ism")}{text("middleName", "Otchestvo")}
        {text("birthDate", "Tug‘ilgan sana", "date")}{select("gender", "Jinsi", genders)}{select("citizenship", "Fuqaroligi", cisCountries)}
        {text("phone", "Telefon", "tel")}{text("email", "E-mail", "email")}
        {select("visaType", "Viza", [...visaCodes, "Boshqa"])}{text("passportNumber", "Pasport raqami")}{text("arcNumber", "ID karta raqami")}
      </div>
    </div>
    <div className="admin-edit-section">
      <h3>Ta’lim va dastur</h3>
      <div className="admin-extra-grid">
        {select("universityId", "Universitet", universities.map((x) => x.id), Object.fromEntries(universities.map((x) => [x.id, `${x.ko} — ${x.uz}`])))}
        {select("campus", "Kampus", university?.campuses ?? [])}
        {select("admissionType", "Qabul turi", admissionTypesFor(form.universityId))}
        <label className="wide"><span>Yo‘nalish (qo‘lda yozing yoki ro‘yxatdan tanlang)</span>
          <input list={listId} value={form.program} onChange={(e) => set("program", e.target.value)} maxLength={200}/>
          <datalist id={listId}>{[...(university?.programs ?? []), ...(form.admissionType === "Magistratura" ? [mastersProgram] : [])].map((p) => <option key={p} value={p}/>)}</datalist>
        </label>
        {select("track", "Ta’lim tili", university?.tracks ?? [])}{select("semester", "Semestr", semesters)}
        {select("languageType", "Til sertifikati", languageTypes)}
        {form.languageType === "Mavjud emas" ? <label><span>Darajasi</span><input value="Mavjud emas" disabled/></label> : select("languageLevel", "Darajasi", certificateLevels[form.languageType] ?? [])}
      </div>
    </div>
    <div className="admin-extra-actions">
      <button type="button" onClick={save} disabled={busy}>{busy ? "Saqlanmoqda..." : "Saqlash"}</button>
      <button type="button" className="ghost" onClick={() => { setEditing(false); setError(""); }} disabled={busy}>Bekor qilish</button>
      {error && <span className="err">{error}</span>}
    </div>
  </div>;
}

function present(rows: [string, string | null | undefined][]): [string, string][] {
  return rows.filter(([, v]) => v).map(([k, v]) => [k, v!]);
}

function Info({ title, rows, onEdit }: { title: string; rows: [string, string][]; onEdit: () => void }) {
  return <div className="admin-info">
    <h3>{title}<button type="button" className="edit-link" onClick={onEdit}>Tahrirlash</button></h3>
    {rows.map(([k, v]) => <div key={k}><span>{k}</span><strong>{v || "—"}</strong></div>)}
  </div>;
}
