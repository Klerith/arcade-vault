'use client';

import React, { useEffect, useRef } from 'react';

interface PacManGameProps {
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
}

// ── Maze ──────────────────────────────────────────────────────────────────────
// Celdas: 0 pasillo con pellet, 1 pared, 2 pasillo vacío, 3 casa de fantasmas,
// 4 túnel lateral.

export const CELL = 40;
export const COLS = 19;
export const ROWS = 21;
const W = COLS * CELL;
const H = ROWS * CELL;

export interface Cell {
  col: number;
  row: number;
}

// Leyenda: # pared · . pellet · ' ' vacío · H casa de fantasmas · T túnel
const MAZE_ART = [
  '###################',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.### # ###.####',
  '####.#       #.####',
  '####.# ##H## #.####',
  'T   .  #HHH#  .   T',
  '####.# ##### #.####',
  '####.#       #.####',
  '####.# ##### #.####',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#..#..... .....#..#',
  '##.#.#.#####.#.#.##',
  '#....#...#...#....#',
  '#.######.#.######.#',
  '#.................#',
  '###################',
];

const GLYPH_TO_CELL: Record<string, number> = {
  '.': 0,
  '#': 1,
  ' ': 2,
  H: 3,
  T: 4,
};

export const MAZE_LAYOUT: number[][] = MAZE_ART.map((line) =>
  Array.from(line, (ch) => GLYPH_TO_CELL[ch]),
);

export const PACMAN_START: Cell = { col: 9, row: 15 };
export const GHOST_HOUSE_DOOR: Cell = { col: 9, row: 8 };

const DIRS: Cell[] = [
  { col: 0, row: -1 },
  { col: 1, row: 0 },
  { col: 0, row: 1 },
  { col: -1, row: 0 },
];

/** Túnel: una celda `4` en un extremo de la fila reaparece en el extremo opuesto. */
export function wrapTunnel(position: Cell, layout: number[][]): Cell {
  if (layout[position.row]?.[position.col] !== 4) return position;
  const last = layout[position.row].length - 1;
  if (position.col === 0) return { col: last, row: position.row };
  if (position.col === last) return { col: 0, row: position.row };
  return position;
}

/** Vecino en la dirección dada; cruza el túnel si la celda actual es `4` en el borde. */
function step(from: Cell, dir: Cell, layout: number[][]): Cell | null {
  const width = layout[0].length;
  let col = from.col + dir.col;
  const row = from.row + dir.row;
  if (row < 0 || row >= layout.length) return null;
  if (col < 0 || col >= width) {
    if (layout[from.row][from.col] !== 4) return null;
    col = (col + width) % width;
  }
  return { col, row };
}

/**
 * BFS sobre el grid. Devuelve las celdas a recorrer (sin incluir `from`, incluyendo `to`),
 * `[]` si from === to y `null` si no hay ruta. La casa de fantasmas (`3`) solo se
 * atraviesa con `allowHouse` (fantasmas).
 */
