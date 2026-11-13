// Agen sungguhan: tiap agen bekerja lewat `claude -p` lalu menulis hasilnya ke src/laporan.json (kantor membacanya).
// Dipakai dari kantor (tombol "Suruh kerja" & chat, lewat vite.config.ts) atau dari terminal:
//        node agen/jalan.mjs            -> semua agen berurutan (riset, konten, admin)
//        node agen/jalan.mjs riset      -> satu agen saja
import { execFile } from 'node:child_process';
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

async function tanya(prompt, schema, tools = []) {
  const args = ['-p', prompt, '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--permission-mode', 'dontAsk'];
  if (tools.length) args.push('--allowedTools', ...tools);
  // cwd di folder sementara: agen tidak membaca atau mengubah file proyek.
  // Tanpa shell: di Windows shell tidak mengutip prompt yang berisi spasi/tanda kutip.
  // Asinkron: kantor tetap jalan selama Claude bekerja.
  const stdout = await new Promise((ok, gagal) =>
    execFile('claude', args, { cwd: os.tmpdir(), encoding: 'utf8', timeout: 10 * 60_000, maxBuffer: 20 * 1024 * 1024 }, (e, out) =>
      out ? ok(out) : gagal(e?.code === 'ENOENT' ? new Error('Claude Code belum terpasang di laptop ini.') : e),
    ),
  );
  return bacaHasil(stdout);
}

/** Gabungkan laporan satu agen ke isi laporan.json yang ada (agen lain tidak tersentuh). */
export function gabung(semua, key, laporan) {
  return { ...semua, [key]: laporan };
}

const potong = (s, n) => (String(s).length <= n ? String(s) : `${String(s).slice(0, n - 1)}…`);

/** Batasi panjang teks: Mission Board dan gelembung di kantor hanya muat teks pendek. */
export function rapikan(l) {
  return {
    ringkasan: potong(l.ringkasan ?? '', 110),
    ...(l.menunggu && { menunggu: l.menunggu.slice(0, 3).map((s) => potong(s, 70)) }),
    ...(l.mendesak && { mendesak: l.mendesak.slice(0, 3).map((s) => potong(s, 70)) }),
    ...(l.angka && { angka: l.angka.slice(0, 2).map((a) => ({ label: potong(a.label, 18), nilai: potong(a.nilai, 12) })) }),
  };
}

export function bacaLaporan() {
  return JSON.parse(fs.readFileSync(LAPORAN, 'utf8'));
}

