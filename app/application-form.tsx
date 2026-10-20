"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Camera, Check, FileText, GraduationCap, Loader2, MapPin, ScanText, ShieldCheck, Upload } from "lucide-react";
import { compressImage } from "@/lib/compress-image";
import { reconcile, type MergedField, type PassportData, type ResidenceCardData } from "@/lib/ocr/parse";
import { baseAdmissionTypes, certificateLevels, cisCountries, genders, languageTypes, mastersProgram, nonResident, semesters, universities, visaCodes } from "@/lib/universities";

const fieldLabels: Record<string, string> = {
  lastName: "Familiya", firstName: "Ism", middleName: "Otchestvo",
  birthDate: "Tug‘ilgan sana", gender: "Jinsi", citizenship: "Fuqaroligi",
  phone: "Telefon raqami", telegram: "Telegram username", email: "Elektron pochta",
  address: "Hozirgi yashash manzili", visaType: "Viza turi",
  previousSchool: "Bitirgan maktab, kollej yoki universitet", graduationDate: "Bitirgan sana",
  admissionType: "Qabul turi", languageType: "Til sertifikati",
  languageLevel: "Darajasi yoki bali", passportNumber: "Xorijga chiqish pasporti raqami",
  arcNumber: "Koreya ID karta raqami", campus: "Kampus", program: "Yo‘nalish",
  track: "Ta’lim tili", semester: "Qabul semestri"
};

const STEPS = ["Universitet", "Dastur", "Hujjatlar", "Ma’lumotlar", "Yuborish"];
const LAST_STEP = STEPS.length;

const requiredByStep: Record<number, string[]> = {
  1: [],
  2: ["campus", "program", "track", "semester"],
  3: [],
  4: ["lastName", "firstName", "middleName", "birthDate", "gender", "citizenship", "phone", "telegram", "email", "address", "visaType", "previousSchool", "graduationDate", "admissionType", "languageType", "languageLevel", "passportNumber"],
  5: [],
};