export function findShortestPath(
  from: Cell,
  to: Cell,
  layout: number[][],
  allowHouse = true,
): Cell[] | null {
  const key = (c: Cell) => c.row * layout[0].length + c.col;
  if (key(from) === key(to)) return [];
  const prev = new Map<number, Cell>();
  const seen = new Set<number>([key(from)]);
  const queue: Cell[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    for (const dir of DIRS) {
      const next = step(cur, dir, layout);
      if (!next) continue;
      const cell = layout[next.row][next.col];
      if (cell === 1 || (cell === 3 && !allowHouse)) continue;
      const k = key(next);
      if (seen.has(k)) continue;
      seen.add(k);
      prev.set(k, cur);
      if (k === key(to)) {
        const path: Cell[] = [next];
        let back = prev.get(k);
        while (back && key(back) !== key(from)) {
          path.unshift(back);
          back = prev.get(key(back));
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAC_SPEED = 6; // celdas / segundo
const GHOST_SPEED = 5.2;
const GHOST_LEVEL_BOOST = 0.08;
const GHOST_MAX_BOOSTS = 2;
const READY_SECONDS = 1.5;
const CHASE_RADIUS = 6; // distancia Manhattan para que pinky/clyde persigan
const HIT_DISTANCE = 0.6; // celdas
const PELLET_POINTS = 10;
const START_LIVES = 3;
const HUD_HEIGHT = 38;

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'ready' | 'play' | 'over';

interface Mover {
  from: Cell;
  to: Cell;
  t: number; // progreso 0..1 de from → to
  dir: Cell;
}

interface Ghost extends Mover {
  id: 'blinky' | 'pinky' | 'inky' | 'clyde';
  color: string;
  start: Cell;
  scatter: Cell | null; // null = chase directo permanente
  releaseAt: number; // segundos desde el inicio de la ronda
}

interface GameState {
  pellets: boolean[][];
  pelletsLeft: number;
  pac: Mover;
  buffered: Cell;
  ghosts: Ghost[];
  score: number;
  level: number;
  lives: number;
  phase: Phase;
  readyTimer: number;
  roundClock: number;
}

const GHOST_DEFS: Omit<Ghost, keyof Mover>[] = [
  {
    id: 'blinky',
    color: '#ff0000',
    start: { col: 9, row: 8 },
    scatter: null,
    releaseAt: 0,
  },
  {
    id: 'pinky',
    color: '#ffb8ff',
    start: { col: 9, row: 9 },
    scatter: { col: 1, row: 1 },
    releaseAt: 0.5,
  },
  {
    id: 'inky',
    color: '#00ffff',
    start: { col: 8, row: 9 },
    scatter: null,
    releaseAt: 1,
  },
  {
    id: 'clyde',
    color: '#ffb852',
    start: { col: 10, row: 9 },
    scatter: { col: 17, row: 19 },
    releaseAt: 1.5,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const UP = DIRS[0];
const LEFT = DIRS[3];

const sameCell = (a: Cell, b: Cell) => a.col === b.col && a.row === b.row;

function canWalk(c: Cell, allowHouse: boolean): boolean {
  if (c.row < 0 || c.row >= ROWS || c.col < 0 || c.col >= COLS) return false;
  const v = MAZE_LAYOUT[c.row][c.col];
  return v !== 1 && (allowHouse || v !== 3);
}

function makeMover(at: Cell, dir: Cell): Mover {
  return { from: at, to: at, t: 0, dir };
}

/** Posición interpolada del mover en coordenadas de celda. */
function pos(m: Mover): { x: number; y: number } {
  return {
    x: m.from.col + (m.to.col - m.from.col) * m.t,
    y: m.from.row + (m.to.row - m.from.row) * m.t,
  };
}

function createPellets(): { pellets: boolean[][]; count: number } {
  let count = 0;
  const pellets = MAZE_LAYOUT.map((row) =>
    row.map((v) => {
      if (v === 0) count++;
      return v === 0;
    }),
  );
  return { pellets, count };
}

function resetPositions(s: GameState) {
  s.pac = makeMover(PACMAN_START, LEFT);
  s.buffered = LEFT;
  s.ghosts = GHOST_DEFS.map((def) => ({
    ...def,
    ...makeMover(def.start, UP),
  }));
  s.phase = 'ready';
  s.readyTimer = READY_SECONDS;
  s.roundClock = 0;
}

function createState(): GameState {
  const { pellets, count } = createPellets();
  const s: GameState = {
    pellets,
    pelletsLeft: count,
    pac: makeMover(PACMAN_START, LEFT),
    buffered: LEFT,
    ghosts: [],
    score: 0,
    level: 1,
    lives: START_LIVES,
    phase: 'ready',
    readyTimer: READY_SECONDS,
    roundClock: 0,
  };
  resetPositions(s);
  return s;
}

function ghostSpeed(level: number): number {
  const boosts = Math.min(level - 1, GHOST_MAX_BOOSTS);
  return GHOST_SPEED * (1 + GHOST_LEVEL_BOOST * boosts);
}

/**
 * Avanza `dist` celdas. Al llegar a un nodo teletransporta si es túnel, llama a
 * `arrive` y luego a `choose` para fijar el siguiente destino (from === to = detenido).
 */
function advance(
  m: Mover,
  dist: number,
  choose: () => void,
  arrive: () => void,
) {
  for (let guard = 0; dist > 0 && guard < 8; guard++) {
    if (sameCell(m.from, m.to)) {
      choose();
      if (sameCell(m.from, m.to)) {
        m.t = 0;
        return;
      }
    }
    const remaining = 1 - m.t;
    if (dist < remaining) {
      m.t += dist;
      return;
    }
    dist -= remaining;
    m.from = wrapTunnel(m.to, MAZE_LAYOUT);
    m.to = m.from;
    m.t = 0;
    arrive();
  }
}

function choosePacman(s: GameState) {
  const m = s.pac;
  for (const d of [s.buffered, m.dir]) {
    const n = { col: m.from.col + d.col, row: m.from.row + d.row };
    if (canWalk(n, false)) {
      m.to = n;
      m.dir = d;
      return;
    }
  }
  m.to = m.from;
}

function chooseGhost(g: Ghost, s: GameState) {
  const cur = g.from;
  const inHouse = MAZE_LAYOUT[cur.row][cur.col] === 3;
  const reverse = { col: cur.col - g.dir.col, row: cur.row - g.dir.row };
  const options = DIRS.map((d) => ({
    cell: { col: cur.col + d.col, row: cur.row + d.row },
    dir: d,
  })).filter((o) => canWalk(o.cell, inHouse) && !sameCell(o.cell, reverse));
  if (options.length === 0) {
    // callejón sin salida: única opción es dar la vuelta
    g.to = reverse;
    g.dir = { col: -g.dir.col, row: -g.dir.row };
    return;
  }

  const pacCell = s.pac.t < 0.5 ? s.pac.from : s.pac.to;
  let target = pacCell;
  if (g.scatter) {
    const manhattan =
      Math.abs(cur.col - pacCell.col) + Math.abs(cur.row - pacCell.row);
    if (manhattan >= CHASE_RADIUS) target = g.scatter;
  }

  let best = options[0];
  if (sameCell(cur, target)) {
    // patrulla: ya en su esquina, sigue por un pasillo cualquiera
    best = options[Math.floor(Math.random() * options.length)];
  } else {
    let bestLen = Infinity;
    for (const o of options) {
      const path = findShortestPath(o.cell, target, MAZE_LAYOUT);
      const len = path ? path.length : Infinity;
      if (len < bestLen) {
        bestLen = len;
        best = o;
      }
    }
  }
  g.to = best.cell;
  g.dir = best.dir;
}

// ── Static maze sprite ────────────────────────────────────────────────────────

function buildMazeCanvas(): HTMLCanvasElement {
  const oc = document.createElement('canvas');
  oc.width = W;
  oc.height = H;
  const octx = oc.getContext('2d')!;
  octx.fillStyle = '#000000';
  octx.fillRect(0, 0, W, H);

  const isWall = (c: number, r: number) =>
    c >= 0 && c < COLS && r >= 0 && r < ROWS && MAZE_LAYOUT[r][c] === 1;

  octx.fillStyle = '#05052e';
  octx.strokeStyle = '#2f2fff';
  octx.lineWidth = 3;
  octx.lineCap = 'round';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isWall(c, r)) continue;
      const x = c * CELL;
      const y = r * CELL;
      octx.fillRect(x, y, CELL, CELL);
      const edges: [boolean, number, number, number, number][] = [
        [!isWall(c, r - 1), x, y, x + CELL, y],
        [!isWall(c, r + 1), x, y + CELL, x + CELL, y + CELL],
        [!isWall(c - 1, r), x, y, x, y + CELL],
        [!isWall(c + 1, r), x + CELL, y, x + CELL, y + CELL],
      ];
      for (const [open, x1, y1, x2, y2] of edges) {
        if (!open) continue;
        octx.beginPath();
        octx.moveTo(x1, y1);
        octx.lineTo(x2, y2);
        octx.stroke();
      }
    }
  }

  // Puerta de la casa de fantasmas
  octx.fillStyle = '#ffb8de';
  octx.fillRect(
    GHOST_HOUSE_DOOR.col * CELL,
    GHOST_HOUSE_DOOR.row * CELL + CELL / 2 - 2,
    CELL,
    4,
  );
  return oc;
}

// ── Component ─────────────────────────────────────────────────────────────────

function PacManGame({
  paused,
  onScoreChange,
  onLivesChange,
  onLevelChange,
  onGameOver,
}: PacManGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  const cbRef = useRef({
    onScoreChange,
    onLivesChange,
    onLevelChange,
    onGameOver,
  });

  // Sync refs so the loop reads the latest values without re-mounting.
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    cbRef.current = {
      onScoreChange,
      onLivesChange,
      onLevelChange,
      onGameOver,
    };
  }, [onScoreChange, onLivesChange, onLevelChange, onGameOver]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const mazeCanvas = buildMazeCanvas();
    const s = createState();

    // Último valor notificado a React (solo se dispara al cambiar).
    const notified = { score: 0, level: 1, lives: START_LIVES };

    function notify() {
      const cb = cbRef.current;
      if (s.score !== notified.score) {
        notified.score = s.score;
        cb.onScoreChange(s.score);
      }
      if (s.level !== notified.level) {
        notified.level = s.level;
        cb.onLevelChange(s.level);
      }
      if (s.lives !== notified.lives) {
        notified.lives = s.lives;
        cb.onLivesChange(s.lives);
      }
    }

    // ── Update ──────────────────────────────────────────────────────────────
    function eatPellet() {
      const { col, row } = s.pac.from;
      if (!s.pellets[row][col]) return;
      s.pellets[row][col] = false;
      s.pelletsLeft -= 1;
      s.score += PELLET_POINTS;
      if (s.pelletsLeft === 0) {
        const fresh = createPellets();
        s.pellets = fresh.pellets;
        s.pelletsLeft = fresh.count;
        s.level += 1;
        resetPositions(s);
      }
      notify();
    }

    function loseLife() {
      s.lives -= 1;
      if (s.lives <= 0) {
        s.lives = 0;
        s.phase = 'over';
        notify(); // onLivesChange(0) antes que onGameOver
        cbRef.current.onGameOver(s.score);
        return;
      }
      resetPositions(s);
      notify();
    }

    function update(dt: number) {
      if (s.phase === 'over') return;
      if (s.phase === 'ready') {
        s.readyTimer -= dt;
        if (s.readyTimer <= 0) s.phase = 'play';
        return;
      }
      s.roundClock += dt;

      // Reversa inmediata a mitad de tramo
      const pac = s.pac;
      if (
        !sameCell(pac.from, pac.to) &&
        s.buffered.col === -pac.dir.col &&
        s.buffered.row === -pac.dir.row
      ) {
        [pac.from, pac.to] = [pac.to, pac.from];
        pac.t = 1 - pac.t;
        pac.dir = s.buffered;
      }

      const level = s.level;
      advance(
        pac,
        PAC_SPEED * dt,
        () => choosePacman(s),
        () => eatPellet(),
      );
      if (s.level !== level) return; // nivel completado: posiciones reiniciadas

      const gSpeed = ghostSpeed(s.level);
      for (const g of s.ghosts) {
        if (s.roundClock < g.releaseAt) continue;
        advance(
          g,
          gSpeed * dt,
          () => chooseGhost(g, s),
          () => {},
        );
      }

      const p = pos(s.pac);
      for (const g of s.ghosts) {
        const q = pos(g);
        if (Math.hypot(p.x - q.x, p.y - q.y) < HIT_DISTANCE) {
          loseLife();
          return;
        }
      }
    }

    // ── Draw ────────────────────────────────────────────────────────────────
    function drawGhost(g: Ghost, time: number) {
      const p = pos(g);
      const cx = (p.x + 0.5) * CELL;
      const cy = (p.y + 0.5) * CELL;
      const r = 16;
      const wave = Math.sin(time * 12) * 2;

      ctx.fillStyle = g.color;
      ctx.beginPath();
      ctx.arc(cx, cy - 2, r, Math.PI, 0);
      ctx.lineTo(cx + r, cy + r);
      const feet = 3;
      const fw = (r * 2) / feet;
      for (let i = 0; i < feet; i++) {
        const x0 = cx + r - i * fw;
        ctx.quadraticCurveTo(
          x0 - fw / 2,
          cy + r - 8 + (i % 2 === 0 ? wave : -wave),
          x0 - fw,
          cy + r,
        );
      }
      ctx.closePath();
      ctx.fill();

      // Eyes
      for (const side of [-1, 1]) {
        const ex = cx + side * 6;
        const ey = cy - 4;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex, ey, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a1aff';
        ctx.beginPath();
        ctx.arc(ex + g.dir.col * 2, ey + g.dir.row * 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawPacman(time: number) {
      const m = s.pac;
      const p = pos(m);
      const cx = (p.x + 0.5) * CELL;
      const cy = (p.y + 0.5) * CELL;
      const moving = !sameCell(m.from, m.to);
      const mouth = moving
        ? (Math.abs(Math.sin(time * 12)) * Math.PI) / 4
        : 0.2;
      const face = Math.atan2(m.dir.row, m.dir.col);
      ctx.fillStyle = '#ffe600';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, 16, face + mouth, face + Math.PI * 2 - mouth);
      ctx.closePath();
      ctx.fill();
    }

    function draw(time: number) {
      ctx.drawImage(mazeCanvas, 0, 0);

      // Pellets
      ctx.fillStyle = '#ffe14d';
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!s.pellets[r][c]) continue;
          ctx.beginPath();
          ctx.arc((c + 0.5) * CELL, (r + 0.5) * CELL, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (s.phase !== 'over' || s.lives > 0) drawPacman(time);
      for (const g of s.ghosts) drawGhost(g, time);

      if (s.phase === 'ready') {
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffe600';
        ctx.fillText('READY!', W / 2, 11 * CELL + CELL / 2);
      }

      // HUD overlay
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, HUD_HEIGHT);
      ctx.font = 'bold 14px monospace';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffe600';
      ctx.textAlign = 'left';
      ctx.fillText(`SCORE  ${String(s.score).padStart(6, '0')}`, 12, 19);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'right';
      ctx.fillText(`LEVEL  ${String(s.level).padStart(2, '0')}`, W - 12, 19);
      ctx.textAlign = 'left';
    }

    // ── Loop ────────────────────────────────────────────────────────────────
    let raf = 0;
    let last = performance.now();

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!pausedRef.current) update(dt);
      draw(now / 1000);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // ── Keyboard ────────────────────────────────────────────────────────────
    function handleKey(e: KeyboardEvent) {
      const map: Record<string, Cell> = {
        arrowup: DIRS[0],
        w: DIRS[0],
        arrowright: DIRS[1],
        d: DIRS[1],
        arrowdown: DIRS[2],
        s: DIRS[2],
        arrowleft: DIRS[3],
        a: DIRS[3],
      };
      const next = map[e.key.toLowerCase()];
      if (!next) return;
      e.preventDefault();
      s.buffered = next;
    }

    document.addEventListener('keydown', handleKey);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
      }}
    >
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ display: 'block', maxWidth: '100%', maxHeight: '100%' }}
      />
    </div>
  );
}

export default React.memo(PacManGame);
