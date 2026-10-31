# Koreya universitetlariga ariza

Koreya universitetlariga hujjat topshirish sayti (Next.js / vinext + PostgreSQL). Ilova Docker orqali ishga tushadi, hujjatlar server diskida saqlanadi.

## Imkoniyatlar

- Talaba 5 qadamda ariza yuboradi (universitet → dastur → hujjatlar → ma’lumotlar → tasdiqlash).
- Sayt faqat Koreyada yashovchi talabalar uchun. Hujjatlar qadamida zagranpassport va Koreya ID kartaning ikkala tomoni (hammasi majburiy) yuklanadi. Hujjatlar talabaning brauzerida OCR qilinadi (PaddleOCR PP-OCRv4, onnxruntime-web; rasm hech qayerga yuborilmaydi). Rasm avval tik holatga keltiriladi (yonbosh, teskari, qiyshiq bo‘lsa ham). **F.I.Sh. (otchestvo bilan) faqat passportdan olinadi**: avval sahifadagi bosma maydonlar, o‘qilmaganlari uchun MRZ; pasport raqami, tug‘ilgan sana, jins va fuqarolik ham passportdan. ID kartadan ID raqam va viza kodi olinadi, ID raqamdan esa tug‘ilgan sana va jins — ular passport bilan solishtiriladi (farq bo‘lsa talaba to‘g‘risini tanlaydi). Tasdiqlanmagan qiymatlar sariq rangda ko‘rsatiladi. JPG, PNG, WebP, HEIC (brauzer ochsa) va PDF (1-sahifa) o‘qiladi. Admin panelda arizadagi qiymatlar hujjatdan o‘qilganlari bilan solishtiriladi.
- OCR fayllari build vaqtida `scripts/copy-ocr-assets.mjs` orqali `public/ocr/<versiya>/` ga nusxalanadi (versiya `lib/ocr/assets.json` da). Modellar INT8 ga siqilgan (`models/ppocr/`, `scripts/quantize-ppocr.py`): gzip bilan birinchi kirishda ~7 MB yuklanadi (model ~3.6 MB + WASM ~3.7 MB), talaba 2-qadamga o‘tganda fonda boshlanadi; keyingi kirishlarda 0 MB — Nginx `/ocr/` uchun 1 yillik `immutable` kesh beradi. Modellar o‘zgarsa `assets.json` dagi versiyani oshiring. OCR bir nechta CPU oqimida ishlashi uchun COOP/COEP sarlavhalarini ilovaning o‘zi beradi (`next.config.ts`) — Nginx’da ularni qayta qo‘shmang.
- Telefon `+8210XXXXXXXX` formatida, barcha tanlovlar serverda ham tekshiriladi.
- PDF va rasm hujjatlar: telefon rasmlari brauzerda avtomatik kichraytiriladi (JPEG, max 2200px), PDF 20 MB gacha; fayl turi uning ichidan aniqlanadi.
- Admin (`/admin`) arizalarni ko‘radi, qidiradi, hujjatlarni ochadi va Excel’ga eksport qiladi.
- Excel eksport universitetlarning ariza shabloni (`templates/applicants-template.xlsx`) asosida chiqadi: arizalar bakalavr / magistratura / ko‘chirish va til sertifikati bor-yo‘qligiga qarab varaqlarga taqsimlanadi, ism koreys yozuviga avtomatik o‘giriladi. Shablonni almashtirish uchun shu faylni yangisiga almashtiring (ustunlar tartibi A–Q bir xil qolishi kerak). Yo‘nalish, kampus va boshqa qiymatlarning koreyscha nomlari `lib/korean.ts` da.
- Admin panelda arizalarni belgilab o‘chirish yoki faqat belgilanganlarni eksport qilish mumkin. «Excel yuklab olish» ikki variant beradi: **Universitet uchun** — yuqoridagi shablon (A–Q ustunlar); **Shablon uchun** — shunga qo‘shimcha R–AA ustunlar: 보호자연락처, 관계, 한국 내 연락처, 외국인등록증 유효기간, 학교 구분 (Excel’da ochiladigan ro‘yxat), 성적평균, 전공, 성적, 졸업일자, 성적 유효기간. Bu maydonlarni talaba to‘ldirmaydi — admin har bir ariza ichidagi «Shablon uchun qo‘shimcha ma’lumotlar» bo‘limida kiritadi (`lib/admin-fields.ts`, `applications.admin_data`).
- Har bir arizada Excel uchun to‘ldirilganlik foizi va holati (To‘ldirilmagan / Qisman / To‘liq) ko‘rinadi. Universitetga ro‘yxati yuborilgan talabalar belgilanib **«Done ga o‘tkazish»** bilan Done holatiga o‘tkaziladi (`applications.done_at`) va ish ro‘yxatidan chiqadi; «Done» filtri va Excel shu holat bo‘yicha ham ishlaydi.
- Admin har bir arizadagi «Tahrirlash» orqali shaxsiy ma’lumotlarni va dasturni o‘zgartira oladi (yo‘nalish qo‘lda yoziladi). Shu yerda talaba formasida so‘ralmaydigan **고등학교 / 대학교 이름 (K), 고등학교/대학교 졸업일자 (L) va 주소 (P)** ham kiritiladi — ular ikkala Excel’ga yoziladi; shablondagi 졸업일자 (Z) ham shu sanadan olinadi.

