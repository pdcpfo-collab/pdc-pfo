# PDC–PFO Production (tanpa R2)

Versi ini menggunakan **Cloudflare Workers + D1**. Foto laporan digabung di browser menjadi satu JPEG lalu dikompres otomatis sampai maksimal sekitar 700 KB dan disimpan sebagai data di D1. Dengan demikian **R2 dan kartu pembayaran tidak diperlukan** untuk deployment ini.

## Komponen
- Cloudflare Worker + Assets
- Cloudflare D1 untuk admin, session, laporan, status, ON DUTY, dan gambar laporan terkompresi
- GitHub sebagai source code
- Email reset password melalui Resend (opsional untuk diaktifkan)

## Catatan ukuran foto
Aplikasi membatasi gambar laporan gabungan sekitar 700 KB sebelum dikirim. Foto AFTER juga dibatasi 750 KB. Ini sengaja agar penyimpanan D1 tetap ringan.

## Database yang sudah dibuat manual
Jika migration `0001_init.sql` sudah pernah dijalankan di D1, jalankan **sekali** isi `migrations/0002_no_r2_photos.sql` melalui D1 Console:

```sql
ALTER TABLE reports ADD COLUMN image_data TEXT;
ALTER TABLE reports ADD COLUMN after_image_data TEXT;
```

Jika migration tersebut sudah pernah dijalankan, jangan jalankan lagi.

## wrangler.toml
Isi `database_id` dengan Database ID D1 milik akun Cloudflare.

## Deployment
1. Push semua file ke GitHub.
2. Cloudflare Workers & Pages → Create application → Import an existing Git repository.
3. Pilih repository `pdc-pfo` dan branch `main`.
4. Pastikan `wrangler.toml` terbaca.
5. Setelah Worker dibuat, pastikan D1 binding `DB` menunjuk ke database `pdc-pfo`.
6. Deploy.

Tidak ada R2 binding di versi ini.
