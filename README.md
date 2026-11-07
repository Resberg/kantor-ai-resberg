# Kantor AI 3D (template gratis)

Kantor isometrik 3D untuk agen AI kamu: tiap agen duduk di mejanya, mengetik saat jam tugas, menulis laporan sore, belajar malam, dan saat santai ngopi, lihat Mission Board, atau ngobrol di sofa. Ada gelembung ringkasan, tanda "!" untuk butir yang menunggu keputusan, meja berkedip untuk yang mendesak, dan timelapse satu hari kerja yang bisa direkam jadi video reels.

Dibuat dengan React + Three.js (bentuk sederhana, tanpa model 3D, jadi ringan di HP). Gratis, lisensi MIT.

Diambil dari halaman "Kantor" di **Imagiive Lapor**, sistem laporan internal Imagiive Group, tempat agen AI kami melapor setiap hari.

## Mulai

Butuh [Node.js](https://nodejs.org) 20+.

```bash
npm install
npm run dev
```

Buka http://localhost:5173.

| Alamat | Isi |
|---|---|
| `/` | Kantor dengan jam sekarang |
| `/?jam=08.10` | Kantor di jam tertentu |
| `/?timelapse=1` | Satu hari kerja dalam 30 detik (pagi, sore, malam) |
| `/?libur=1` | Ikuti akhir pekan sungguhan (default: kantor contoh tetap bekerja) |

## Ubah jadi kantormu

Semua ada di **`src/config.ts`**:

- `KANTOR`: nama dan subjudul di pojok kiri atas.
- `RUANGAN`: tiga ruangan, label, warna lantai dan karpet.
- `AGEN`: nama, tugas, ruangan, warna baju, posisi meja.
- `JADWAL`: jam tugas tiap agen (WIB) dan labelnya ("radar tender…").
- `LAPORAN`: ringkasan, butir menunggu, butir mendesak, dan angka hari ini.
- `BABAK`: tiga babak timelapse.

Tips: biar cepat, buka folder ini di Claude Code dan minta, misalnya, "ganti agennya jadi 4: Admin, Sales, Desainer, Penulis, jadwalnya …".

## Sambungkan agen asli

`LAPORAN` di `config.ts` sekarang data contoh. Untuk data asli, isi dari laporan agenmu, misalnya file JSON yang ditulis agen setiap sore atau API sistemmu, lalu muat di `src/App.tsx` (`fetch('/laporan.json')`). Jangan tampilkan nominal uang atau data rahasia kalau videonya mau dibagikan.

## Rekam jadi video

Butuh Google Chrome dan [ffmpeg](https://ffmpeg.org) (`brew install ffmpeg` di Mac). Biarkan `npm run dev` jalan, lalu di terminal lain:

```bash
npm run rekam -- kantor-ai.mp4
```

Hasilnya MP4 vertikal 1080×1920, 30 fps, 30 detik, direkam frame demi frame (bukan rekam layar), jadi mulus. Opsi: `--w 1920 --h 1080` untuk landscape, `--detik 15`, `--fps 60`. Lokasi Chrome/ffmpeg lain: `CHROME=/path FFMPEG=/path npm run rekam -- out.mp4`.

## Perintah lain

- `npm test`: tes logika jadwal, timelapse, dan agen santai.
- `npm run build`: versi siap unggah di folder `dist/` (bisa ditaruh di Netlify, Vercel, atau GitHub Pages).

## Lisensi

MIT. Bebas dipakai, diubah, dan dibagikan.
