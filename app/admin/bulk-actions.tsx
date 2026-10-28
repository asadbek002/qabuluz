"use client";

import { useEffect, useState } from "react";
import { deleteApplications } from "./actions";

const rowBoxes = () => [...document.querySelectorAll<HTMLInputElement>('input[form="bulk"][name="id"]')];

/**
 * Export / delete toolbar for the admin list. Row checkboxes live in the server-rendered list
 * and join this form through form="bulk"; nothing ticked exports the whole filtered list.
 */
export function BulkActions({ q, university, status, total }: { q?: string; university?: string; status?: string; total: number }) {
  const [selected, setSelected] = useState(0);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const count = () => setSelected(rowBoxes().filter((box) => box.checked).length);
    const close = (e: MouseEvent) => { if (!(e.target as Element).closest?.(".export-menu")) setMenu(false); };
    document.addEventListener("change", count);
    document.addEventListener("click", close);
    return () => { document.removeEventListener("change", count); document.removeEventListener("click", close); };
  }, []);

  function toggleAll(checked: boolean) {
    rowBoxes().forEach((box) => { box.checked = checked; });
    setSelected(checked ? rowBoxes().length : 0);
  }

  return <form id="bulk" className="admin-head-actions">
    {q && <input type="hidden" name="q" value={q}/>}
    {university && <input type="hidden" name="university" value={university}/>}
    {status && <input type="hidden" name="status" value={status}/>}
    <label className="select-all"><input type="checkbox" checked={total > 0 && selected === total} onChange={(e) => toggleAll(e.target.checked)}/> Hammasi</label>
    <span>{selected ? `${selected} / ${total} ta tanlandi` : `${total} ta ariza`}</span>
    <button type="submit" className="delete-button" disabled={!selected} formAction={deleteApplications}
      onClick={(e) => { if (!confirm(`${selected} ta ariza va ularning hujjatlari butunlay o‘chiriladi. Davom etasizmi?`)) e.preventDefault(); }}>
      O‘chirish
    </button>
    <div className="export-menu">
      <button type="button" className="export-button" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
        {selected ? "Tanlanganlarni Excel’ga" : "Excel yuklab olish"} ▾
      </button>
      {menu && <div className="export-options">
        <button type="submit" name="format" value="university" formMethod="get" formAction="/api/applications/export" onClick={() => setTimeout(() => setMenu(false))}>
          <strong>Universitet uchun</strong><small>Ariza shakli (A–Q ustunlar)</small>
        </button>
        <button type="submit" name="format" value="template" formMethod="get" formAction="/api/applications/export" onClick={() => setTimeout(() => setMenu(false))}>
          <strong>Shablon uchun</strong><small>+ vasiy, ID muddati, maktab, baholar…</small>
        </button>
      </div>}
    </div>
  </form>;
}
