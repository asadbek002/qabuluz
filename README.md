# Koreya universitetlariga ariza

Koreya universitetlariga hujjat topshirish sayti (Next.js / vinext + PostgreSQL). Ilova Docker orqali ishga tushadi, hujjatlar server diskida saqlanadi.

## Imkoniyatlar

- Talaba 5 qadamda ariza yuboradi (universitet → dastur → hujjatlar → ma’lumotlar → tasdiqlash).
- Hujjatlar qadamida zagranpassport (majburiy) va Koreyada yashovchilar uchun Koreya ID kartaning ikkala tomoni (majburiy) yuklanadi. Hujjatlar talabaning brauzerida OCR qilinadi (PaddleOCR PP-OCRv4 modellari, onnxruntime-web orqali; rasm hech qayerga yuborilmaydi). Rasm avval tik holatga keltiriladi (yonbosh, teskari, qiyshiq bo‘lsa ham): passportdan avval sahifadagi bosma maydonlar (F.I.Sh. otchestvo bilan, pasport raqami, tug‘ilgan sana, jins, fuqarolik) o‘qiladi, MRZ esa faqat o‘qilmagan maydonlar uchun zaxira va raqam/sanani nazorat raqami bilan tekshirish uchun ishlatiladi; ID kartadan ID raqam, viza kodi, lotincha F.I.Sh. (ikki qatorga bo‘lingan / chiziqchali bo‘lsa ham) va ID raqamdan tug‘ilgan sana hamda jins olinadi. Ikkala hujjat solishtiriladi: passport rasmi sifatsiz bo‘lsa, yetishmagan yoki shovqinli qiymatlar ID kartadan olinadi; farq bo‘lsa talaba to‘g‘risini tanlaydi, tasdiqlanmagan qiymatlar sariq rangda ko‘rsatiladi. JPG, PNG, WebP, HEIC (brauzer ochsa) va PDF (1-sahifa) o‘qiladi. Admin panelda arizadagi qiymatlar hujjatdan o‘qilganlari bilan solishtiriladi.
- OCR fayllari (`public/ocr/`: modellar ~15 MB, WASM ~14 MB) build vaqtida `scripts/copy-ocr-assets.mjs` orqali `node_modules` dan nusxalanadi va saytning o‘zidan beriladi; birinchi marta yuklab olinadi, keyin brauzer keshidan. OCR bir nechta CPU oqimida ishlashi uchun sahifa COOP/COEP sarlavhalari bilan beriladi (`next.config.ts`, `deploy/nginx.conf`); Nginx’da `gzip` ham yoqilgan bo‘lsin.
- Telefon `+8210XXXXXXXX` formatida, barcha tanlovlar serverda ham tekshiriladi.
- PDF va rasm hujjatlar: telefon rasmlari brauzerda avtomatik kichraytiriladi (JPEG, max 2200px), PDF 20 MB gacha; fayl turi uning ichidan aniqlanadi.
- Admin (`/admin`) arizalarni ko‘radi, qidiradi, hujjatlarni ochadi va Excel’ga eksport qiladi.
- Excel eksport universitetlarning ariza shabloni (`templates/applicants-template.xlsx`) asosida chiqadi: arizalar bakalavr / magistratura / ko‘chirish va til sertifikati bor-yo‘qligiga qarab varaqlarga taqsimlanadi, ism koreys yozuviga avtomatik o‘giriladi. Shablonni almashtirish uchun shu faylni yangisiga almashtiring (ustunlar tartibi A–Q bir xil qolishi kerak). Yo‘nalish, kampus va boshqa qiymatlarning koreyscha nomlari `lib/korean.ts` da.

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
