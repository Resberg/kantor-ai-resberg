import { useEffect, useRef } from 'react';
import {
  AmbientLight,
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Material,
  type BufferGeometry,
  OrthographicCamera,
  PointLight,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RUANGAN } from './config';

type AgentKey = string;
import { idleAt, type DeskState, type IdleSpot } from './office';

/*
 * Kantor AI 3D (Three.js). Bentuk sederhana saja (tanpa model/tekstur) supaya ringan di HP. Label dan gelembung adalah HTML
 * di atas kanvas (`anchors`); komponen ini hanya memindahkannya tiap frame. `manual` (rekam): tanpa loop, halaman menggambar
 * frame t lewat `drive.current(t)`.
 */

export interface SceneProps {
  desks: readonly DeskState[];
  night: boolean;
  boardCount: number;
  anchors: React.RefObject<Map<AgentKey, HTMLElement>>;
  boardAnchor: React.RefObject<HTMLElement | null>;
  /** Bigger, slowly orbiting, agents walking, lamps at night: the full-screen office. */
  cinematic?: boolean;
  manual?: boolean;
  drive?: React.RefObject<((t: number) => void) | null>;
  onReady?: () => void;
  onFail?: () => void;
}

const shade = (hex: string, f: number) => {
  const c = new Color(hex);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
};
const ROOMS = RUANGAN.map((r) => ({ x0: r.x0, x1: r.x1, floor: r.warna, floorNight: shade(r.warna, 0.32), rug: r.karpet }));
const Z0 = -3.5;
const Z1 = 3;
const SKIN = ['#f1c7a5', '#d9a07b', '#c68863', '#e8b896', '#b97a56', '#f0c09c'];
const HAIR = ['#2b1d16', '#1b1330', '#5a3825', '#2b1d16', '#7a4a2a', '#1b1330'];
const BOARD = new Vector3(0.1, 0, -2.5);

interface Actor {
  key: AgentKey;
  root: Group;
  body: Mesh;
  head: Mesh;
  armL: Mesh;
  armR: Mesh;
  legL: Mesh;
  legR: Mesh;
  screen: Mesh;
  deskTop: Mesh;
  book: Mesh;
  lamp: Mesh;
  light: PointLight | null;
  seat: Vector3;
  label: Vector3;
  phase: number;
  index: number;
}

const smooth = (x: number) => x * x * (3 - 2 * x);

