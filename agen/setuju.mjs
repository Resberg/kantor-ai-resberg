// Setujui (atau tolak) video sebelum diposting, lalu perbarui laporan Dimas di kantor. Bisa juga lewat tombol di kantor.
// Pakai: node agen/setuju.mjs <nama-video.mp4>          -> disetujui
//        node agen/setuju.mjs <nama-video.mp4> tolak    -> ditolak
import { putuskan } from './jalan.mjs';

const [video, aksi] = process.argv.slice(2);
try {
  console.log(`${video}: ${putuskan(video, aksi).status}`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
