# Buku Registrasi Rawat Inap: HTML + Google Sheets

Aplikasi berupa file HTML yang bisa dipasang di HP. Datanya tersimpan di Google Sheets milik Anda, jadi laptop dan HP selalu melihat data yang sama dan Anda bisa membuka spreadsheetnya kapan saja.

Yang dibutuhkan: akun Google dan tempat menaruh file HTML dengan HTTPS (gratis, lihat Bagian 2).

## Bagian 1. Siapkan spreadsheet (sekali saja, sekitar 5 menit)
1. Buka Google Sheets, buat spreadsheet baru, beri nama misalnya **Buku Registrasi Rawat Inap**.
2. Menu **Ekstensi > Apps Script**. Hapus isi file `Code.gs` bawaan, lalu tempel seluruh isi file `Code.gs` dari paket ini.
3. Di baris atas, ganti dua nilai lalu simpan (ikon disket):
   - `KUNCI`: kata sandi panjang dan sulit ditebak. Dimasukkan sekali di setiap perangkat saat menghubungkan aplikasi.
   - `PIN`: 4 sampai 8 angka. Diminta setiap kali masuk ke mode **Input**.
4. Pada pilihan fungsi di atas editor, pilih **siapkan** (atau **siapkanDenganContoh** bila ingin 5 pasien contoh), lalu klik **Jalankan**. Izinkan akses saat Google meminta. Jika muncul peringatan "Google belum memverifikasi aplikasi ini", pilih *Lanjutan > Buka (tidak aman)*. Itu skrip milik Anda sendiri.
5. Spreadsheet sekarang punya sheet **Pasien**, **Tarif**, **ICD10**, dan **Pengaturan**.
6. Klik **Terapkan (Deploy) > Deployment baru**. Jenis: **Aplikasi web**. Isi:
   - Jalankan sebagai: **Saya**
   - Yang memiliki akses: **Siapa saja**
   Klik **Terapkan**, lalu salin **URL aplikasi web** (berakhiran `/exec`).

Akses "Siapa saja" aman karena setiap permintaan harus membawa kunci rahasia. Jangan membagikan URL dan kunci itu ke orang lain.

**Dua pilihan saat aplikasi dibuka**
- **Input data:** minta PIN, lalu bisa mencatat, mengubah, dan menghapus data serta mengatur tarif dan ICD-10. PIN diperiksa oleh Apps Script, jadi tidak bisa dilewati dari aplikasi. Setelah 5 kali PIN salah, terkunci 10 menit. Aplikasi terkunci otomatis bila 5 menit tidak disentuh.
- **Monitoring:** tanpa PIN, hanya melihat rekap, indikator, dan buku registrasi. Tidak ada form dan tombol ubah/hapus, dan Apps Script menolak perubahan tanpa PIN.

## Bagian 2. Taruh file HTML di internet (HTTPS)
HP hanya mau memasang aplikasi dari alamat HTTPS. Pilih salah satu cara gratis:
- **Netlify Drop:** buka app.netlify.com/drop, lalu seret folder `rawat-inap-sheets` (folder yang berisi `index.html`) ke halamannya. Anda akan mendapat alamat seperti `https://nama-acak.netlify.app`.
- **GitHub Pages:** unggah isi folder ke repositori GitHub, lalu aktifkan Pages di Settings.

Isi file HTML tidak memuat data pasien, jadi aman ditaruh di alamat umum. Data hanya bisa dibuka oleh yang punya URL Apps Script dan kunci.

## Bagian 3. Hubungkan dan pasang di HP
1. Buka alamat aplikasi di browser. Pada pemakaian pertama, form sambungan muncul otomatis.
2. Tempel **URL aplikasi web** dari Bagian 1 dan isi **kunci rahasia**, lalu **Simpan dan uji koneksi**. Ulangi di setiap perangkat (laptop dan HP). Alamat dan kunci hanya tersimpan di perangkat itu. Pengaturan ini bisa dibuka lagi lewat tautan *Pengaturan sambungan* di layar awal.
3. **Android (Chrome):** menu tiga titik > *Instal aplikasi*.
   **iPhone (Safari):** tombol Bagikan > *Tambah ke Layar Utama*.

Bila tidak ada internet, aplikasi tetap terbuka dan menampilkan data terakhir yang dimuat, tetapi belum bisa menyimpan perubahan.

## Isi spreadsheet
- **Pasien:** kolom A sampai J diisi aplikasi. Jangan ubah urutan kolom dan baris judul. Kolom K sampai N berisi rumus (Diagnosa, Lama Inap, Tarif per Hari, Total Biaya) supaya harga terlihat langsung di spreadsheet.
- **Tarif, ICD10, Pengaturan:** bisa diubah dari aplikasi (tab Master Data) atau langsung di sheet. Tarif contoh hanya contoh, sesuaikan dengan tarif resmi.
- Tanggal ditulis sebagai teks `2026-09-05`. Biarkan format itu agar aplikasi tidak salah baca.

## Cara hitung
- **Harga** = lama inap × tarif ruangan per hari + biaya lain.
- **Lama inap** = selisih tanggal masuk dan keluar, minimal 1 hari. Pasien yang belum keluar dihitung sampai hari ini.
- **Hari perawatan (HP)** dibagi per bulan sesuai hari menginap. Pendapatan dicatat pada bulan pasien keluar.
- BOR, AVLOS, TOI, BTO, NDR, GDR memakai rumus dari catatan rumah sakit (tampil di tab Rekap Bulanan). Batas ideal AVLOS, NDR, GDR adalah acuan umum Kemenkes.

## Catatan
- Mengganti `PIN` atau `KUNCI`: ubah di Code.gs, lalu buat **Deployment baru**. PIN baru langsung berlaku di semua perangkat.
- Setiap simpan atau muat butuh 1 sampai 3 detik karena lewat Google. Itu normal.
- Cadangan: Google Sheets menyimpan riwayat versi (File > Riwayat versi), dan Anda bisa mengunduh sheet sebagai Excel kapan saja.
- Bila Code.gs diubah, buat **Deployment baru** (Terapkan > Kelola deployment > Edit > Versi baru) agar perubahan berlaku.
