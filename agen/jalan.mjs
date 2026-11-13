// Agen sungguhan: tiap agen bekerja lewat `claude -p` lalu menulis hasilnya ke src/laporan.json (kantor membacanya).
// Pakai: node agen/jalan.mjs            -> semua agen berurutan (riset, konten, admin)
//        node agen/jalan.mjs riset      -> satu agen saja
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAPORAN = path.join(ROOT, 'src/laporan.json');
export const MASUK = path.join(ROOT, 'konten/masuk');
export const SIAP = path.join(ROOT, 'konten/siap');
const BISNIS = 'Koperasi Merdeka Resberg, usaha kreatif konten TikTok (juga Instagram Reels dan YouTube Shorts)';
const VIDEO = /\.(mp4|mov|webm)$/i;

/** Ambil objek hasil dari keluaran `claude -p --output-format json`. Lempar error kalau Claude gagal. */
export function bacaHasil(stdout) {
  const j = JSON.parse(stdout);
  if (j.is_error) throw new Error(`Claude gagal: ${j.result}`);
  if (j.structured_output) return j.structured_output;
  const m = String(j.result).match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`Claude tidak mengembalikan JSON: ${String(j.result).slice(0, 200)}`);
  return JSON.parse(m[0]);
}

function tanya(prompt, schema, tools = []) {
  const args = ['-p', prompt, '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--permission-mode', 'dontAsk'];
  if (tools.length) args.push('--allowedTools', ...tools);
  // cwd di folder sementara: agen tidak membaca atau mengubah file proyek.
  // Tanpa shell: di Windows shell tidak mengutip prompt yang berisi spasi/tanda kutip.
  const r = spawnSync('claude', args, { cwd: os.tmpdir(), encoding: 'utf8', timeout: 10 * 60_000, maxBuffer: 20 * 1024 * 1024 });
  if (r.error) throw r.error;
  return bacaHasil(r.stdout);
}

/** Gabungkan laporan satu agen ke isi laporan.json yang ada (agen lain tidak tersentuh). */
export function gabung(semua, key, laporan) {
  return { ...semua, [key]: laporan };
}

