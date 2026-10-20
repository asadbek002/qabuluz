"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, GraduationCap, MapPin, ShieldCheck, Upload } from "lucide-react";
import { compressImage } from "@/lib/compress-image";
import { baseAdmissionTypes, certificateLevels, cisCountries, genders, languageTypes, mastersProgram, semesters, universities, visaTypes } from "@/lib/universities";

const fieldLabels: Record<string, string> = {
  lastName: "Familiya", firstName: "Ism", middleName: "Otasining ismi",
  birthDate: "Tug‘ilgan sana", gender: "Jinsi", citizenship: "Fuqaroligi",
  phone: "Telefon raqami", telegram: "Telegram username", email: "Elektron pochta",
  address: "Hozirgi yashash manzili", visaType: "Viza turi",
  previousSchool: "Bitirgan maktab, kollej yoki universitet", graduationDate: "Bitirgan sana",
  admissionType: "Qabul turi", languageType: "Til sertifikati",
  languageLevel: "Darajasi yoki bali", passportNumber: "Xorijga chiqish pasporti raqami",
  arcNumber: "Koreya ID karta raqami", campus: "Kampus", program: "Yo‘nalish",
  track: "Ta’lim tili", semester: "Qabul semestri"
};

const requiredByStep: Record<number, string[]> = {
  1: [],
  2: ["campus", "program", "track", "semester"],
  3: ["lastName", "firstName", "middleName", "birthDate", "gender", "citizenship", "phone", "telegram", "email", "address", "visaType", "previousSchool", "graduationDate", "admissionType", "languageType", "languageLevel", "passportNumber"],
  4: [],
};

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export default function ApplicationForm() {
  const [step, setStep] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<Record<string, string>>({ semester: "2027-yil mart", admissionType: "1-kurs", languageType: "Mavjud emas", languageLevel: "Mavjud emas", phone: "+8210" });
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [applicationNo, setApplicationNo] = useState("");
  const stepsRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const university = useMemo(() => universities.find((u) => u.id === selectedId), [selectedId]);

  // Scroll after the new step has rendered: scrolling inside the click handler raced with the
  // re-render on mobile Safari and left the page near the (still focused) bottom button,
  // i.e. at the document uploads instead of the start of the form.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    (document.activeElement as HTMLElement | null)?.blur();
    const scroll = () => stepsRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    scroll();
    const frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [step]);

  function update(name: string, value: string) {
    setForm((old) => ({ ...old, [name]: value }));
    setError("");
  }

  async function pickFile(name: string, file: File | null) {
    setError("");
    if (!file) return setFiles((old) => ({ ...old, [name]: null }));
    setProcessing((old) => ({ ...old, [name]: true }));
    try {
      const ready = await compressImage(file).catch(() => file);
      if (ready.size > MAX_FILE_BYTES) {
        setFiles((old) => ({ ...old, [name]: null }));
        setError(`${file.name} fayli 20 MB dan katta. Kichikroq fayl tanlang.`);
      } else {
        setFiles((old) => ({ ...old, [name]: ready }));
      }
    } finally {
      setProcessing((old) => ({ ...old, [name]: false }));
    }
  }

  function next() {
    if (step === 1 && !selectedId) return setError("Davom etish uchun universitetni tanlang.");
    const missing = (requiredByStep[step] || []).find((name) => !form[name]?.trim());
    if (missing) return setError(`“${fieldLabels[missing]}” maydonini to‘ldiring.`);
    if (step === 3 && !/^\+8210\d{8}$/.test(form.phone || "")) {
      return setError("Telefon raqamini +8210 dan keyin 8 ta raqam bilan kiriting.");
    }
    if (step === 3 && form.visaType !== "Koreyada yashamayman" && !form.arcNumber?.trim()) {
      return setError("Koreyada yashasangiz, ID karta raqamini kiriting.");
    }
    setError("");
    setStep((s) => Math.min(4, s + 1));
  }

  async function submit() {
    if (!consent) return setError("Ma’lumotlarni qayta ishlashga rozilik bildiring.");
    if (Object.values(processing).some(Boolean)) return setError("Fayllar tayyorlanmoqda, biroz kuting.");
    const tooBig = Object.values(files).find((file) => file && file.size > MAX_FILE_BYTES);
    if (tooBig) return setError(`${tooBig.name} fayli 20 MB dan katta.`);
    setBusy(true); setError("");
    try {
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => data.append(key, value));
      data.append("universityId", selectedId);
      Object.entries(files).forEach(([key, file]) => file && data.append(key, file));
      const response = await fetch("/api/applications", { method: "POST", body: data });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; applicationNo?: string; error?: string };
      if (response.status === 413) throw new Error("Yuklangan fayllar hajmi juda katta.");
      if (!response.ok || !result.applicationNo) throw new Error(result.error || "Arizani yuborib bo‘lmadi.");
      setApplicationNo(result.applicationNo || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik yuz berdi.");
    } finally { setBusy(false); }
  }

  if (applicationNo) {
    return <main className="success-wrap"><section className="success-card">
      <div className="success-icon"><Check size={34}/></div>
      <p className="eyebrow">Ariza qabul qilindi</p>
      <h1>Rahmat! Arizangiz muvaffaqiyatli yuborildi.</h1>
      <p>Arizangiz ko‘rib chiqilgandan so‘ng mas’ul mutaxassis siz bilan bog‘lanadi.</p>
      <div className="application-number"><span>Ariza raqamingiz</span><strong>{applicationNo}</strong></div>
      <button className="primary" onClick={() => location.reload()}>Yangi ariza topshirish</button>
    </section></main>;
  }

  return <main>
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><GraduationCap size={22}/></span><span>Koreyada o‘qish</span></div>
      <span className="secure"><ShieldCheck size={17}/> Ma’lumotlar himoyalangan</span>
    </header>

    <section className="hero">
      <div>
        <p className="eyebrow">2027-yil qabuli</p>
        <h1>Koreya universitetiga<br/>ariza topshiring</h1>
        <p className="hero-copy">Universitetni tanlang, ma’lumotlaringizni kiriting va arizani bir necha daqiqada yuboring.</p>
      </div>
      <div className="hero-stat"><strong>{universities.length}</strong><span>ta universitet</span></div>
    </section>

    <div className="steps" ref={stepsRef}>
      {["Universitet", "Dastur", "Ma’lumotlar", "Yuborish"].map((label, i) =>
        <div className={step >= i + 1 ? "step active" : "step"} key={label}>
          <span>{step > i + 1 ? <Check size={15}/> : i + 1}</span><em>{label}</em>
        </div>)}
    </div>

    <section className="content-card">
      {step === 1 && <>
        <div className="section-title"><p>1-qadam</p><h2>Universitetni tanlang</h2><span>Sizga mos universitet kartochkasini bosing.</span></div>
        <div className="university-grid">
          {universities.map((u) => <button type="button" key={u.id} onClick={() => {setSelectedId(u.id); setForm(old => ({...old, campus: u.campuses[0], program: u.programs[0], track: u.tracks[0], admissionType: "1-kurs"})); setError("");}} className={selectedId === u.id ? "university-card selected" : "university-card"} style={{"--accent": u.accent} as React.CSSProperties}>
            <span className="check-dot">{selectedId === u.id && <Check size={15}/>}</span>
            <span className="uni-korean">{u.ko}</span>
            <strong>{u.uz}</strong>
            <span className="meta"><MapPin size={15}/>{u.location}</span>
            <span className="duration">{u.duration}</span>
            <small>{u.summary}</small>
          </button>)}
        </div>
      </>}

      {step === 2 && university && <>
        <div className="chosen-uni"><span style={{background: university.accent}}>{university.ko.slice(0,1)}</span><div><small>Tanlangan universitet</small><strong>{university.ko} · {university.uz}</strong></div></div>
        <div className="section-title"><p>2-qadam</p><h2>Dastur ma’lumotlari</h2><span>O‘qish variantlarini tanlang.</span></div>
        <div className="form-grid">
          <Select label="Kampus" value={form.campus} onChange={(v) => update("campus", v)} options={university.campuses}/>
          <Select label="Ta’lim bosqichi va qabul turi" value={form.admissionType} onChange={(v) => {update("admissionType", v); update("program", v === "Magistratura" ? mastersProgram : university.programs[0]);}} options={[...baseAdmissionTypes, ...(university.hasMasters ? ["Magistratura"] : [])]}/>
          <Select label="Yo‘nalish" value={form.program} onChange={(v) => update("program", v)} options={form.admissionType === "Magistratura" ? [mastersProgram] : university.programs}/>
          <Select label="Ta’lim tili" value={form.track} onChange={(v) => update("track", v)} options={university.tracks}/>
          <Select label="Qabul semestri" value={form.semester} onChange={(v) => update("semester", v)} options={semesters}/>
        </div>
        <div className="info-box"><FileText size={19}/><span>Kontrakt, chegirma va til talablari arizangiz ko‘rib chiqilganda tanlangan dastur bo‘yicha aniqlashtiriladi.</span></div>
      </>}

      {step === 3 && <>
        <div className="section-title"><p>3-qadam</p><h2>Talaba ma’lumotlari</h2><span>Ma’lumotlarni pasportdagidek aniq kiriting.</span></div>
        <h3 className="form-heading">Shaxsiy ma’lumotlar</h3>
        <div className="form-grid">
          <Input label="Familiya (pasportdagidek, lotincha)" name="lastName" placeholder="ALIYEV" form={form} update={update}/>
          <Input label="Ism (pasportdagidek, lotincha)" name="firstName" placeholder="VALI" form={form} update={update}/>
          <Input label="Otasining ismi" name="middleName" form={form} update={update}/>
          <Input label="Tug‘ilgan sana" name="birthDate" type="date" form={form} update={update}/>
          <Select label="Jinsi" value={form.gender} onChange={(v) => update("gender", v)} options={genders} placeholder="Tanlang"/>
          <Select label="Fuqaroligi" value={form.citizenship} onChange={(v) => update("citizenship", v)} options={cisCountries} placeholder="Davlatni tanlang"/>
          <Input label="Telefon raqami" name="phone" type="tel" placeholder="+821012345678" form={form} update={update}/>
          <Input label="Telegram username" name="telegram" placeholder="@username" form={form} update={update}/>
          <Input label="Elektron pochta" name="email" type="email" form={form} update={update}/>
          <Input label="Hozirgi yashash manzili" name="address" form={form} update={update} wide/>
          <Select label="Viza turi" value={form.visaType} onChange={(v) => update("visaType", v)} options={visaTypes} placeholder="Tanlang"/>
          {form.visaType && form.visaType !== "Koreyada yashamayman" && <Input label="Koreya ID karta raqami" name="arcNumber" form={form} update={update}/>}
          <Input label="Xorijga chiqish pasporti raqami" name="passportNumber" form={form} update={update}/>
        </div>
        <h3 className="form-heading">Ta’lim va til ma’lumotlari</h3>
        <div className="form-grid">
          <Input label="O‘zbekistonda bitirgan ta’lim muassasasi" name="previousSchool" form={form} update={update} wide/>
          <Input label="Bitirgan sana (yil va oy)" name="graduationDate" type="month" placeholder="2024-06" form={form} update={update}/>
          <Select label="Til sertifikati" value={form.languageType} onChange={(v) => {update("languageType", v); update("languageLevel", v === "Mavjud emas" ? "Mavjud emas" : "");}} options={languageTypes}/>
          <Select label={form.languageType === "TOPIK" ? "TOPIK darajasi" : form.languageType === "Mavjud emas" ? "Darajasi yoki bali" : `${form.languageType} darajasi yoki bali`} value={form.languageLevel} onChange={(v) => update("languageLevel", v)} options={certificateLevels[form.languageType] || []} placeholder={form.languageType === "Mavjud emas" ? "Mavjud emas" : "Darajani tanlang"} disabled={form.languageType === "Mavjud emas"}/>
        </div>
        <h3 className="form-heading">Hujjatlar <span>ixtiyoriy</span></h3>
        <p className="hint">PDF yoki rasm (telefon kamerasidan ham bo‘ladi). Rasmlar avtomatik kichraytiriladi, PDF uchun maksimal 20 MB.</p>
        <div className="upload-grid">
          <UploadField label="Xorijga chiqish pasporti" name="passportFile" file={files.passportFile} busy={!!processing.passportFile} onPick={pickFile}/>
          <UploadField label="TOPIK / KIIP / IELTS" name="certificateFile" file={files.certificateFile} busy={!!processing.certificateFile} onPick={pickFile}/>
          <UploadField label="Koreya ID — old tomoni" name="arcFrontFile" file={files.arcFrontFile} busy={!!processing.arcFrontFile} onPick={pickFile}/>
          <UploadField label="Koreya ID — orqa tomoni" name="arcBackFile" file={files.arcBackFile} busy={!!processing.arcBackFile} onPick={pickFile}/>
        </div>
      </>}

      {step === 4 && university && <>
        <div className="section-title"><p>4-qadam</p><h2>Tekshirish va yuborish</h2><span>Asosiy ma’lumotlaringizni yana bir bor tekshiring.</span></div>
        <div className="review">
          <Review title="Talaba" rows={[["F.I.Sh.", `${form.lastName} ${form.firstName} ${form.middleName}`], ["Telefon", form.phone], ["Fuqaroligi", form.citizenship], ["Pasport", form.passportNumber]]}/>
          <Review title="Tanlangan dastur" rows={[["Universitet", `${university.ko} — ${university.uz}`], ["Kampus", form.campus], ["Yo‘nalish", form.program], ["Ta’lim tili", form.track], ["Qabul", `${form.admissionType}, ${form.semester}`]]}/>
        </div>
        <label className="consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}/><span>Kiritilgan ma’lumotlar to‘g‘ri ekanligini tasdiqlayman va shaxsiy ma’lumotlarim qayta ishlanishiga roziman.</span></label>
      </>}

      {error && <div className="error" role="alert">{error}</div>}
      <div className="actions">
        {step > 1 && <button className="secondary" onClick={() => {setStep(s => s - 1); setError("");}}><ArrowLeft size={18}/> Orqaga</button>}
        {step < 4 ? <button className="primary" onClick={next}>Davom etish <ArrowRight size={18}/></button> : <button className="primary submit" disabled={busy || Object.values(processing).some(Boolean)} onClick={submit}>{busy ? "Yuborilmoqda..." : "Arizani yuborish"} <ArrowRight size={18}/></button>}
      </div>
    </section>
    <footer>Arizangiz ko‘rib chiqilgandan so‘ng mas’ul mutaxassis siz bilan bog‘lanadi.</footer>
  </main>;
}