function tulisLaporan(key, laporan) {
  laporan = rapikan(laporan);
  const tmp = `${LAPORAN}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(gabung(bacaLaporan(), key, laporan), null, 2) + '\n');
  fs.renameSync(tmp, LAPORAN); // ganti sekaligus, supaya kantor tidak membaca file setengah jadi
  console.log(`[${key}] ${laporan.ringkasan}`);
}

const LAPORAN_SCHEMA = {
  type: 'object',
  properties: {
    ringkasan: { type: 'string', maxLength: 110, description: 'Satu kalimat, maks 110 karakter.' },
    menunggu: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 70 }, description: 'Butir yang perlu keputusan pemilik, singkat.' },
    angka: {
      type: 'array',
      maxItems: 2,
      description: 'Angka pendek untuk papan, mis. {label: "Sumber dicek", nilai: "6 sumber"}. Bukan kalimat.',
      items: { type: 'object', properties: { label: { type: 'string', maxLength: 18 }, nilai: { type: 'string', maxLength: 12 } }, required: ['label', 'nilai'] },
    },
  },
  required: ['ringkasan'],
};

async function riset() {
  const hasil = await tanya(
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

async function konten() {
  fs.mkdirSync(SIAP, { recursive: true });
  fs.mkdirSync(MASUK, { recursive: true });
  const baru = videoBaru();
  for (const f of baru) {
    // Claude tidak menonton video: deskripsinya diambil dari file <nama video>.txt kalau ada, kalau tidak dari nama file.
    const txt = path.join(MASUK, `${f}.txt`);
    const deskripsi = fs.existsSync(txt) ? fs.readFileSync(txt, 'utf8').trim() : f.replace(VIDEO, '').replace(/[-_]+/g, ' ');
    const caption = await tanya(
      `Kamu Laras, agen konten untuk ${BISNIS}. Tulis caption dalam bahasa Indonesia untuk video ini: "${deskripsi}". ` +
        'Hook kuat di kalimat pertama, ajakan bertindak di akhir, hashtag relevan. Jangan menjanjikan keuntungan uang atau klaim yang tidak bisa dibuktikan.',
      CAPTION_SCHEMA,
    );
    const paket = { video: f, deskripsi, status: 'menunggu', dibuat: new Date().toISOString(), caption };
    fs.writeFileSync(path.join(SIAP, `${f}.json`), JSON.stringify(paket, null, 2) + '\n');
    console.log(`[konten] paket siap: konten/siap/${f}.json`);
  }
  tulisLaporan('konten', {
    ringkasan: baru.length ? `${baru.length} video baru diberi caption untuk TikTok, Reels, dan Shorts.` : 'Tidak ada video baru di konten/masuk.',
    angka: [{ label: 'Paket konten', nilai: `${daftarPaket().length} video` }],
  });
  // Video baru langsung masuk antrean persetujuan di Mission Board.
  tulisLaporan('admin', laporanAdmin(daftarPaket()));
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

const PERAN = {
  riset: 'Rani, agen riset tren TikTok',
  admin: 'Dimas, agen admin: klien, brief, dan jadwal posting',
  konten: 'Laras, agen konten: ide, naskah, dan caption video',
};
const AGEN = { riset, konten, admin: async () => tulisLaporan('admin', laporanAdmin(daftarPaket())) };
const sibuk = new Set();

/** Satu kerja per agen sekaligus: klik "Suruh kerja" dua kali tidak membuat kerja ganda. */
async function giliran(key, kerja) {
  if (!PERAN[key]) throw new Error(`Agen tidak dikenal: ${key}`);
  if (sibuk.has(key)) throw new Error('Agen ini masih bekerja, tunggu sebentar.');
  sibuk.add(key);
  try {
    return await kerja();
  } finally {
    sibuk.delete(key);
  }
}

export const jalankan = (key) => giliran(key, () => AGEN[key]());

const CHAT_SCHEMA = {
  type: 'object',
  properties: {
    balasan: { type: 'string', description: 'Jawaban untuk pemilik, bahasa Indonesia santai, maks 5 kalimat.' },
    laporan: { ...LAPORAN_SCHEMA, description: 'Isi HANYA kalau percakapan ini menghasilkan hal baru untuk Mission Board (keputusan yang ditunggu, temuan, angka).' },
  },
  required: ['balasan'],
};

/** Chat dengan satu agen. Kalau agen mengisi `laporan`, Mission Board ikut berubah. */
export const ngobrol = (key, pesan, riwayat = []) =>
  giliran(key, async () => {
    if (!String(pesan ?? '').trim()) throw new Error('Pesan kosong.');
    const lalu = riwayat
      .slice(-6)
      .map((m) => `${m.dari === 'aku' ? 'Pemilik' : 'Kamu'}: ${m.teks}`)
      .join('\n');
    const sekarang = JSON.stringify(bacaLaporan()[key] ?? {});
    const hasil = await tanya(
      `Kamu ${PERAN[key]} untuk ${BISNIS}. Laporanmu hari ini: ${sekarang}.\n${lalu ? `Percakapan sebelumnya:\n${lalu}\n` : ''}Pemilik: ${pesan}\n` +
        'Jawab sebagai agen itu. Jangan mengarang data; jangan menjanjikan keuntungan uang. ' +
        'Kamu hanya bisa menjawab dan mengisi Mission Board: kamu TIDAK bisa memposting, mengunggah, menjadwalkan, atau menyetujui video. ' +
        'Persetujuan lewat tombol ✓ Setujui / ✕ Tolak di jendela Dimas; posting dilakukan pemilik sendiri.',
      CHAT_SCHEMA,
      key === 'riset' ? ['WebSearch', 'WebFetch'] : [],
    );
    if (hasil.laporan?.ringkasan) tulisLaporan(key, hasil.laporan);
    return hasil.balasan;
  });

/** Setujui atau tolak paket video, lalu perbarui laporan Dimas. */
export function putuskan(video, aksi) {
  const file = path.join(SIAP, `${path.basename(String(video))}.json`);
  if (!fs.existsSync(file)) throw new Error(`Paket tidak ditemukan: ${video}`);
  const paket = JSON.parse(fs.readFileSync(file, 'utf8'));
  paket.status = aksi === 'tolak' ? 'ditolak' : 'disetujui';
  paket.diputuskan = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(paket, null, 2) + '\n');
  tulisLaporan('admin', laporanAdmin(daftarPaket()));
  return paket;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pilih = process.argv[2];
  if (pilih && !AGEN[pilih]) {
    console.error(`Agen tidak dikenal: ${pilih}. Pilih: ${Object.keys(AGEN).join(', ')}`);
    process.exit(1);
  }
  // Berurutan, bukan paralel: semua agen menulis ke laporan.json yang sama.
  for (const k of pilih ? [pilih] : Object.keys(AGEN)) {
    try {
      await jalankan(k);
    } catch (e) {
      console.error(`[${k}] gagal: ${e.message}`);
      process.exitCode = 1;
    }
  }
}