function tulisLaporan(key, laporan) {
  const lama = JSON.parse(fs.readFileSync(LAPORAN, 'utf8'));
  const tmp = `${LAPORAN}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(gabung(lama, key, laporan), null, 2) + '\n');
  fs.renameSync(tmp, LAPORAN); // ganti sekaligus, supaya kantor tidak membaca file setengah jadi
  console.log(`[${key}] ${laporan.ringkasan}`);
}

const LAPORAN_SCHEMA = {
  type: 'object',
  properties: {
    ringkasan: { type: 'string', description: 'Satu kalimat, maks 110 karakter.' },
    menunggu: { type: 'array', items: { type: 'string' }, description: 'Butir yang perlu keputusan pemilik, maks 3.' },
    angka: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, nilai: { type: 'string' } }, required: ['label', 'nilai'] } },
  },
  required: ['ringkasan'],
};

function riset() {
  const hasil = tanya(
    `Kamu Rani, agen riset tren untuk ${BISNIS}. Cari di web tren TikTok minggu ini (sound, format, topik) yang cocok untuk akun koperasi/UMKM di Indonesia. ` +
      'Laporkan dalam bahasa Indonesia: ringkasan satu kalimat berisi 3 temuan terpenting, `menunggu` berisi 1 keputusan untuk pemilik (mis. tren mana yang dipakai), ' +
      '`angka` berisi jumlah sumber yang dicek. Jangan mengarang; kalau tidak yakin, katakan.',
    LAPORAN_SCHEMA,
    ['WebSearch', 'WebFetch'],
  );
  tulisLaporan('riset', hasil);
}

const CAPTION_SCHEMA = {
  type: 'object',
  properties: {
    tiktok: { type: 'string', description: 'Caption TikTok + hashtag, maks 2200 karakter.' },
    instagram: { type: 'string', description: 'Caption Reels + hashtag.' },
    youtube_judul: { type: 'string', description: 'Judul Shorts, maks 100 karakter.' },
    youtube_deskripsi: { type: 'string' },
  },
  required: ['tiktok', 'instagram', 'youtube_judul', 'youtube_deskripsi'],
};

/** Video di konten/masuk yang belum punya paket di konten/siap. */
export function videoBaru(masuk = MASUK, siap = SIAP) {
  if (!fs.existsSync(masuk)) return [];
  return fs.readdirSync(masuk).filter((f) => VIDEO.test(f) && !fs.existsSync(path.join(siap, `${f}.json`)));
}

function konten() {
  fs.mkdirSync(SIAP, { recursive: true });
  const baru = videoBaru();
  for (const f of baru) {
    // Claude tidak menonton video: deskripsinya diambil dari file <nama video>.txt kalau ada, kalau tidak dari nama file.
    const txt = path.join(MASUK, `${f}.txt`);
    const deskripsi = fs.existsSync(txt) ? fs.readFileSync(txt, 'utf8').trim() : f.replace(VIDEO, '').replace(/[-_]+/g, ' ');
    const caption = tanya(
      `Kamu Laras, agen konten untuk ${BISNIS}. Tulis caption dalam bahasa Indonesia untuk video ini: "${deskripsi}". ` +
        'Hook kuat di kalimat pertama, ajakan bertindak di akhir, hashtag relevan. Jangan menjanjikan keuntungan uang atau klaim yang tidak bisa dibuktikan.',
      CAPTION_SCHEMA,
    );
    const paket = { video: f, deskripsi, status: 'menunggu', dibuat: new Date().toISOString(), caption };
    fs.writeFileSync(path.join(SIAP, `${f}.json`), JSON.stringify(paket, null, 2) + '\n');
    console.log(`[konten] paket siap: konten/siap/${f}.json`);
  }
  const semua = daftarPaket();
  tulisLaporan('konten', {
    ringkasan: baru.length ? `${baru.length} video baru diberi caption untuk TikTok, Reels, dan Shorts.` : 'Tidak ada video baru di konten/masuk.',
    angka: [{ label: 'Paket konten', nilai: `${semua.length} video` }],
  });
}

export function daftarPaket(siap = SIAP) {
  if (!fs.existsSync(siap)) return [];
  return fs.readdirSync(siap).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(siap, f), 'utf8')));
}

/** Dimas: tanpa AI, cukup aturan. Video yang belum disetujui jadi butir "menunggu" di Mission Board. */
export function laporanAdmin(paket) {
  const tunggu = paket.filter((p) => p.status === 'menunggu');
  const setuju = paket.filter((p) => p.status === 'disetujui');
  return {
    ringkasan: tunggu.length ? `${tunggu.length} video menunggu persetujuanmu sebelum diposting.` : 'Semua video sudah diputuskan.',
    menunggu: tunggu.map((p) => `Setujui posting: ${p.video}`),
    angka: [
      { label: 'Menunggu', nilai: `${tunggu.length} video` },
      { label: 'Disetujui', nilai: `${setuju.length} video` },
    ],
  };
}

const AGEN = { riset, konten, admin: () => tulisLaporan('admin', laporanAdmin(daftarPaket())) };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pilih = process.argv[2];
  if (pilih && !AGEN[pilih]) {
    console.error(`Agen tidak dikenal: ${pilih}. Pilih: ${Object.keys(AGEN).join(', ')}`);
    process.exit(1);
  }
  // Berurutan, bukan paralel: semua agen menulis ke laporan.json yang sama.
  for (const k of pilih ? [pilih] : Object.keys(AGEN)) {
    try {
      AGEN[k]();
    } catch (e) {
      console.error(`[${k}] gagal: ${e.message}`);
      process.exitCode = 1;
    }
  }
}