function Input({label,name,form,update,type="text",placeholder="",wide=false,disabled=false}:{label:string;name:string;form:Record<string,string>;update:(n:string,v:string)=>void;type?:string;placeholder?:string;wide?:boolean;disabled?:boolean}) {
  function onChange(value: string) {
    if (name !== "phone") return update(name, value);
    let digits = value.replace(/\D/g, "");
    if (digits.startsWith("82")) digits = digits.slice(2);
    if (digits.startsWith("010")) digits = digits.slice(3);
    else if (digits.startsWith("10")) digits = digits.slice(2);
    update(name, `+8210${digits.slice(0, 8)}`);
  }
  return <label className={wide ? "field wide" : "field"}><span>{label} <b>*</b></span><input type={type} inputMode={name === "phone" ? "numeric" : undefined} maxLength={name === "phone" ? 13 : 200} value={form[name] || ""} placeholder={placeholder} disabled={disabled} onChange={(e)=>onChange(e.target.value)}/></label>;
}
function Select({label,value,onChange,options,placeholder,disabled=false}:{label:string;value?:string;onChange:(v:string)=>void;options:string[];placeholder?:string;disabled?:boolean}) {
  return <label className="field"><span>{label} <b>*</b></span><select disabled={disabled} value={value || ""} onChange={(e)=>onChange(e.target.value)}><option value="" disabled>{placeholder || "Tanlang"}</option>{options.map(o=><option key={o}>{o}</option>)}</select></label>;
}
function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function UploadField({label,name,file,busy,onPick}:{label:string;name:string;file?:File|null;busy:boolean;onPick:(name:string,file:File|null)=>void}) {
  return <label className="upload"><Upload size={20}/><span>{file?.name || label}</span><small>{busy ? "Tayyorlanmoqda..." : file ? `Fayl tanlandi · ${formatSize(file.size)}` : "Fayl tanlash"}</small><input type="file" accept="application/pdf,image/*" disabled={busy} onChange={(e)=>onPick(name, e.target.files?.[0]||null)}/></label>;
}
function Review({title,rows}:{title:string;rows:string[][]}) {
  return <div className="review-card"><h3>{title}</h3>{rows.map(([k,v])=><div key={k}><span>{k}</span><strong>{v || "—"}</strong></div>)}</div>;
}