type OcrState = "reading" | "done" | "partial" | "failed";
const sourceLabels = { passport: "Pasportda", arc: "ID kartada" } as const;

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export default function ApplicationForm() {
  const [step, setStep] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<Record<string, string>>({ semester: "2027-yil mart", admissionType: "1-kurs", languageType: "Mavjud emas", languageLevel: "Mavjud emas", phone: "+8210" });
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [residence, setResidence] = useState<"" | "yes" | "no">("");
  const [ocrStatus, setOcrStatus] = useState<Record<string, OcrState>>({});
  const [ocr, setOcr] = useState<{ passport?: PassportData; arc?: ResidenceCardData }>({});
  const [autoFilled, setAutoFilled] = useState<Record<string, boolean>>({});
  // Fields the student typed in themselves; document values never overwrite them.
  const edited = useRef<Record<string, boolean>>({});
  const latestOcr = useRef<typeof ocr>({});
  // Passport + residence card combined: the card fills or corrects what a poor passport photo missed.
  const merged = useMemo(() => reconcile(ocr.passport ?? null, residence === "yes" ? ocr.arc ?? null : null), [ocr, residence]);
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

  // Start downloading the OCR engine as soon as the documents step opens.
  useEffect(() => {
    if (step === 3) import("@/lib/ocr/read-document").then((m) => m.preloadOcr()).catch(() => {});
  }, [step]);

  function update(name: string, value: string) {
    setForm((old) => ({ ...old, [name]: value }));
    setAutoFilled((old) => (old[name] ? { ...old, [name]: false } : old));
    edited.current[name] = true;
    setError("");
  }

  /** Store a document result and fill every field the student has not typed in themselves. */
  function applyDocuments(next: typeof ocr, livesInKorea = residence === "yes") {
    latestOcr.current = next;
    setOcr(next);
    const combined = reconcile(next.passport ?? null, livesInKorea ? next.arc ?? null : null);
    const values = Object.fromEntries(Object.entries(combined.values).filter(([k]) => !edited.current[k])) as Record<string, string>;
    if (!Object.keys(values).length) return;
    setForm((old) => ({ ...old, ...values }));
    setAutoFilled((old) => ({ ...old, ...Object.fromEntries(Object.keys(values).map((k) => [k, true])) }));
  }

  async function readDocument(name: string, file: File) {
    if (name !== "passportFile" && name !== "arcFrontFile") return;
    setOcrStatus((old) => ({ ...old, [name]: "reading" }));
    try {
      const { readPassport, readResidenceCard } = await import("@/lib/ocr/read-document");
      if (name === "passportFile") {
        const { data } = await readPassport(file);
        applyDocuments({ ...latestOcr.current, passport: data ?? undefined });
        const found = data ? (["lastName", "firstName", "passportNumber", "birthDate"] as const).filter((k) => data[k]).length : 0;
        setOcrStatus((old) => ({ ...old, [name]: !data || found === 0 ? "failed" : data.verified && data.namesClean ? "done" : "partial" }));
      } else {
        const data = await readResidenceCard(file);
        applyDocuments({ ...latestOcr.current, arc: data ?? undefined });
        setOcrStatus((old) => ({ ...old, [name]: !data ? "failed" : data.arcNumber && data.visaType && data.names ? "done" : "partial" }));
      }
    } catch (e) {
      console.error(e);
      setOcrStatus((old) => ({ ...old, [name]: "failed" }));
    }
  }

  function chooseResidence(value: "yes" | "no") {
    setResidence(value);
    setError("");
    if (value === "no") {
      setForm((old) => ({ ...old, visaType: nonResident, arcNumber: "" }));
      setFiles((old) => ({ ...old, arcFrontFile: null, arcBackFile: null }));
      applyDocuments({ ...latestOcr.current, arc: undefined }, false);
      setOcrStatus((old) => Object.fromEntries(Object.entries(old).filter(([k]) => k !== "arcFrontFile")));
    } else {
      if (form.visaType === nonResident) setForm((old) => ({ ...old, visaType: "" }));
      if (latestOcr.current.arc) applyDocuments(latestOcr.current, true);
    }
  }

  async function pickFile(name: string, file: File | null) {
    setError("");
    if (!file) return setFiles((old) => ({ ...old, [name]: null }));
    // OCR reads the original file (best quality) while the upload copy is being shrunk.
    // A new document may refill fields the student had typed before it.
    if (name === "passportFile" || name === "arcFrontFile") edited.current = {};
    void readDocument(name, file);
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
    if (step === 3) {
      if (!residence) return setError("Koreyada yashaysizmi — javobni tanlang.");
      if (!files.passportFile) return setError("Xorijga chiqish pasportini yuklang.");
      if (residence === "yes" && (!files.arcFrontFile || !files.arcBackFile)) return setError("Koreya ID kartaning ikkala tomonini yuklang.");
      if (Object.values(processing).some(Boolean) || Object.values(ocrStatus).includes("reading")) {
        return setError("Hujjatlar o‘qilmoqda, bir necha soniya kuting.");
      }
    }
    if (step === 4 && !/^\+8210\d{8}$/.test(form.phone || "")) {
      return setError("Telefon raqamini +8210 dan keyin 8 ta raqam bilan kiriting.");
    }
    if (step === 4 && residence === "yes" && !form.arcNumber?.trim()) {
      return setError("Koreya ID karta raqamini kiriting.");
    }
    setError("");
    setStep((s) => Math.min(LAST_STEP, s + 1));
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
      data.append("ocr", JSON.stringify({ ...ocr, merged: merged.values, sources: merged.sources }));
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

  // Per-field highlight: green = read from documents, yellow = read but please double-check.
  const fieldState: Record<string, "auto" | "check"> = Object.fromEntries(Object.entries(autoFilled).filter(([, v]) => v)
    .map(([k]) => [k, merged.uncertain.includes(k as MergedField) || merged.conflicts[k as MergedField] ? "check" : "auto"]));

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
      {STEPS.map((label, i) =>
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
        <div className="section-title"><p>3-qadam</p><h2>Hujjatlarni yuklang</h2><span>Hujjatlardagi ma’lumotlar keyingi sahifaga avtomatik to‘ldiriladi.</span></div>
        <h3 className="form-heading">Koreyada yashaysizmi?</h3>
        <div className="choice-row">
          <button type="button" className={residence === "yes" ? "choice selected" : "choice"} onClick={() => chooseResidence("yes")}><strong>Ha, Koreyada yashayman</strong><small>Koreya ID karta (외국인등록증) bor</small></button>
          <button type="button" className={residence === "no" ? "choice selected" : "choice"} onClick={() => chooseResidence("no")}><strong>Yo‘q</strong><small>Hozir Koreyadan tashqarida yashayman</small></button>
        </div>
        {residence && <>
          <h3 className="form-heading">Hujjatlar</h3>
          <div className="info-box"><Camera size={19}/><span>Hujjatni tekis joyga qo‘yib, yorug‘da suratga oling. Passportning pastidagi 2 qator kod (<b>P&lt;UZB…</b>) to‘liq va aniq ko‘rinsin. PDF, JPG, PNG va boshqa rasm formatlari qabul qilinadi.</span></div>
          <div className="upload-grid">
            <UploadField label="Xorijga chiqish pasporti" required name="passportFile" file={files.passportFile} busy={!!processing.passportFile} ocr={ocrStatus.passportFile} onPick={pickFile}/>
            {residence === "yes" && <UploadField label="Koreya ID karta — old tomoni" required name="arcFrontFile" file={files.arcFrontFile} busy={!!processing.arcFrontFile} ocr={ocrStatus.arcFrontFile} onPick={pickFile}/>}
            {residence === "yes" && <UploadField label="Koreya ID karta — orqa tomoni" required name="arcBackFile" file={files.arcBackFile} busy={!!processing.arcBackFile} onPick={pickFile}/>}
            <UploadField label="TOPIK / KIIP / IELTS sertifikati (ixtiyoriy)" name="certificateFile" file={files.certificateFile} busy={!!processing.certificateFile} onPick={pickFile}/>
          </div>
        </>}
      </>}

      {step === 4 && <>
        <div className="section-title"><p>4-qadam</p><h2>Talaba ma’lumotlari</h2><span>Ma’lumotlarni tekshiring va qolganlarini to‘ldiring.</span></div>
        {Object.values(autoFilled).some(Boolean) && <div className="notice ok"><ScanText size={19}/><span>Yashil maydonlar hujjatdan avtomatik to‘ldirildi{Object.values(fieldState).includes("check") ? ", sariqlarini albatta tekshiring" : ""}. Iltimos, hujjat bilan solishtirib chiqing.</span></div>}
        {(ocrStatus.passportFile === "failed" || ocrStatus.passportFile === "partial") && <div className="notice warn"><AlertTriangle size={19}/><span>{residence === "yes" && ocr.arc ? "Passport rasmi sifati past — ma’lumotlar ID karta bilan solishtirib to‘ldirildi." : "Passportni to‘liq o‘qib bo‘lmadi."} Sariq va bo‘sh maydonlarni pasportdagidek tekshirib, to‘ldiring.</span></div>}
        {Object.entries(merged.conflicts).map(([k, c]) => <div className="notice conflict" key={k}><AlertTriangle size={19}/><div><span>“{fieldLabels[k]}” pasport va ID kartada farq qiladi. To‘g‘risini tanlang:</span><div className="conflict-options">{(["passport", "arc"] as const).map((src) => <button type="button" key={src} className={form[k] === c![src] ? "selected" : ""} onClick={() => update(k, c![src])}>{sourceLabels[src]}: <b>{c![src]}</b></button>)}</div></div></div>)}
        <h3 className="form-heading">Shaxsiy ma’lumotlar</h3>
        <div className="form-grid">
          <Input label="Familiya (pasportdagidek, lotincha)" name="lastName" placeholder="ALIYEV" form={form} update={update} auto={fieldState}/>
          <Input label="Ism (pasportdagidek, lotincha)" name="firstName" placeholder="VALI" form={form} update={update} auto={fieldState}/>
          <Input label="Otchestvo" name="middleName" placeholder="GANI UGLI" form={form} update={update} auto={fieldState}/>
          <Input label="Tug‘ilgan sana" name="birthDate" type="date" form={form} update={update} auto={fieldState}/>
          <Select label="Jinsi" value={form.gender} onChange={(v) => update("gender", v)} options={genders} placeholder="Tanlang" auto={fieldState.gender}/>
          <Select label="Fuqaroligi" value={form.citizenship} onChange={(v) => update("citizenship", v)} options={cisCountries} placeholder="Davlatni tanlang" auto={fieldState.citizenship}/>
          <Input label="Xorijga chiqish pasporti raqami" name="passportNumber" placeholder="FA1234567" form={form} update={update} auto={fieldState}/>
          {residence === "yes" && <>
            <Input label="Koreya ID karta raqami" name="arcNumber" placeholder="000000-0000000" form={form} update={update} auto={fieldState}/>
            <Select label="Viza turi" value={form.visaType} onChange={(v) => update("visaType", v)} options={[...new Set([...visaCodes, ...(form.visaType && form.visaType !== nonResident ? [form.visaType] : []), "Boshqa"])]} placeholder="Tanlang" auto={fieldState.visaType}/>
          </>}
        </div>
        <h3 className="form-heading">Aloqa ma’lumotlari</h3>
        <div className="form-grid">
          <Input label="Telefon raqami" name="phone" type="tel" placeholder="+821012345678" form={form} update={update}/>
          <Input label="Telegram username" name="telegram" placeholder="@username" form={form} update={update}/>
          <Input label="Elektron pochta" name="email" type="email" form={form} update={update}/>
          <Input label="Hozirgi yashash manzili" name="address" form={form} update={update} wide/>
        </div>
        <h3 className="form-heading">Ta’lim va til ma’lumotlari</h3>
        <div className="form-grid">
          <Input label="O‘zbekistonda bitirgan ta’lim muassasasi" name="previousSchool" form={form} update={update} wide/>
          <Input label="Bitirgan sana (yil va oy)" name="graduationDate" type="month" placeholder="2024-06" form={form} update={update}/>
          <Select label="Til sertifikati" value={form.languageType} onChange={(v) => {update("languageType", v); update("languageLevel", v === "Mavjud emas" ? "Mavjud emas" : "");}} options={languageTypes}/>
          <Select label={form.languageType === "TOPIK" ? "TOPIK darajasi" : form.languageType === "Mavjud emas" ? "Darajasi yoki bali" : `${form.languageType} darajasi yoki bali`} value={form.languageLevel} onChange={(v) => update("languageLevel", v)} options={certificateLevels[form.languageType] || []} placeholder={form.languageType === "Mavjud emas" ? "Mavjud emas" : "Darajani tanlang"} disabled={form.languageType === "Mavjud emas"}/>
        </div>
      </>}

      {step === 5 && university && <>
        <div className="section-title"><p>5-qadam</p><h2>Tekshirish va yuborish</h2><span>Asosiy ma’lumotlaringizni yana bir bor tekshiring.</span></div>
        <div className="review">
          <Review title="Talaba" rows={[["F.I.Sh.", `${form.lastName} ${form.firstName} ${form.middleName}`], ["Telefon", form.phone], ["Fuqaroligi", form.citizenship], ["Pasport", form.passportNumber]]}/>
          <Review title="Hujjatlar" rows={[["Pasport", files.passportFile?.name || "—"], ...(residence === "yes" ? [["ID karta (old)", files.arcFrontFile?.name || "—"], ["ID karta (orqa)", files.arcBackFile?.name || "—"]] : []), ["Sertifikat", files.certificateFile?.name || "—"]]}/>
          <Review title="Tanlangan dastur" rows={[["Universitet", `${university.ko} — ${university.uz}`], ["Kampus", form.campus], ["Yo‘nalish", form.program], ["Ta’lim tili", form.track], ["Qabul", `${form.admissionType}, ${form.semester}`]]}/>
        </div>
        <label className="consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}/><span>Kiritilgan ma’lumotlar to‘g‘ri ekanligini tasdiqlayman va shaxsiy ma’lumotlarim qayta ishlanishiga roziman.</span></label>
      </>}

      {error && <div className="error" role="alert">{error}</div>}
      <div className="actions">
        {step > 1 && <button className="secondary" onClick={() => {setStep(s => s - 1); setError("");}}><ArrowLeft size={18}/> Orqaga</button>}
        {step < LAST_STEP ? <button className="primary" onClick={next}>Davom etish <ArrowRight size={18}/></button> : <button className="primary submit" disabled={busy || Object.values(processing).some(Boolean)} onClick={submit}>{busy ? "Yuborilmoqda..." : "Arizani yuborish"} <ArrowRight size={18}/></button>}
      </div>
    </section>
    <footer>Arizangiz ko‘rib chiqilgandan so‘ng mas’ul mutaxassis siz bilan bog‘lanadi.</footer>
  </main>;
}

function Input({label,name,form,update,type="text",placeholder="",wide=false,disabled=false,auto}:{label:string;name:string;form:Record<string,string>;update:(n:string,v:string)=>void;type?:string;placeholder?:string;wide?:boolean;disabled?:boolean;auto?:Record<string,"auto"|"check">}) {
  function onChange(value: string) {
    if (name !== "phone") return update(name, value);
    let digits = value.replace(/\D/g, "");
    if (digits.startsWith("82")) digits = digits.slice(2);
    if (digits.startsWith("010")) digits = digits.slice(3);
    else if (digits.startsWith("10")) digits = digits.slice(2);
    update(name, `+8210${digits.slice(0, 8)}`);
  }
  return <label className={`field${wide ? " wide" : ""}${auto?.[name] ? ` ${auto[name]}` : ""}`}><span>{label} <b>*</b></span><input type={type} inputMode={name === "phone" ? "numeric" : undefined} maxLength={name === "phone" ? 13 : 200} value={form[name] || ""} placeholder={placeholder} disabled={disabled} onChange={(e)=>onChange(e.target.value)}/></label>;
}
function Select({label,value,onChange,options,placeholder,disabled=false,auto}:{label:string;value?:string;onChange:(v:string)=>void;options:string[];placeholder?:string;disabled?:boolean;auto?:"auto"|"check"}) {
  return <label className={auto ? `field ${auto}` : "field"}><span>{label} <b>*</b></span><select disabled={disabled} value={value || ""} onChange={(e)=>onChange(e.target.value)}><option value="" disabled>{placeholder || "Tanlang"}</option>{options.map(o=><option key={o}>{o}</option>)}</select></label>;
}
function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
const ocrLabels: Record<OcrState, string> = {
  reading: "Hujjat o‘qilmoqda…",
  done: "Ma’lumotlar o‘qildi",
  partial: "Qisman o‘qildi — keyingi sahifada tekshiring",
  failed: "O‘qib bo‘lmadi — keyingi sahifada qo‘lda kiriting",
};
function UploadField({label,name,file,busy,ocr,required=false,onPick}:{label:string;name:string;file?:File|null;busy:boolean;ocr?:OcrState;required?:boolean;onPick:(name:string,file:File|null)=>void}) {
  return <div className={`upload-box${file ? " has-file" : ""}`}>
    <label className="upload"><Upload size={20}/><span>{label}{required && <b> *</b>}</span><small>{busy ? "Tayyorlanmoqda..." : file ? `${file.name} · ${formatSize(file.size)}` : "Fayl tanlash yoki suratga olish"}</small><input type="file" accept="application/pdf,image/*" disabled={busy} onChange={(e)=>{onPick(name, e.target.files?.[0]||null); e.target.value = "";}}/></label>
    {ocr && <div className={`ocr-status ${ocr}`}>{ocr === "reading" ? <Loader2 size={15} className="spin"/> : ocr === "done" ? <Check size={15}/> : <AlertTriangle size={15}/>}{ocrLabels[ocr]}</div>}
  </div>;
}
function Review({title,rows}:{title:string;rows:string[][]}) {
  return <div className="review-card"><h3>{title}</h3>{rows.map(([k,v])=><div key={k}><span>{k}</span><strong>{v || "—"}</strong></div>)}</div>;
}
