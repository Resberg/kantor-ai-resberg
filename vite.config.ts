import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
// Tipe minimal permintaan/jawaban (proyek ini tidak memasang @types/node).
type Req = { method?: string; url?: string; socket: { remoteAddress?: string }; on(e: string, f: (x: string) => void): void; destroy(e?: Error): void };
type Res = { statusCode: number; setHeader(k: string, v: string): void; end(s: string): void };

/**
 * Jembatan kantor ↔ agen, hanya saat `npm run dev` di laptop sendiri (tidak ada di GitHub Pages):
 * GET /api/laporan, GET /api/paket, POST /api/kerja {agen}, POST /api/chat {agen, pesan, riwayat}, POST /api/putuskan {video, aksi}.
 */
function agenApi(): Plugin {
  const LOKAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
  const body = (req: Req) =>
    new Promise<Record<string, unknown>>((ok, gagal) => {
      let d = '';
      req.on('data', (c) => {
        d += c;
        if (d.length > 100_000) req.destroy(new Error('Pesan terlalu besar'));
      });
      req.on('end', () => {
        try {
          ok(d ? JSON.parse(d) : {});
        } catch {
          gagal(new Error('Isi permintaan bukan JSON'));
        }
      });
      req.on('error', gagal);
    });
  const kirim = (res: Res, kode: number, isi: unknown) => {
    res.statusCode = kode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(isi));
  };
  return {
    name: 'agen-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api', async (rq, rs) => {
        const req = rq as unknown as Req;
        const res = rs as unknown as Res;
        // Agen memakai login Claude di laptop ini: jangan layani perangkat lain di jaringan.
        if (!LOKAL.has(req.socket.remoteAddress ?? '')) return kirim(res, 403, { error: 'Hanya dari laptop ini.' });
        try {
          // Dari folder proyek (config dibundel ke folder sementara, jadi jalur relatif salah arah).
          const root = server.config.root.replace(/\\/g, '/');
          const A = await import(/* @vite-ignore */ new URL('agen/jalan.mjs', `file://${root.startsWith('/') ? '' : '/'}${root}/`).href);
          const jalur = req.url?.split('?')[0];
          if (req.method === 'GET' && jalur === '/laporan') return kirim(res, 200, A.bacaLaporan());
          if (req.method === 'GET' && jalur === '/paket') return kirim(res, 200, A.daftarPaket());
          if (req.method !== 'POST') return kirim(res, 404, { error: 'Tidak ada' });
          const b = await body(req);
          if (jalur === '/kerja') return kirim(res, 200, { ok: await A.jalankan(String(b.agen)) ?? true });
          if (jalur === '/chat') return kirim(res, 200, { balasan: await A.ngobrol(String(b.agen), String(b.pesan ?? ''), Array.isArray(b.riwayat) ? b.riwayat : []) });
          if (jalur === '/putuskan') return kirim(res, 200, A.putuskan(String(b.video), String(b.aksi)));
          return kirim(res, 404, { error: 'Tidak ada' });
        } catch (e) {
          return kirim(res, 500, { error: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), agenApi()],
  base: mode === 'pages' ? '/kantor-ai-resberg/' : '/',
}));
