// Setujui (atau tolak) video sebelum diposting, lalu perbarui laporan Dimas di kantor.
// Pakai: node agen/setuju.mjs <nama-video.mp4>          -> disetujui
//        node agen/setuju.mjs <nama-video.mp4> tolak    -> ditolak
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIAP } from './jalan.mjs';

const [video, aksi] = process.argv.slice(2);
const file = video && path.join(SIAP, `${path.basename(video)}.json`);
if (!file || !fs.existsSync(file)) {
  console.error(`Paket tidak ditemukan. Yang ada: ${fs.existsSync(SIAP) ? fs.readdirSync(SIAP).map((f) => f.replace(/\.json$/, '')).join(', ') || '(kosong)' : '(kosong)'}`);
  process.exit(1);
}
const paket = JSON.parse(fs.readFileSync(file, 'utf8'));
paket.status = aksi === 'tolak' ? 'ditolak' : 'disetujui';
paket.diputuskan = new Date().toISOString();
fs.writeFileSync(file, JSON.stringify(paket, null, 2) + '\n');
console.log(`${paket.video}: ${paket.status}`);
spawnSync(process.execPath, [fileURLToPath(new URL('./jalan.mjs', import.meta.url)), 'admin'], { stdio: 'inherit' });
