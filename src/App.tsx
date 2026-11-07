import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { KANTOR } from './config';
import { IDLE_LABEL, idleAt, isNight, isoDay, lapseAt, missionBoard, officeDesks, params as readParams, type DeskState, type IdleSpot } from './office';

const OfficeScene = lazy(() => import('./OfficeScene'));

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export default function App() {
  const p = useMemo(() => readParams(new URLSearchParams(location.search)), []);
  const [now, setNow] = useState(() => new Date());
  const [t, setT] = useState(0);
  const [open, setOpen] = useState<DeskState | null>(null);
  const drive = useRef<((t: number) => void) | null>(null);
  const anchors = useRef(new Map<string, HTMLElement>());
  const boardAnchor = useRef<HTMLElement | null>(null);

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
  const desks = officeDesks(isoDay(now), time, p.alwaysWork);
  const board = missionBoard(desks);
  const night = isNight(time);
  const withBubble = desks.filter((d) => d.bubble);
  const spotKey = withBubble.length ? withBubble[Math.floor(t / 2.5) % withBubble.length]!.desk.key : null;
  const working = desks.filter((d) => ['kerja', 'laporan', 'belajar'].includes(d.doing.activity)).length;
  const idle = desks.filter((d) => d.doing.activity === 'siaga').length;

  return (
    <div className="ko" data-night={night || undefined}>
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
          />
        </Suspense>
        <div className="ko-layer">
          {desks.map((d) => (
            <Tag
              key={d.desk.key}
              d={d}
              spot={spotKey === d.desk.key}
              idle={d.doing.activity === 'siaga' ? idleAt(d.desk.key, t).spot : null}
              refFn={(el) => (el ? anchors.current.set(d.desk.key, el) : anchors.current.delete(d.desk.key))}
              onOpen={() => setOpen(d)}
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

      {open && (
        <div className="ko-sheet" role="dialog" aria-label={open.agen.nama} onClick={() => setOpen(null)}>
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
            <button type="button" onClick={() => setOpen(null)}>
              Tutup
            </button>
          </div>
        </div>
      )}
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
