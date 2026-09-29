# SPEC — Integración del juego Pac-Man (laberinto + 4 fantasmas)

> **Estado:** Implemented
> **Depende de:** 06-games-table-leaderboard-supabase
> **Fecha:** 2026-09-28
> **Objetivo:** Integrar Pac-Man como juego jugable en Arcade Vault, con un laberinto
> fijo, pellets coleccionables y 4 fantasmas que persiguen al jugador, conectando el
> leaderboard de Supabase.

---

## Scope

**In:**

- INSERT SQL para añadir la fila `pac-man` a la tabla `games` en Supabase.
- Crear `components/games/PacManGame.tsx` — componente React `"use client"` que encapsula
  el canvas (760 × 840 px) y el game loop completo. Acepta props: `paused`,
  `onScoreChange`, `onLivesChange`, `onLevelChange`, `onGameOver`.
- Laberinto fijo definido como constante `MAZE_LAYOUT` (matriz de 19 columnas × 21 filas,
  celdas de 40px): valores `0` pasillo con pellet, `1` pared, `2` pasillo vacío,
  `3` casa de fantasmas (zona central), `4` túnel lateral (wrap horizontal).
- Pac-Man se mueve por el grid con WASD/flechas; el movimiento está confinado a la
  celda actual hasta alcanzar el centro de la siguiente (movimiento discreto por nodos,
  no libre por pixel), con "input buffering": la última tecla presionada se aplica en
  cuanto la intersección lo permite.
- 4 fantasmas con IDs `blinky`, `pinky`, `inky`, `clyde`, cada uno con un color propio
  (rojo, rosa, cian, naranja) y un patrón de movimiento simple:
  - `blinky` e `inky`: persiguen la celda actual de Pac-Man (chase directo, recalculando
    la ruta más corta por BFS sobre el grid cada vez que llegan a una intersección).
  - `pinky` y `clyde`: patrullan (scatter) hacia sus esquinas asignadas del laberinto y
    solo cambian a chase cuando Pac-Man está a menos de 6 celdas de distancia Manhattan.
  - Todos parten de la casa central (`3`) y salen con un pequeño delay escalonado
    (0.5s entre cada uno) al iniciar la partida o tras perder una vida.
- Pellets: un punto por celda tipo `0` del laberinto; comerlos suma 10 puntos y los
  elimina del tablero. Cuando no quedan pellets, el nivel se completa: `onLevelChange`
  incrementa, el tablero se regenera (pellets restaurados) y la velocidad de los
  fantasmas aumenta un 8% (tope 2 incrementos acumulados).
- Colisión Pac-Man/fantasma (sin power pellet activo — ver spec 02) resta 1 vida,
  reposiciona a Pac-Man y a los 4 fantasmas en sus posiciones iniciales, y continúa la
  partida si quedan vidas.
- Túnel lateral: si Pac-Man o un fantasma entra en una celda `4` de un extremo, reaparece
  en la celda `4` del extremo opuesto de la misma fila.
- El HUD interno del canvas (score top-left, level top-right) se dibuja dentro del
  canvas — patrón doble HUD igual que Snake, Tetris, Arkanoid y Asteroids.
- El componente notifica a React de cada cambio de estado vía callbacks (comparando con
  el valor anterior antes de disparar).
- El prop `paused: boolean` congela el loop (no ejecuta `update()` de Pac-Man ni
  fantasmas) pero sigue llamando a `draw()`.
- Limpiar los event listeners de teclado (`keydown` en `document`) y el
  `requestAnimationFrame`/`setInterval` en el `return` del `useEffect`.
- Crear `app/games/pac-man/play/page.tsx` — play-page específica para este juego.
  Gestiona el estado (`score`, `level`, `lives`, `paused`, `over`, `name`, `saved`,
  `gameKey`) y pasa callbacks al componente canvas.
- Guardar score al terminar: modal React pre-rellena nombre desde `localStorage`
  (`av_player_name`), inserta en Supabase `{ game_id: 'pac-man', player_name: name, score,
  user_id: null }` y persiste el nombre para la próxima partida.

**Fuera de alcance:**

- Power pellets, modo "frightened" de fantasmas y comer fantasmas — spec secundario
  `02-pac-man-power-pellets.md`.
- Frutas bonus, animaciones de sprite (boca abriéndose), sonido — futuros specs.
- Controles táctiles o mobile.
- Supabase Auth y RLS — `user_id` se almacena como `null`.
- Realtime en el leaderboard.
- Paginación del leaderboard — se muestran los top 10 fijos.
- IA de fantasmas fiel al algoritmo original de patrones de Blinky/Pinky/Inky/Clyde de
  1980 (dispersión por esquinas exactas, modo scatter/chase temporizado) — se usa una
  versión simplificada descrita arriba.
- Laberintos generados proceduralmente o múltiples layouts — un único `MAZE_LAYOUT` fijo.

---

## Data model

### Seed en Supabase — tabla `games`

Ejecutar en el SQL Editor de Supabase:

