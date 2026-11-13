import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { GAYA, KANTOR, LAPORAN, TAMPIL_PEMILIH_GAYA, type Laporan } from './config';
import { DAFTAR_GAYA, KUNCI_SIMPAN, cariGaya, gayaAwal, type GayaId } from './gaya/daftar';
import { IDLE_LABEL, idleAt, isNight, isoDay, lapseAt, missionBoard, officeDesks, params as readParams, type DeskState, type IdleSpot } from './office';

const OfficeScene = lazy(() => import('./OfficeScene'));

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export default function App() {
  const p = useMemo(() => readParams(new URLSearchParams(location.search)), []);
  const [now, setNow] = useState(() => new Date());
  const [t, setT] = useState(0);
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Laporan terbaru dari laptop (npm run dev): agen menulis src/laporan.json, kantor membacanya tiap 3 detik.
  const [laporan, setLaporan] = useState<Record<string, Laporan>>(LAPORAN);
  const [chat, setChat] = useState<Record<string, Pesan[]>>({});
  const segarkan = () => api<Record<string, Laporan>>('/laporan').then(setLaporan, () => {});
  useEffect(() => {
    if (!LOKAL || p.rec) return;
    void segarkan();
    const id = window.setInterval(segarkan, 3000);
    return () => window.clearInterval(id);
  }, [p.rec]);
  const drive = useRef<((t: number) => void) | null>(null);
  const anchors = useRef(new Map<string, HTMLElement>());
  const boardAnchor = useRef<HTMLElement | null>(null);
  const [gaya, setGaya] = useState<GayaId>(() => {
    let simpanan: string | null = null;
    try {
      simpanan = localStorage.getItem(KUNCI_SIMPAN);
    } catch {
      /* penyimpanan diblokir: pakai config */
    }
    return gayaAwal(new URLSearchParams(location.search).get('gaya'), simpanan, GAYA);
  });
  const [pilihBuka, setPilihBuka] = useState(false);
  const gantiGaya = (id: GayaId) => {
    setGaya(id);
    setPilihBuka(false);
    try {
      localStorage.setItem(KUNCI_SIMPAN, id);
    } catch {
      /* abaikan */
    }
    const q = new URLSearchParams(location.search);
    q.set('gaya', id);
    history.replaceState(null, '', `${location.pathname}?${q}`);
  };
  const g = cariGaya(gaya);

  // Scene time (agents walking, bubbles) and, with ?timelapse=1, the office clock. ?rekam=1: window.__koFrame(t).
  useEffect(() => {
    if (p.rec) {
      const w = window as unknown as { __koFrame?: (t: number) => boolean };
      w.__koFrame = (x: number) => {
        flushSync(() => setT(x));
        drive.current?.(x);
        return !!drive.current;
      };
      return () => void delete w.__koFrame;
    }
    const start = performance.now();
    const id = window.setInterval(() => {
      setT((performance.now() - start) / 1000);
      setNow(new Date());
    }, 100);
    return () => window.clearInterval(id);
  }, [p.rec]);

  const lapse = p.lapse ? lapseAt(t) : null;
  const time = lapse?.time ?? p.time ?? hm(now);
  const desks = officeDesks(isoDay(now), time, p.alwaysWork, laporan);
  const board = missionBoard(desks, laporan);
  const open = desks.find((d) => d.desk.key === openKey) ?? null;
  const night = isNight(time);
  const withBubble = desks.filter((d) => d.bubble);
  const spotKey = withBubble.length ? withBubble[Math.floor(t / 2.5) % withBubble.length]!.desk.key : null;
  const working = desks.filter((d) => ['kerja', 'laporan', 'belajar'].includes(d.doing.activity)).length;
  const idle = desks.filter((d) => d.doing.activity === 'siaga').length;
  const latar = g.latar && (night ? g.latar.malam : g.latar.siang);

  return (
    <div className="ko" data-night={night || !!g.malam || undefined} data-gaya={gaya} style={latar ? { background: latar } : undefined}>
      <div className="ko-stage">
        <Suspense fallback={<div className="ko-loading">Menyiapkan kantor…</div>}>
          <OfficeScene
            desks={desks}
            night={night}
            boardCount={Math.min(board.items.length, 8)}
            anchors={anchors}
            boardAnchor={boardAnchor}
            cinematic
            manual={p.rec}
            drive={drive}
            gaya={gaya}
          />
        </Suspense>
        {g.tiltShift && <div className="ko-tilt" aria-hidden="true" />}
        <div className="ko-layer">
          {desks.map((d) => (
            <Tag
              key={d.desk.key}
              d={d}
              spot={spotKey === d.desk.key}
              idle={d.doing.activity === 'siaga' ? idleAt(d.desk.key, t).spot : null}
              refFn={(el) => (el ? anchors.current.set(d.desk.key, el) : anchors.current.delete(d.desk.key))}
              onOpen={() => setOpenKey(d.desk.key)}
            />
          ))}
          <span className="ko-board-pin" ref={(el) => void (boardAnchor.current = el)}>
            Mission Board
          </span>
        </div>
      </div>

      <header className="ko-hud">
        <div className="ko-brand">
          <span className="ko-live" />
          <div>
            <b>{KANTOR.nama}</b>
            <small>
              {KANTOR.subjudul} · {working} bekerja · {idle} santai · {board.items.length} misi
            </small>
          </div>
        </div>
        <div className="ko-clock">
          <b>{time.replace(':', '.')}</b>
          <small>
            {HARI[now.getDay()]}, {now.getDate()} {BULAN[now.getMonth()]} {now.getFullYear()}
          </small>
        </div>
      </header>

      {lapse && (!p.rec || lapse.inAct < 3) && (
        <p key={lapse.act} className="ko-act" style={p.rec ? { animation: 'none', opacity: Math.max(0, Math.min(1, lapse.inAct * 3, (3 - lapse.inAct) * 2)) } : undefined}>
          {lapse.title}
        </p>
      )}

      <aside className="ko-mini">
        <h2>Mission Board</h2>
        <ul>
          {board.items.slice(0, 3).map((it, i) => (
            <li key={i}>
              <b style={{ color: it.color }}>{it.name}</b> {it.text}
            </li>
          ))}
        </ul>
        {board.metrics.length > 0 && (
          <dl>
            {board.metrics.slice(0, 4).map((m, i) => (
              <div key={i}>
                <dd>{m.nilai}</dd>
                <dt>{m.label}</dt>
              </div>
            ))}
          </dl>
        )}
      </aside>

      {TAMPIL_PEMILIH_GAYA && !p.rec && (
        <nav className="ko-gaya" aria-label="Gaya 3D">
          {pilihBuka && (
            <ul>
              {DAFTAR_GAYA.map((x) => (
                <li key={x.id}>
                  <button type="button" aria-pressed={x.id === gaya} title={x.ket} onClick={() => gantiGaya(x.id as GayaId)}>
                    {x.nama}
                    {x.jenis === 'paduan' && <small>dunia</small>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="ko-gaya-btn" aria-expanded={pilihBuka} onClick={() => setPilihBuka((b) => !b)}>
            Gaya: {g.nama}
          </button>
        </nav>
      )}

      {open && (
        <div className="ko-sheet" role="dialog" aria-label={open.agen.nama} onClick={() => setOpenKey(null)}>
          <div className="ko-sheet-in" onClick={(e) => e.stopPropagation()}>
            <h3>
              {open.agen.nama} <small>{open.agen.tugas}</small>
            </h3>
            <p>
              Sekarang: <b>{open.doing.label}</b>
            </p>
            {open.bubble && <p className="ko-sheet-sum">{open.bubble}</p>}
            {open.urgent.length > 0 && <p className="ko-sheet-urgent">⚠ {open.urgent.join(' · ')}</p>}
            {open.waiting.length > 0 && (
              <ul>
                {open.waiting.map((w, i) => (
                  <li key={i}>⏳ {w}</li>
                ))}
              </ul>
            )}
            {LOKAL && (
              <AgenPanel
                k={open.desk.key}
                nama={open.agen.nama}
                log={chat[open.desk.key] ?? []}
                setLog={(fn) => setChat((c) => ({ ...c, [open.desk.key]: fn(c[open.desk.key] ?? []) }))}
                segarkan={segarkan}
              />
            )}
            <button type="button" onClick={() => setOpenKey(null)}>
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Chat & tombol agen hanya ada di laptop sendiri (npm run dev); versi web (GitHub Pages) hanya menampilkan. */
const LOKAL = import.meta.env.DEV;
type Pesan = { dari: 'aku' | 'agen'; teks: string };
type Paket = { video: string; status: string; caption: { tiktok: string; instagram: string; youtube_judul: string; youtube_deskripsi: string } };

async function api<T>(jalur: string, isi?: unknown): Promise<T> {
  const r = await fetch(`/api${jalur}`, isi === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isi) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? 'Gagal');
  return j as T;
}

function AgenPanel({ k, nama, log, setLog, segarkan }: { k: string; nama: string; log: Pesan[]; setLog: (fn: (l: Pesan[]) => Pesan[]) => void; segarkan: () => void }) {
  const [pesan, setPesan] = useState('');
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [paket, setPaket] = useState<Paket[]>([]);
  const muatPaket = () => api<Paket[]>('/paket').then(setPaket, () => {});
  useEffect(() => {
    void muatPaket();
  }, [k]);
  const tambah = (m: Pesan) => setLog((l) => [...l, m]);
  const lakukan = async (label: string, kerja: () => Promise<void>) => {
    setSibuk(label);
    try {
      await kerja();
    } catch (e) {
      tambah({ dari: 'agen', teks: `⚠ ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSibuk(null);
      segarkan();
      void muatPaket();
    }
  };
  const kirim = (e: React.FormEvent) => {
    e.preventDefault();
    const teks = pesan.trim();
    if (!teks || sibuk) return;
    setPesan('');
    tambah({ dari: 'aku', teks });
    void lakukan(`${nama} sedang membalas…`, async () => {
      const r = await api<{ balasan: string }>('/chat', { agen: k, pesan: teks, riwayat: log });
      tambah({ dari: 'agen', teks: r.balasan });
    });
  };
  const putuskan = (video: string, aksi: string) => void lakukan('Menyimpan…', async () => void (await api('/putuskan', { video, aksi })));
  // Laras & Dimas menampilkan video yang menunggu; hanya Dimas yang memutuskan.
  const tunggu = k === 'riset' ? [] : paket.filter((x) => x.status === 'menunggu');
  return (
    <div className="ko-agen">
      <button type="button" disabled={!!sibuk} onClick={() => void lakukan(`${nama} sedang bekerja…`, async () => void (await api('/kerja', { agen: k })))}>
        Suruh kerja sekarang
      </button>
      {tunggu.length > 0 && (
        <ul className="ko-paket">
          {tunggu.map((x) => (
            <li key={x.video}>
              <b>{x.video}</b>
              <p>{x.caption.tiktok.slice(0, 140)}…</p>
              <div>
                <button type="button" onClick={() => void navigator.clipboard.writeText(x.caption.tiktok)}>
                  Salin caption TikTok
                </button>
                <button type="button" onClick={() => void navigator.clipboard.writeText(x.caption.instagram)}>
                  Salin caption Reels
                </button>
                <button type="button" onClick={() => void navigator.clipboard.writeText(`${x.caption.youtube_judul}\n\n${x.caption.youtube_deskripsi}`)}>
                  Salin Shorts
                </button>
                {k === 'admin' && (
                  <>
                    <button type="button" disabled={!!sibuk} onClick={() => putuskan(x.video, 'setuju')}>
                      ✓ Setujui
                    </button>
                    <button type="button" disabled={!!sibuk} onClick={() => putuskan(x.video, 'tolak')}>
                      ✕ Tolak
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="ko-chat" aria-live="polite">
        {log.map((m, i) => (
          <p key={i} data-dari={m.dari}>
            {m.teks}
          </p>
        ))}
        {sibuk && <p data-dari="sibuk">{sibuk}</p>}
      </div>
      <form onSubmit={kirim}>
        <input value={pesan} onChange={(e) => setPesan(e.target.value)} placeholder={`Tulis pesan untuk ${nama}…`} aria-label={`Pesan untuk ${nama}`} disabled={!!sibuk} />
        <button type="submit" disabled={!!sibuk || !pesan.trim()}>
          Kirim
        </button>
      </form>
    </div>
  );
}

function Tag({ d, spot, idle, refFn, onOpen }: { d: DeskState; spot: boolean; idle: IdleSpot | null; refFn: (el: HTMLElement | null) => void; onOpen: () => void }) {
  const label = idle ? IDLE_LABEL[idle] : d.doing.label;
  const a = d.doing.activity;
  const think = a === 'kerja' ? '</>' : a === 'laporan' ? '•••' : a === 'belajar' ? '📖' : idle === 'kopi' ? '☕' : idle === 'papan' ? '📌' : idle === 'sofa' ? '💬' : null;
  return (
    <div className="ko-tag" ref={refFn} data-act={a} style={{ ['--agent' as string]: d.desk.color }}>
      <div className="ko-tag-in">
        {d.bubble && spot && a !== 'pulang' && <p className="ko-bubble">{d.bubble}</p>}
        {think && !(d.bubble && spot) && <span className="ko-think">{think}</span>}
        <div className="ko-tag-row">
          <button type="button" className="ko-name" onClick={onOpen}>
            <span className="ko-dot" />
            {d.agen.nama}
            <span className="ko-name-act">{label}</span>
          </button>
          {d.waiting.length > 0 && (
            <button type="button" className="ko-bang" onClick={onOpen} aria-label={`${d.waiting.length} butir menunggu keputusan`}>
              !
            </button>
          )}
          {d.urgent.length > 0 && <span className="ko-urgent">⚠</span>}
        </div>
      </div>
    </div>
  );
}
