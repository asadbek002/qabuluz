import { pgTable, text } from "drizzle-orm/pg-core";

export const applications = pgTable("applications", {
  id: text("id").primaryKey(),
  applicationNo: text("application_no").notNull().unique(),
  createdAt: text("created_at").notNull(),
  lastName: text("last_name").notNull(),
  firstName: text("first_name").notNull(),
  middleName: text("middle_name").notNull(),
  birthDate: text("birth_date").notNull(),
  gender: text("gender").notNull(),
  citizenship: text("citizenship").notNull(),
  phone: text("phone").notNull(),
  // telegram, address, previous_school, graduation_date: no longer asked on the form (kept for older applications)
  telegram: text("telegram"),
  email: text("email").notNull(),
  address: text("address"),
  visaType: text("visa_type").notNull(),
  previousSchool: text("previous_school"),
  graduationDate: text("graduation_date"),
  admissionType: text("admission_type").notNull(),
  languageType: text("language_type").notNull(),
  languageLevel: text("language_level").notNull(),
  passportNumber: text("passport_number").notNull(),
  arcNumber: text("arc_number"),
  universityId: text("university_id").notNull(),
  campus: text("campus").notNull(),
  program: text("program").notNull(),
  track: text("track").notNull(),
  semester: text("semester").notNull(),
  documents: text("documents").notNull().default("{}"),
  /** Values read from the uploaded passport / residence card (JSON), to flag manual edits. */
  ocrData: text("ocr_data"),
  /** Extra template columns the admin fills in on the dashboard (JSON, see lib/admin-fields.ts). */
  adminData: text("admin_data"),
  /** When the admin marked the application as sent to the university ("Done"); null = still in work. */
  doneAt: text("done_at"),
});