export default function OfficeScene({ desks, night, boardCount, anchors, boardAnchor, cinematic, manual, drive, onReady, onFail }: SceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef({ desks, night, boardCount, dirty: true });
  live.current = { desks, night, boardCount, dirty: true };

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: WebGLRenderer;
    const touch = window.matchMedia('(pointer: coarse)').matches;
    try {
      renderer = new WebGLRenderer({ antialias: !touch || !!manual, alpha: true, powerPreference: manual ? 'high-performance' : 'low-power', preserveDrawingBuffer: !!manual });
    } catch {
      onFail?.();
      return;
    }
    renderer.setPixelRatio(manual ? 1 : Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');

    const scene = new Scene();
    if (cinematic) scene.fog = new Fog('#f3e9de', 30, 48);
    const camera = new OrthographicCamera(-10, 10, 6, -6, 0.1, 100);
    const target = new Vector3(-0.3, 1.2, -0.3);

    const hemi = new HemisphereLight('#fff6ea', '#a58b73', 1.5);
    const sun = new DirectionalLight('#ffe2b8', 1.7);
    sun.position.set(-6, 12, 8);
    const amb = new AmbientLight('#ffffff', 0.35);
    scene.add(hemi, sun, amb);

    const disposables: { dispose(): void }[] = [];
    const geo = <T extends BufferGeometry>(g: T) => (disposables.push(g), g);
    const mat = (color: string, emissive?: string) => {
      const m = new MeshLambertMaterial({ color, emissive: emissive ? new Color(emissive) : undefined });
      disposables.push(m);
      return m;
    };
    const add = (mesh: Mesh, x: number, y: number, z: number, parent: Scene | Group | Mesh = scene) => {
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    const box = (w: number, h: number, d: number, m: Material, x: number, y: number, z: number, parent?: Group) => add(new Mesh(geo(new BoxGeometry(w, h, d)), m), x, y, z, parent);

    // ---------- the building ----------
    const lineM = mat('#cdb79c');
    const floors = ROOMS.map((r) => {
      const m = mat(r.floor);
      box(r.x1 - r.x0 - 0.04, 0.14, Z1 - Z0, m, (r.x0 + r.x1) / 2, -0.07, (Z0 + Z1) / 2);
      for (let z = Z0 + 0.5; z < Z1; z += 0.65) box(r.x1 - r.x0 - 0.1, 0.005, 0.02, lineM, (r.x0 + r.x1) / 2, 0.002, z);
      box(2.6, 0.02, 1.8, mat(r.rug), (r.x0 + r.x1) / 2, 0.012, 0.8);
      return { m, r };
    });
    box(14.6, 0.5, Z1 - Z0 + 0.6, mat('#3a2a5c'), 0, -0.4, (Z0 + Z1) / 2 + 0.15);
    const wallM = mat('#fbf6ef');
    const wallSideM = mat('#f1e8dc');
    const trimM = mat('#271b3f');
    const woodM = mat('#a87c56');
    box(14, 3, 0.18, wallM, 0, 1.5, Z0 - 0.09);
    box(0.18, 3, Z1 - Z0, wallSideM, -7.09, 1.5, (Z0 + Z1) / 2);
    box(14, 0.12, 0.22, woodM, 0, 0.06, Z0 - 0.02);
    box(0.22, 0.12, Z1 - Z0, woodM, -7.02, 0.06, (Z0 + Z1) / 2);
    for (const x of [-1.8, 2]) {
      box(0.14, 1.25, 2.6, wallSideM, x, 0.62, Z0 + 1.3);
      box(0.14, 1.25, 2.0, wallSideM, x, 0.62, Z1 - 1.0);
      box(0.18, 0.06, 2.6, woodM, x, 1.27, Z0 + 1.3);
      box(0.18, 0.06, 2.0, woodM, x, 1.27, Z1 - 1.0);
    }
    const glassM = mat('#bfe3ff', '#7fb8e6');
    for (const x of [-5.6, -3.4, 3.4, 5.6]) {
      box(1.6, 1.2, 0.06, trimM, x, 1.8, Z0 + 0.02);
      box(1.44, 1.04, 0.04, glassM, x, 1.8, Z0 + 0.05);
      box(0.05, 1.04, 0.05, trimM, x, 1.8, Z0 + 0.07);
    }
    for (const z of [-1.2, 1.4]) {
      box(0.06, 1.1, 1.4, trimM, -7.0, 1.8, z);
      box(0.04, 0.96, 1.26, glassM, -6.97, 1.8, z);
    }
    for (const r of ROOMS) box(1.6, 0.26, 0.04, mat(r.rug, r.rug), (r.x0 + r.x1) / 2, 2.75, Z0 + 0.03);

    // Mission Board with sticky notes for the open items.
    box(3.2, 1.6, 0.1, trimM, BOARD.x, 1.75, Z0 + 0.05);
    box(3.0, 1.4, 0.04, mat('#f7f2ea'), BOARD.x, 1.75, Z0 + 0.11);
    const noteColors = ['#ffd166', '#f3355b', '#7bdff2', '#b2f7ef', '#f7aef8', '#cdb4db', '#ffd166', '#7bdff2'];
    const notes = noteColors.map((c, i) => {
      const n = box(0.5, 0.4, 0.02, mat(c, c), BOARD.x - 1.05 + (i % 4) * 0.7, 2.12 - Math.floor(i / 4) * 0.6, Z0 + 0.15);
      (n.material as MeshLambertMaterial).emissiveIntensity = 0.2;
      n.rotation.z = ((i * 37) % 7) / 60 - 0.05;
      return n;
    });

    // Furniture.
    const shelf = (x: number, z: number, rot = 0) => {
      const g = new Group();
      box(1.2, 1.8, 0.36, woodM, 0, 0.9, 0, g);
      const bookColors = ['#e4572e', '#2a9d8f', '#f2b134', '#3a86ff', '#8e6bd8', '#ff5d8f'];
      for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) box(0.14, 0.34, 0.26, mat(bookColors[(i + row) % 6]!), -0.45 + i * 0.18, 0.4 + row * 0.55, 0.04, g);
      g.position.set(x, 0, z);
      g.rotation.y = rot;
      scene.add(g);
    };
    shelf(-6.75, 0.0, Math.PI / 2);
    shelf(6.2, -3.2);
    const potM = mat('#c26b3b');
    const leafM = mat('#3f9b4f');
    const leaf2M = mat('#5bbf5e');
    const plant = (x: number, z: number, s = 1) => {
      add(new Mesh(geo(new CylinderGeometry(0.2 * s, 0.16 * s, 0.4 * s, 12)), potM), x, 0.2 * s, z);
      add(new Mesh(geo(new ConeGeometry(0.34 * s, 0.9 * s, 8)), leafM), x, 0.85 * s, z);
      add(new Mesh(geo(new SphereGeometry(0.26 * s, 10, 8)), leaf2M), x + 0.12 * s, 0.7 * s, z + 0.1 * s);
    };
    plant(-6.5, 2.6, 1.2);
    plant(1.5, -3.0);
    plant(6.55, 2.6, 1.2);
    plant(-2.3, -3.0);
    plant(2.5, 2.6, 0.9);
    box(1.8, 0.42, 0.7, mat('#5b4a72'), 0.1, 0.21, 2.3);
    box(1.8, 0.5, 0.18, mat('#3a2a5c'), 0.1, 0.62, 2.62);
    box(0.7, 0.3, 0.5, woodM, 0.1, 0.15, 1.5);
    box(1.4, 0.95, 0.5, woodM, -1.2, 0.47, -3.1);
    box(0.36, 0.42, 0.3, trimM, -1.45, 1.16, -3.1);
    add(new Mesh(geo(new CylinderGeometry(0.07, 0.06, 0.14, 10)), mat('#ffffff')), -1.0, 1.02, -3.05);
    const pendant: Mesh[] = [];
    for (const [x, z] of [[-4.4, 0], [0.1, 0.2], [4.5, -0.2]] as const) {
      box(0.02, 0.9, 0.02, trimM, x, 3.15, z);
      pendant.push(add(new Mesh(geo(new ConeGeometry(0.32, 0.3, 14, 1, true)), mat('#271b3f', '#000000')), x, 2.6, z));
    }

    let grassM: MeshLambertMaterial | null = null;
    // ---------- outside: lawn, trees, a stone path (full screen) ----------
    if (cinematic) {
      const grass = box(60, 0.2, 60, mat('#8cc672'), 0, -0.75, 0);
      grassM = grass.material as MeshLambertMaterial;
      const trunkM = mat('#7a4a2a');
      const crownM = [mat('#4f9d4a'), mat('#6dbb5a'), mat('#f6a5c0')];
      const tree = (x: number, z: number, s: number, c: number) => {
        add(new Mesh(geo(new CylinderGeometry(0.12 * s, 0.16 * s, 1.0 * s, 8)), trunkM), x, -0.65 + 0.5 * s, z);
        add(new Mesh(geo(new SphereGeometry(0.8 * s, 12, 10)), crownM[c]!), x, -0.65 + 1.45 * s, z);
        add(new Mesh(geo(new SphereGeometry(0.55 * s, 12, 10)), crownM[c]!), x + 0.45 * s, -0.65 + 1.2 * s, z + 0.3 * s);
      };
      // Behind and left of the office only: nothing in front of the camera.
      const spots: [number, number, number, number][] = [
        [-9.5, -5.5, 1.3, 0], [-10.5, -1, 1.1, 1], [-10, 3.5, 1.4, 2], [-5, -6.5, 1.2, 1], [-1, -6.8, 1.5, 0], [3.5, -6.5, 1.2, 2],
        [8, -6, 1.3, 1], [-12, 7, 1.2, 0], [12, -9, 1.4, 2], [-8, -8.5, 1.1, 2],
      ];
      for (const [x, z, s2, c] of spots) tree(x, z, s2, c);
      const stoneM = mat('#d8cfc2');
      for (let i = 0; i < 7; i++) {
        const st = add(new Mesh(geo(new CylinderGeometry(0.35, 0.38, 0.06, 10)), stoneM), -7.8 - i * 0.75, -0.63, 0.2 + (i % 2) * 0.3);
        st.scale.set(1, 1, 0.7);
      }
    }

    // ---------- desks and agents ----------
    const legM = mat('#4b3b62');
    const chairM = mat('#3a2a5c');
    const shadowM = new MeshBasicMaterial({ color: '#1b1330', transparent: true, opacity: 0.14, depthWrite: false });
    disposables.push(shadowM);
    const nightLights = !!cinematic && !touch;
    const actors: Actor[] = desks.map((d, i) => {
      const { x, z } = d.desk;
      const deskTop = box(1.4, 0.08, 0.76, mat('#c9a27c', '#000000'), x, 0.78, z);
      box(1.3, 0.7, 0.05, legM, x, 0.38, z - 0.32);
      box(0.06, 0.74, 0.66, woodM, x - 0.64, 0.38, z);
      box(0.06, 0.74, 0.66, woodM, x + 0.64, 0.38, z);
      box(0.66, 0.44, 0.05, trimM, x - 0.05, 1.12, z - 0.22);
      const screen = box(0.6, 0.36, 0.01, mat('#1b1330', '#000000'), x - 0.05, 1.12, z - 0.19);
      box(0.08, 0.16, 0.08, trimM, x - 0.05, 0.9, z - 0.22);
      if (d.desk.room === 'bizdev') box(0.36, 0.26, 0.04, trimM, x + 0.45, 1.02, z - 0.12).rotation.set(0, -0.5, 0);
      box(0.52, 0.02, 0.18, mat('#efe9f6'), x - 0.05, 0.83, z + 0.08);
      add(new Mesh(geo(new CylinderGeometry(0.06, 0.05, 0.12, 10)), mat(d.desk.color)), x + 0.5, 0.88, z + 0.15);
      const book = box(0.34, 0.06, 0.26, mat('#f3355b'), x + 0.32, 0.86, z + 0.12);
      const lamp = add(new Mesh(geo(new SphereGeometry(0.1, 12, 10)), mat('#fff3b0', '#ffcf4d')), x - 0.52, 1.1, z - 0.15);
      box(0.04, 0.28, 0.04, trimM, x - 0.52, 0.96, z - 0.15);
      let light: PointLight | null = null;
      if (nightLights) {
        light = new PointLight('#ffb35c', 0, 4.5, 1.6);
        light.position.set(x - 0.4, 1.5, z + 0.2);
        scene.add(light);
      }
      box(0.56, 0.08, 0.56, chairM, x, 0.5, z + 0.75);
      box(0.56, 0.62, 0.08, chairM, x, 0.84, z + 1.03);
      box(0.06, 0.46, 0.06, legM, x, 0.25, z + 0.75);
      const sh = add(new Mesh(geo(new CircleGeometry(0.95, 24)), shadowM), x, 0.006, z + 0.3);
      sh.rotation.x = -Math.PI / 2;
      const root = new Group();
      const seat = new Vector3(x, 0, z + 0.72);
      root.position.copy(seat);
      const shirt = mat(d.desk.color);
      const pants = mat('#2b2340');
      const skin = mat(SKIN[i % SKIN.length]!);
      const body = add(new Mesh(geo(new CapsuleGeometry(0.23, 0.4, 4, 14)), shirt), 0, 0.92, 0, root);
      const head = add(new Mesh(geo(new SphereGeometry(0.22, 18, 14)), skin), 0, 1.42, 0, root);
      const hair = add(new Mesh(geo(new SphereGeometry(0.235, 18, 14, 0, Math.PI * 2, 0, Math.PI / 1.8)), mat(HAIR[i % HAIR.length]!)), 0, 0.02, 0.02, head);
      hair.rotation.x = 0.35;
      const limb = (r: number, len: number, m: Material, px: number, py: number) => {
        const g = new CapsuleGeometry(r, len, 3, 8);
        g.translate(0, -len / 2 - r / 2, 0);
        return add(new Mesh(geo(g), m), px, py, 0, root);
      };
      const armL = limb(0.07, 0.34, shirt, -0.29, 1.12);
      const armR = limb(0.07, 0.34, shirt, 0.29, 1.12);
      const legL = limb(0.085, 0.38, pants, -0.11, 0.62);
      const legR = limb(0.085, 0.38, pants, 0.11, 0.62);
      scene.add(root);
      return { key: d.desk.key, root, body, head, armL, armR, legL, legR, screen, deskTop, book, lamp, light, seat, label: new Vector3(), phase: i * 1.7, index: i };
    });

    // ---------- camera ----------
    let portrait = false;
    const fit = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      const aspect = w / h;
      // Portrait full screen (reels): the camera turns toward the long side, so the office runs down the screen.
      portrait = !!cinematic && aspect < 0.8;
      let halfW = cinematic ? (portrait ? 5.2 : 7.0) : 7.4;
      let halfH = halfW / aspect;
      const minH = cinematic ? (portrait ? 3 : 4.6) : 4.9;
      if (halfH < minH) {
        halfH = minH;
        halfW = halfH * aspect;
      }
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.updateProjectionMatrix();
      live.current.dirty = true;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    const reduce = !manual && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The director (cinematic): a wide shot, then close-ups that glide from agent to agent, every SHOT seconds.
    const SHOT = 3.2;
    const home = target.clone();
    const shotAim = (i: number, out: Vector3): number => {
      if (i < 0 || i % 3 === 0 || !actors.length) {
        out.copy(home);
        return 1.02;
      }
      const shown = actors.filter((x) => x.root.visible);
      const pick = (shown.length ? shown : actors)[(i * 2 + Math.floor(i / 3)) % (shown.length || actors.length)]!;
      out.set(pick.root.position.x, 1.1, pick.root.position.z);
      return portrait ? 1.7 : 1.6;
    };
    const aimA = new Vector3();
    const aimB = new Vector3();
    const look = new Vector3();
    const placeCamera = (t: number) => {
      const swing = reduce ? 0 : cinematic ? (portrait ? 0.14 : 0.32) * Math.sin(t * 0.21) : 0.03 * Math.sin(t * 0.15);
      const a = (portrait ? 1.15 : Math.PI / 4) + swing;
      let zoom = 1;
      look.copy(home);
      if (cinematic && !reduce) {
        const i = Math.floor(t / SHOT);
        const zA = shotAim(i - 1, aimA);
        const zB = shotAim(i, aimB);
        const f = Math.min(1, (t - i * SHOT) / 1.1);
        const e = f * f * (3 - 2 * f);
        look.copy(aimA).lerp(aimB, e);
        zoom = (zA + (zB - zA) * e) * (1 + 0.03 * Math.sin(t * 0.5));
      }
      camera.position.set(look.x + 17 * Math.sin(a), look.y + 13.5, look.z + 17 * Math.cos(a));
      camera.lookAt(look);
      if (camera.zoom !== zoom) {
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
      }
    };

    const proj = new Vector3();
    const place = (node: HTMLElement | null | undefined, at: Vector3) => {
      if (!node) return;
      proj.copy(at).project(camera);
      const x = ((proj.x + 1) / 2) * el.clientWidth;
      const y = ((1 - proj.y) / 2) * el.clientHeight;
      node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    };
    const boardAt = new Vector3(BOARD.x, 2.75, Z0 + 0.1);
    const dest = new Vector3();
    const pos = new Vector3();
    const ahead = new Vector3();
    const tmp = new Vector3();
    // A walk from the desk to a spot goes by the corridor (z = 0.05, through the doorways), never through a wall.
    const CORRIDOR = 0.05;
    const pathAt = (from: Vector3, to: Vector3, k: number, out: Vector3, _scratch: Vector3) => {
      const p0 = from;
      const p1x = from.x, p1z = CORRIDOR;
      const p2x = to.x, p2z = CORRIDOR;
      const l1 = Math.abs(p1z - p0.z);
      const l2 = Math.abs(p2x - p1x);
      const l3 = Math.abs(to.z - p2z);
      const L = l1 + l2 + l3 || 1;
      let d = k * L;
      if (d <= l1) return out.set(p0.x, 0, p0.z + Math.sign(p1z - p0.z) * d);
      d -= l1;
      if (d <= l2) return out.set(p1x + Math.sign(p2x - p1x) * d, 0, p1z);
      d -= l2;
      return out.set(p2x, 0, p2z + Math.sign(to.z - p2z) * Math.min(d, l3));
    };

    let lastNight: boolean | null = null;
    const applyState = (t: number) => {
      const { desks: list, night: isNight, boardCount: count } = live.current;
      if (isNight !== lastNight) {
        lastNight = isNight;
        hemi.intensity = isNight ? 0.35 : 1.5;
        hemi.color.set(isNight ? '#7d8cff' : '#fff6ea');
        sun.intensity = isNight ? 0.15 : 1.7;
        sun.color.set(isNight ? '#8fa2ff' : '#ffe2b8');
        amb.intensity = isNight ? 0.22 : 0.35;
        glassM.color.set(isNight ? '#18204a' : '#bfe3ff');
        glassM.emissive.set(isNight ? '#10173a' : '#7fb8e6');
        for (const f of floors) f.m.color.set(isNight ? f.r.floorNight : f.r.floor);
        grassM?.color.set(isNight ? '#2c4a33' : '#8cc672');
        lineM.color.set(isNight ? '#3c3029' : '#cdb79c');
        for (const p of pendant) (p.material as MeshLambertMaterial).emissive.set(isNight ? '#ffb35c' : '#000000');
        if (scene.fog) (scene.fog as Fog).color.set(isNight ? '#120d22' : '#f3e9de');
      }
      notes.forEach((n, i) => (n.visible = i < count));
      for (const a of actors) {
        const d = list.find((x) => x.desk.key === a.key);
        const act = d?.doing.activity ?? 'pulang';
        const away = act === 'pulang';
        a.root.visible = !away;
        const busy = act === 'kerja' || act === 'laporan';
        const sm = a.screen.material as MeshLambertMaterial;
        sm.emissive.set(busy ? (act === 'laporan' ? '#7bdff2' : '#66e3a5') : act === 'belajar' ? '#ffd166' : act === 'siaga' ? '#5b4a92' : '#000000');
        sm.emissiveIntensity = busy ? 0.8 + (reduce ? 0 : 0.2 * Math.sin(t * 9 + a.phase)) : 0.6;
        a.book.visible = act === 'belajar';
        const lampOn = act === 'belajar' || (isNight && !away);
        a.lamp.visible = lampOn;
        if (a.light) a.light.intensity = lampOn && isNight ? 2.2 : 0;
        const dm = a.deskTop.material as MeshLambertMaterial;
        if (d?.urgent.length) {
          dm.emissive.set('#f3355b');
          dm.emissiveIntensity = reduce ? 0.5 : 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 6));
        } else dm.emissiveIntensity = 0;

        // Seated, or (siaga, cinematic) off to the board, the coffee bar or the sofa and back (lib/office idleAt).
        let k = 0;
        let walking = false;
        let going = true;
        let spot: IdleSpot = 'meja';
        if (cinematic && act === 'siaga' && !reduce) {
          const idle = idleAt(a.key, t);
          k = idle.k;
          walking = idle.walking;
          spot = idle.spot;
          going = walking && idleAt(a.key, t + 0.05).k >= k;
        }
        const standing = k > 0;
        const slot = (a.index % 3) - 1;
        if (spot === 'papan') dest.set(BOARD.x + slot * 0.75, 0, Z0 + 1.15);
        else if (spot === 'kopi') dest.set(-1.0 + slot * 0.45, 0, Z0 + 1.0);
        else if (spot === 'sofa') dest.set(0.1 + slot * 0.55, 0, 2.2);
        else dest.copy(a.seat);
        pathAt(a.seat, dest, k, pos, ahead);
        a.root.position.copy(pos);
        const sitting = !standing || (spot === 'sofa' && k === 1);
        if (standing && walking) {
          pathAt(a.seat, dest, Math.min(1, Math.max(0, k + (going ? 0.02 : -0.02))), ahead, tmp);
          const dx = ahead.x - pos.x;
          const dz = ahead.z - pos.z;
          if (dx * dx + dz * dz > 1e-8) a.root.rotation.set(0, Math.atan2(-dx, -dz), 0);
        } else if (spot === 'sofa' && k === 1) a.root.rotation.set(0, Math.PI, 0);
        else a.root.rotation.set(0, 0, 0);
        a.root.position.y = spot === 'sofa' && k === 1 ? -0.05 : 0;
        a.label.set(pos.x, standing && !sitting ? 1.95 : (cinematic ? 1.75 : 2.1), pos.z);
        if (reduce) continue;
        const s = Math.sin(t * 9 + a.phase);
        if (!sitting) {
          const bob = walking ? 0.03 * Math.abs(s) : 0;
          a.body.position.y = 0.98 + bob;
          a.head.position.y = 1.48 + bob;
          a.armL.position.y = a.armR.position.y = 1.18 + bob;
          a.legL.position.y = a.legR.position.y = 0.7;
          a.legL.rotation.set(walking ? 0.6 * s : 0, 0, 0);
          a.legR.rotation.set(walking ? -0.6 * s : 0, 0, 0);
          a.armL.rotation.set(walking ? -0.5 * s : 0, 0, 0.08);
          a.armR.rotation.set(walking ? 0.5 * s : 0, 0, -0.08);
          a.head.rotation.set(walking ? 0 : -0.15, 0, 0);
        } else {
          a.legL.position.y = a.legR.position.y = 0.62;
          a.legL.rotation.set(-1.4, 0, 0);
          a.legR.rotation.set(-1.4, 0, 0);
          a.body.position.y = 0.92;
          a.head.position.y = 1.42;
          a.armL.position.y = a.armR.position.y = 1.12;
          if (busy) {
            a.armL.rotation.set(-1.15 + 0.12 * Math.sin(t * 16 + a.phase), 0, 0.1);
            a.armR.rotation.set(-1.15 + 0.12 * Math.sin(t * 16 + a.phase + 2), 0, -0.1);
            a.body.position.y = 0.92 + 0.012 * Math.abs(s);
            a.head.rotation.set(0.1 + 0.04 * Math.sin(t * 3 + a.phase), 0.08 * Math.sin(t * 1.3 + a.phase), 0);
          } else if (act === 'belajar') {
            a.armL.rotation.set(-0.9, 0, 0.2);
            a.armR.rotation.set(-0.9 + 0.2 * Math.max(0, Math.sin(t * 0.8 + a.phase)), 0, -0.2);
            a.head.rotation.set(0.38 + 0.04 * Math.sin(t * 1.2 + a.phase), 0.32, 0);
          } else {
            a.armL.rotation.set(-0.5, 0, 0.12);
            a.armR.rotation.set(-0.5, 0, -0.12);
            a.body.position.y = 0.92 + 0.01 * Math.sin(t * 1.6 + a.phase);
            a.head.rotation.set(0, 0.5 * Math.sin(t * 0.4 + a.phase), 0);
          }
        }
      }
    };

    const draw = (t: number) => {
      placeCamera(t);
      applyState(t);
      renderer.render(scene, camera);
      for (const a of actors) place(anchors.current?.get(a.key), a.label);
      place(boardAnchor.current, boardAt);
      live.current.dirty = false;
    };
    if (drive) drive.current = draw;

    let raf = 0;
    let running = true;
    let visible = true;
    let last = 0;
    const minGap = touch ? 1000 / 30 : 0;
    const start = performance.now();
    const frame = (now: number) => {
      raf = 0;
      if (!running || !visible || document.hidden) return;
      if (now - last >= minGap) {
        last = now;
        draw((now - start) / 1000);
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!manual && !raf && running) raf = requestAnimationFrame(frame);
    };
    const poll = reduce ? window.setInterval(() => live.current.dirty && kick(), 250) : 0;
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible) kick();
    });
    io.observe(el);
    const onVis = () => !document.hidden && kick();
    document.addEventListener('visibilitychange', onVis);
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      onFail?.();
    });
    if (manual) draw(0);
    kick();
    onReady?.();

    return () => {
      running = false;
      if (drive) drive.current = null;
      if (raf) cancelAnimationFrame(raf);
      window.clearInterval(poll);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
    // The scene is built once per set of desks; their state is read live from `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desks.map((d) => d.desk.key).join(','), cinematic, manual]);

  return <div ref={host} className="ko-canvas" />;
}
