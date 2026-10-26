"use client";

import { useState } from "react";
import { adminFields, schoolTypes, type AdminData } from "@/lib/admin-fields";
import { saveAdminData } from "./actions";

/** The admin-only "Shablon uchun" columns of one application, saved without reloading the list. */
export function AdminDataForm({ id, initial }: { id: string; initial: AdminData }) {
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");

  async function save(formData: FormData) {
    setStatus("saving");
    const result = await saveAdminData(formData).catch(() => ({ ok: false }));
    setStatus(result.ok ? "saved" : "error");
  }

  return <form className="admin-extra" action={save} onChange={() => status === "saved" && setStatus("")}>
    <h3>Shablon uchun qo‘shimcha ma’lumotlar</h3>
    <input type="hidden" name="id" value={id}/>
    <div className="admin-extra-grid">
      {adminFields.map((f) => <label key={f.key}>
        <span>{f.label} <small>{f.header}</small></span>
        {f.type === "select"
          ? <select name={f.key} defaultValue={initial[f.key] ?? ""}><option value="">—</option>{schoolTypes.map((t) => <option key={t}>{t}</option>)}</select>
          : <input name={f.key} type={f.type} defaultValue={initial[f.key] ?? ""} placeholder={f.placeholder} maxLength={200}/>}
      </label>)}
    </div>
    <div className="admin-extra-actions">
      <button type="submit" disabled={status === "saving"}>{status === "saving" ? "Saqlanmoqda..." : "Saqlash"}</button>
      {status === "saved" && <span className="ok">✓ Saqlandi</span>}
      {status === "error" && <span className="err">Saqlab bo‘lmadi. Qayta kiring va urinib ko‘ring.</span>}
    </div>
  </form>;
}
