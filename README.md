# Koreya universitetlariga ariza

Koreya universitetlariga hujjat topshirish sayti. Ushbu nusxa Cloudflare D1/R2 o‘rniga PostgreSQL va server diskidagi fayl papkasidan foydalanadi. Ilova Docker orqali ishga tushadi.

## Tarkib

- Talaba ariza formasini yuboradi.
- Telefon raqami `+8210` formatida tekshiriladi.
- Universitet va magistratura yo‘nalishlari tanlanadi.
- TOPIK va boshqa til darajalari ro‘yxatdan tanlanadi.
- Admin arizalarni ko‘radi, hujjatlarni yuklab oladi va Excel faylga eksport qiladi.
- Yuklangan hujjatlar `data/uploads/` papkasida saqlanadi.

## Talablar

- Docker Engine va Docker Compose plugin
- Node.js 22.13+ (faqat lokal ishlab chiqish uchun)
- PostgreSQL 15+ (PostgreSQL 17 bilan ishlaydi)
- Reverse proxy va HTTPS domeni (masalan, Nginx)

## Serverda ishga tushirish

1. GitHub repository'ni serverga clone qiling va loyiha papkasiga o‘ting.
2. PostgreSQL serverida alohida database va user yarating. Mavjud PostgreSQL konteyneri ishlatilsa, web konteyner unga ulangan Docker tarmog‘iga qo‘shilishi kerak.
3. PostgreSQL konteyneri ulangan tarmoq nomini aniqlang:

   ```bash
   docker network ls
   ```

4. Namuna sozlamani nusxalang va `.env` ichidagi uchta qiymatni o‘zingiznikiga almashtiring:

   ```bash
   cp .env.example .env
   nano .env
   ```

   `DATABASE_URL` dagi `postgres` o‘rniga PostgreSQL konteynerining tarmoq ichidagi nomi yoki aliasini yozing. `POSTGRES_DOCKER_NETWORK` qiymati esa o‘sha konteyner ulangan Docker network bo‘lsin. `ADMIN_PASSWORD` uchun uzun va tasodifiy parol qo‘ying.

5. Ilovani ishga tushiring:

   ```bash
   docker compose -f compose.yml up -d --build
   docker compose -f compose.yml logs -f web
   ```

   Ilova birinchi ishga tushishda PostgreSQL’ga ulanib, jadval migratsiyalarini bajaradi. Web server hostda faqat `127.0.0.1:3010` portida ochiladi.

6. Nginx yoki boshqa reverse proxy'da domeningizni `http://127.0.0.1:3010` ga yo‘naltiring va HTTPS yoqing. Admin sahifasi `/admin` manzilida.

## PostgreSQL ma'lumotlari

Database va user'ni PostgreSQL ichida administrator hisobidan yarating, masalan:

```sql
CREATE USER university_apply WITH PASSWORD 'STRONG_DATABASE_PASSWORD';
CREATE DATABASE university_apply OWNER university_apply;
```

Keyin `.env` ichidagi `DATABASE_URL` parolini shu qiymatga moslang. Production serverda PostgreSQL portini internetga ochmang; ilova bilan bir Docker network orqali ulang.

## GitHub'ga yuborish

GitHub'da bo‘sh repository yarating, so‘ng loyiha papkasida:

```bash
git init
git add .
git commit -m "Prepare self-hosted university application site"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

`.env`, yuklangan hujjatlar, `node_modules` va build fayllari Git'ga kiritilmaydi. `.env.example` ichida faqat namuna qiymatlar bor.

## Lokal ishlab chiqish

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm dev
```

Lokal rejimda ham `.env` dagi `DATABASE_URL` haqiqiy PostgreSQL bazasiga ulanib turishi kerak. Schema o‘zgarsa, migratsiya yaratish:

```bash
pnpm db:generate
```

Migratsiyalar Docker ishga tushganda avtomatik bajariladi. Yuklangan hujjatlarni muntazam backup qiling: PostgreSQL backup'i bilan birga `data/uploads/` papkasini ham saqlang.
