# DEPLOY PDC–PFO DARI HP — VERSI TANPA R2

## 1. GitHub
Repository: `pdc-pfo`

Upload isi folder project, bukan file ZIP.

## 2. D1
Database: `pdc-pfo`

`0001_init.sql` sudah dijalankan pada database awal. Setelah versi tanpa R2 dipasang, jalankan sekali:

```sql
ALTER TABLE reports ADD COLUMN image_data TEXT;
ALTER TABLE reports ADD COLUMN after_image_data TEXT;
```

## 3. Wrangler
Di `wrangler.toml`, ganti:

```toml
database_id = "GANTI_DENGAN_DATABASE_ID"
```

menjadi Database ID yang ditampilkan Cloudflare pada database `pdc-pfo`.

## 4. Worker
Cloudflare → Workers & Pages → Create application → Import repository → pilih GitHub `pdc-pfo` → branch `main` → deploy.

## 5. R2
**Tidak perlu membuat atau mengaktifkan R2.** Versi ini sengaja menyimpan gambar laporan yang sudah dikompres di D1.

## 6. Email reset password
Fitur reset password membutuhkan `RESEND_API_KEY` dan `FROM_EMAIL` sebagai secret/variable jika ingin benar-benar mengirim email. Jangan masukkan API key ke GitHub.
