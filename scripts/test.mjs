// Tes logika kantor: node scripts/test.mjs
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const O = (await runnerImport(path.join(root, 'src/office.ts'), { root, configFile: false, cacheDir: path.join(os.tmpdir(), 'kantor-vite'), logLevel: 'error' })).module;

let n = 0;
const t = (name, fn) => {
  fn();
  n++;
};
t('jadwal pagi, laporan, belajar, libur', () => {
  assert.equal(O.agentDoing('riset', 1, '07:57').label, 'cek sound & tren FYP…');
  assert.equal(O.agentDoing('admin', 1, '07:32').activity, 'kerja');
  assert.equal(O.agentDoing('konten', 1, '15:50').activity, 'laporan');
  assert.equal(O.agentDoing('konten', 6, '21:00').activity, 'belajar');
  assert.equal(O.agentDoing('riset', 1, '10:00').activity, 'siaga');
  assert.equal(O.agentDoing('riset', 1, '23:00').activity, 'pulang');
  assert.equal(O.agentDoing('riset', 6, '07:57').activity, 'pulang');
  assert.equal(O.agentDoing('riset', 6, '07:57', true).activity, 'kerja');
});
t('timelapse tiga babak, berulang', () => {
  assert.equal(O.LAPSE_SECONDS, 30);
  assert.equal(O.lapseAt(0).time, '07:28');
  assert.equal(O.lapseAt(16).act, 1);
  assert.equal(O.lapseAt(30).time, '07:28');
});
t('agen santai pergi dan kembali', () => {
  const seen = new Set();
  for (let x = 0; x < 48; x += 0.5) seen.add(O.idleAt('riset', x).spot);
  assert.ok(seen.has('meja') && seen.size >= 3);
});
t('meja dan Mission Board', () => {
  const desks = O.officeDesks(1, '10:00');
  assert.equal(desks.length, 3);
  assert.ok(desks.every((d) => d.bubble));
  // laporan.json sekarang ditulis agen sungguhan, jadi jumlah butirnya berubah-ubah: cek bentuknya saja.
  assert.ok(O.missionBoard(desks).items.every((it) => it.name && it.text));
});
t('parameter URL', () => {
  assert.deepEqual(O.params(new URLSearchParams('timelapse=1&rekam=1&jam=08.10')), { lapse: true, rec: true, time: '08:10', alwaysWork: true });
});
const G = (await runnerImport(path.join(root, 'src/gaya/daftar.ts'), { root, configFile: false, cacheDir: path.join(os.tmpdir(), 'kantor-vite'), logLevel: 'error' })).module;
t('16 gaya + asli, urutan pilihan gaya', () => {
  assert.equal(G.DAFTAR_GAYA.length, 17);
  assert.equal(new Set(G.DAFTAR_GAYA.map((g) => g.id)).size, 17);
  assert.equal(G.DAFTAR_GAYA.filter((g) => g.jenis === 'paduan').length, 9);
  assert.equal(G.gayaAwal('clay', 'voxel', 'asli'), 'clay');
  assert.equal(G.gayaAwal('ngawur', 'voxel', 'asli'), 'voxel');
  assert.equal(G.gayaAwal(null, null, 'taman'), 'taman');
  assert.equal(G.gayaAwal(null, 'x', 'y'), 'asli');
  assert.equal(G.cariGaya('ngawur').id, 'asli');
});
const A = await import('../agen/jalan.mjs');
t('agen: baca hasil Claude, gabung laporan, video baru, persetujuan', () => {
  assert.deepEqual(A.bacaHasil(JSON.stringify({ is_error: false, structured_output: { ringkasan: 'x' } })), { ringkasan: 'x' });
  assert.deepEqual(A.bacaHasil(JSON.stringify({ is_error: false, result: 'Ini dia: {"ringkasan":"y"}' })), { ringkasan: 'y' });
  assert.throws(() => A.bacaHasil(JSON.stringify({ is_error: true, result: 'Not logged in' })), /Not logged in/);
  assert.deepEqual(A.gabung({ riset: 1, admin: 2 }, 'riset', 3), { riset: 3, admin: 2 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agen-'));
  const masuk = path.join(dir, 'masuk'), siap = path.join(dir, 'siap');
  fs.mkdirSync(masuk); fs.mkdirSync(siap);
  for (const f of ['a.mp4', 'b.MOV', 'a.mp4.txt', 'catatan.txt']) fs.writeFileSync(path.join(masuk, f), '');
  fs.writeFileSync(path.join(siap, 'a.mp4.json'), '{}');
  assert.deepEqual(A.videoBaru(masuk, siap), ['b.MOV']);
  assert.deepEqual(A.videoBaru(path.join(dir, 'tidak-ada'), siap), []);
  const lap = A.laporanAdmin([{ video: 'a.mp4', status: 'menunggu' }, { video: 'b.mp4', status: 'disetujui' }]);
  assert.deepEqual(lap.menunggu, ['Setujui posting: a.mp4']);
  assert.equal(A.laporanAdmin([]).menunggu.length, 0);
});
console.log(`${n} tes lulus`);
