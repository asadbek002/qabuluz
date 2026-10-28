// How much of an application the admin has filled in for the Excel exports. Fields the student
// must submit are always present, so only the ones that can be empty are counted.
import type { applications } from "@/db/schema";
import { adminFields, parseAdminData } from "@/lib/admin-fields";

type Application = typeof applications.$inferSelect;

export type CompletionStatus = "full" | "partial" | "empty";
export const statusLabels: Record<CompletionStatus, string> = { full: "To‘liq", partial: "Qisman", empty: "To‘ldirilmagan" };

export function completeness(a: Application) {
  const data = parseAdminData(a.adminData);
  const fields: [label: string, value: unknown][] = [
    ["ID karta raqami", a.arcNumber],
    ["Bitirgan maktab / universitet", a.previousSchool],
    ["Bitirgan sana", a.graduationDate || data.graduationDate],
    ["Manzil", a.address],
    ...adminFields.filter((f) => !f.fromApplication).map((f) => [`${f.header}`, data[f.key]] as [string, unknown]),
  ];
  const missing = fields.filter(([, v]) => !String(v ?? "").trim()).map(([label]) => label);
  const filled = fields.length - missing.length;
  const percent = Math.round((filled / fields.length) * 100);
  // "To‘ldirilmagan": nothing beyond what the student sent (the ARC number alone does not count).
  const status: CompletionStatus = !missing.length ? "full" : filled <= (a.arcNumber ? 1 : 0) ? "empty" : "partial";
  return { filled, total: fields.length, percent, missing, status };
}