```sql
INSERT INTO games (id, title, short, long, cat, cover, color)
VALUES (
  'pac-man',
  'PAC-MAN',
  'Come todos los puntos del laberinto huyendo de 4 fantasmas.',
  'Guía a Pac-Man por un laberinto fijo devorando pellets mientras esquivas a Blinky, Pinky, Inky y Clyde. Despeja el tablero completo para subir de nivel; pierdes una vida cada vez que un fantasma te atrapa.',
  'MAZE',
  'cover-pac-man',
  'yellow'
);
```

### Props del componente `PacManGame`

```ts
interface PacManGameProps {
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
}
```

El estado local arranca con `lives = 3`, `score = 0`, `level = 1`.
`onLivesChange(0)` se dispara siempre antes que `onGameOver(score)` al perder la última vida.

No se introducen nuevas tablas ni tipos TypeScript — se reutilizan `GameRow` y `ScoreRow`
de `lib/supabase/types.ts`.

---

## Implementation plan

1. **INSERT en Supabase** — ejecutar el SQL del data model en el SQL Editor de Supabase.
   Verificación: la fila `pac-man` aparece en el Table Editor; `/games` muestra la card de
   Pac-Man con cover `cover-pac-man` y color `yellow`.

2. **Definir el laberinto y utilidades de grid** dentro de `components/games/PacManGame.tsx`:
   - Constante `MAZE_LAYOUT: number[][]` (19×21) con paredes, pellets, casa de fantasmas
     y túneles laterales simétricos.
   - Función `findShortestPath(from, to, layout)` (BFS) usada por `blinky`/`inky` y por
     `pinky`/`clyde` cuando entran en chase.
   - Función `wrapTunnel(position)` para el efecto de túnel lateral.
     Verificación: unit-test manual imprimiendo el layout en consola confirma conectividad
     (no hay celdas de pellet inalcanzables).

3. **Crear `components/games/PacManGame.tsx`** — componente `"use client"` que:
   - Renderiza un `<canvas>` de 760 × 840 px.
   - Dibuja el laberinto (paredes en azul, pellets como puntos amarillos pequeños),
     Pac-Man (círculo amarillo con boca animada por frame) y los 4 fantasmas con sus
     colores propios.
   - Game loop con `requestAnimationFrame` y acumulador de tiempo: mueve Pac-Man por el
     grid según la última tecla válida en el buffer de input, mueve cada fantasma según
     su patrón (chase directo o scatter/chase condicional), verifica colisiones
     Pac-Man↔fantasma y Pac-Man↔pellet.
   - Actualiza `score` (+10 por pellet), `level` (al vaciar el tablero) y `lives`
     (al colisionar con un fantasma), llamando a los callbacks correspondientes solo
     cuando el valor cambia respecto al anterior.
   - Al perder una vida con `lives > 0`: reposiciona a todos los personajes a sus
     posiciones iniciales y reanuda tras una breve pausa (sin perder pellets ya comidos).
   - Al llegar a `lives === 0`: llama `onLivesChange(0)` y luego `onGameOver(score)`.
   - Prop `paused: boolean` — si es `true`, el loop omite el `update()` de Pac-Man y
     fantasmas pero sigue ejecutando `draw()`.
   - Limpia el event listener de `keydown` y el `requestAnimationFrame` en el `return`
     del `useEffect`.
     Verificación: el juego arranca en `/games/pac-man/play` y es jugable con
     flechas/WASD; los 4 fantasmas se mueven con comportamientos distintos observables.

4. **Crear `app/games/pac-man/play/page.tsx`** — play-page específica:
   - Importa `PacManGame` con `dynamic(..., { ssr: false })`.
   - Estado local: `score`, `level`, `lives` (inicial `3`), `paused`, `over`, `name`,
     `saved`, `gameKey`.
   - Pasa `paused` y los cuatro callbacks a `PacManGame`.
   - Reutiliza el layout visual de la plataforma (HUD React + CRT + modal game over),
     igual que las play-pages de Snake, Tetris y Arkanoid.
   - Modal game over: pre-rellena nombre desde `localStorage.getItem('av_player_name')`;
     al confirmar, guarda en `localStorage` e inserta en Supabase
     `{ game_id: 'pac-man', player_name: name, score, user_id: null }`.
   - Botón de guardar se deshabilita tras el primer envío.
     Verificación: el HUD React refleja score, vidas y nivel en tiempo real; tras una
     partida el score aparece en `/games/pac-man` y en `/hall-of-fame` al recargar.

5. **Verificación final** — `npm run build` termina sin errores de TypeScript.
   Ninguna ruta existente devuelve 500.

---

## Acceptance criteria

- [x] La fila `pac-man` existe en la tabla `games` de Supabase con los valores del data model.
- [x] La card de Pac-Man aparece en `/games` con cover `cover-pac-man` y color `yellow`.
- [x] La ruta `/games/pac-man/play` carga sin errores de SSR ni de TypeScript.
- [x] El canvas (760 × 840) renderiza el laberinto completo, pellets, Pac-Man y 4 fantasmas.
- [x] Pac-Man se mueve por el grid con WASD/flechas; el input se aplica en la siguiente
      intersección válida (buffering).
