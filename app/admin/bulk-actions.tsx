"use client";

import { useEffect, useState } from "react";
import { deleteApplications } from "./actions";

const rowBoxes = () => [...document.querySelectorAll<HTMLInputElement>('input[form="bulk"][name="id"]')];

/**
 * Export / delete toolbar for the admin list. Row checkboxes live in the server-rendered list
 * and join this form through form="bulk"; nothing ticked exports the whole filtered list.
 */
export function BulkActions({ q, university, total }: { q?: string; university?: string; total: number }) {
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const count = () => setSelected(rowBoxes().filter((box) => box.checked).length);
    document.addEventListener("change", count);
    return () => document.removeEventListener("change", count);
  }, []);

  function toggleAll(checked: boolean) {
    rowBoxes().forEach((box) => { box.checked = checked; });
    setSelected(checked ? rowBoxes().length : 0);
  }

  return <form id="bulk" className="admin-head-actions">
    {q && <input type="hidden" name="q" value={q}/>}
    {university && <input type="hidden" name="university" value={university}/>}
    <label className="select-all"><input type="checkbox" checked={total > 0 && selected === total} onChange={(e) => toggleAll(e.target.checked)}/> Hammasi</label>
    <span>{selected ? `${selected} / ${total} ta tanlandi` : `${total} ta ariza`}</span>
    <button type="submit" className="delete-button" disabled={!selected} formAction={deleteApplications}
      onClick={(e) => { if (!confirm(`${selected} ta ariza va ularning hujjatlari butunlay o‘chiriladi. Davom etasizmi?`)) e.preventDefault(); }}>
      O‘chirish
    </button>
    <button type="submit" className="export-button" formMethod="get" formAction="/api/applications/export">
      {selected ? "Tanlanganlarni Excel’ga" : "Excel yuklab olish"}
    </button>
  </form>;
}
