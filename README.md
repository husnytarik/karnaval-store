# Kırtasiye E-Ticaret

Cloudflare Pages + Pages Functions + Neon (Postgres).

1. `npm install`
2. `.dev.vars.example` dosyasını `.dev.vars` olarak kopyalayıp doldurun (Neon bağlantı adresi, admin şifresi, gizli anahtar)
3. `npm run setup-db` — tabloları oluşturur
4. `npm run dev` — yerelde çalıştırır (`/admin.html` yönetim paneli)
5. `npm run deploy` — Cloudflare Pages'e yayınlar; DATABASE_URL, ADMIN_PASSWORD, SESSION_SECRET değerlerini Pages > Settings > Variables bölümüne ekleyin