- [x] Los fantasmas `blinky` e `inky` persiguen directamente a Pac-Man vía ruta más corta.
- [x] Los fantasmas `pinky` y `clyde` patrullan hacia sus esquinas y solo persiguen cuando
      Pac-Man está a menos de 6 celdas de distancia.
- [x] Comer un pellet suma 10 puntos y lo elimina visualmente del tablero.
- [x] Vaciar todos los pellets sube el nivel, regenera el tablero y aumenta la velocidad
      de los fantasmas (hasta 2 incrementos acumulados).
- [x] El túnel lateral transporta a Pac-Man/fantasmas al extremo opuesto de la fila.
- [x] Colisionar con un fantasma resta 1 vida y reposiciona a todos los personajes.
- [x] Al llegar a 0 vidas, `onLivesChange(0)` se dispara antes que `onGameOver(score)`.
- [x] El HUD interno del canvas (score top-left, level top-right) se dibuja correctamente.
- [x] El HUD React de la plataforma refleja en tiempo real score, vidas y nivel.
- [x] El botón "PAUSA" de la plataforma congela el game loop; "REANUDAR" lo reanuda.
- [x] Aparece el modal React de game over con la puntuación final.
- [x] El botón "JUGAR DE NUEVO" reinicia la partida desde cero (3 vidas, tablero completo).
- [x] Al abrir el modal, el campo de nombre se pre-rellena con `av_player_name` si existe.
- [x] Al confirmar, el score se inserta en Supabase y el nombre se persiste en localStorage.
- [x] El botón de guardar se deshabilita tras el primer envío (sin doble inserción).
- [x] El score guardado aparece en `/games/pac-man` y en `/hall-of-fame` al recargar.
- [x] `/hall-of-fame` muestra un tab para Pac-Man.
- [x] `npm run build` completa sin errores de TypeScript.
- [x] Ninguna ruta existente devuelve 500.

---

## Decisions

- **Sí: 3 vidas** — Pac-Man clásico (arcade original de 1980) otorga 3 vidas por defecto.
  Razón: fidelidad al juego de referencia; es el valor que los jugadores esperan y
  balancea bien la dificultad del laberinto con 4 fantasmas activos desde el inicio.

- **Sí: Movimiento discreto por nodos de grid** — Pac-Man y fantasmas se mueven celda a
  celda, con input buffering en las intersecciones. Razón: reproduce la sensación de
  control del juego original y simplifica enormemente la detección de colisiones y de
  paredes frente a un movimiento libre por pixel.

- **Sí: IA de fantasmas simplificada (chase directo vs. scatter/chase condicional)** —
  en vez de replicar el algoritmo exacto de 1980 (con modos scatter/chase temporizados
  globalmente y objetivos por fantasma únicos). Razón: aporta variedad de comportamiento
  observable (2 agresivos + 2 tácticos) sin la complejidad de temporizadores globales;
  es suficiente para que el juego se sienta desafiante y distinto de Snake/Frogger.

- **Sí: Laberinto único fijo (`MAZE_LAYOUT`)** — un solo diseño de 19×21 celdas.
  Razón: acota el alcance del MVP; múltiples laberintos o generación procedural pueden
  añadirse en un spec futuro sin romper la arquitectura del componente.

- **Sí: Doble HUD** — el canvas conserva su HUD interno y React muestra los mismos
  valores en el HUD de la plataforma. Razón: coherencia con el patrón establecido en
  Asteroids, Tetris, Arkanoid y Snake.

- **Sí: Play-page específica `app/games/pac-man/play/page.tsx`** — en lugar de modificar
  la ruta genérica `[id]/play`. Razón: coherencia con el resto de juegos; Next.js App
  Router da prioridad a rutas estáticas sobre dinámicas.

- **Sí: `dynamic(..., { ssr: false })`** — el componente canvas se carga solo en cliente.
  Razón: `canvas`, `requestAnimationFrame` y `document.addEventListener` no existen en el
  entorno Node.js de Next.js SSR.

- **No: Power pellets ni modo frightened en este spec** — se difieren al spec secundario
  `02-pac-man-power-pellets.md`. Razón: mantener el core acotado a laberinto + pellets +
  persecución; power pellets cambian sustancialmente las reglas de colisión y merecen
  su propio alcance.

- **No: Componente genérico `CanvasGame`** — cada juego mantiene su propio componente.
  Razón: YAGNI, consistente con las decisiones de specs previos (07, 08, 09).

- **No: RLS en este spec** — las tablas quedan abiertas (INSERT y SELECT públicos).
  Razón: se mitiga en specs de seguridad ya existentes (14, 15) y auditorías posteriores.

- **No: Realtime en leaderboards** — los scores se ven al recargar.
  Razón: la complejidad de subscriptions no aporta valor mientras haya pocos jugadores activos.