## Serverga deploy (Ubuntu 22.04/24.04)

### 1. Docker, Nginx va Certbot o‘rnatish

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo apt install -y nginx certbot python3-certbot-nginx git
```

### 2. Loyihani yuklab olish

```bash
sudo mkdir -p /opt/qabuluz && sudo chown $USER /opt/qabuluz
git clone https://github.com/asadbek002/qabuluz.git /opt/qabuluz
cd /opt/qabuluz
```

### 3. Sozlamalar (`.env`)

```bash
cp .env.example .env
nano .env
```

- `ADMIN_PASSWORD` — kamida 12 belgi (`openssl rand -base64 24`).
- `POSTGRES_PASSWORD` — uzun parol (`openssl rand -hex 24`). Uni birinchi ishga tushirishdan keyin o‘zgartirmang: baza shu parol bilan yaratiladi.

### 4. Ishga tushirish

```bash
docker compose up -d --build
docker compose logs -f web      # "Database migrations applied." va "Production server running" chiqishi kerak
curl http://127.0.0.1:3010/api/health   # {"ok":true}
```

`compose.yml` ilova bilan birga o‘zining PostgreSQL 17 konteynerini ko‘taradi. Ma’lumotlar `data/postgres/`, hujjatlar `data/uploads/` papkasida saqlanadi. Migratsiyalar har ishga tushishda avtomatik bajariladi.

Agar serverda PostgreSQL boshqa konteynerda allaqachon ishlayotgan bo‘lsa, `.env` ga `POSTGRES_DOCKER_NETWORK` va `DATABASE_URL` ni yozing va `docker compose -f compose.external-db.yml up -d --build` dan foydalaning.

### 5. Domen va HTTPS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/qabuluz
sudo nano /etc/nginx/sites-available/qabuluz        # example.uz ni o‘z domeningizga almashtiring
sudo ln -s /etc/nginx/sites-available/qabuluz /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d example.uz -d www.example.uz
```

Ilova faqat `127.0.0.1:3010` da tinglaydi — tashqaridan faqat Nginx orqali kiriladi. Admin cookie faqat HTTPS orqali ishlaydi, shuning uchun admin panelga `https://` bilan kiring.

Firewall: `sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable`.

### 6. Yangilash

```bash
cd /opt/qabuluz
git pull
docker compose up -d --build
```

### 7. Backup

```bash
./deploy/backup.sh          # backups/ papkasiga DB dump va hujjatlar arxivi
crontab -e                  # har kuni 03:00 da:
# 0 3 * * * cd /opt/qabuluz && ./deploy/backup.sh >> backups/backup.log 2>&1
```

Backup’larni serverdan tashqariga ham (boshqa disk/bulut) nusxalab turing.

Tiklash: `gunzip -c backups/db-XXXX.sql.gz | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'` va `tar -xzf backups/uploads-XXXX.tar.gz -C data`.

## Lokal ishlab chiqish

```bash
corepack enable
pnpm install
cp .env.example .env     # DATABASE_URL ni lokal PostgreSQL’ga moslang
pnpm db:migrate:dev
pnpm dev
```

Schema o‘zgarsa: `pnpm db:generate` (yangi SQL migratsiya `drizzle/` ga yoziladi va commit qilinadi).

Tekshiruvlar: `pnpm lint`, `npx tsc --noEmit`, `pnpm build`.
