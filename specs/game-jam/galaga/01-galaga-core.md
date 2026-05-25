# SPEC — Galaga: integración core del juego

> **Estado:** Propuesto
> **Depende de:** 06-games-table-leaderboard-supabase
> **Fecha:** 2026-05-25
> **Objetivo:** Integrar Galaga (canvas puro, construido desde cero) como shooter vertical jugable en Arcade Vault con ID `galaga`, conectando score, vidas, nivel y game over con el HUD React y la play-page dedicada.

---

## Scope

**In:**

- INSERT SQL para añadir la fila `galaga` a la tabla `games` en Supabase.
- Crear `components/games/GalagaGame.tsx` — componente React `"use client"` que encapsula el canvas principal (480 × 640 px). Acepta props: `paused`, `onScoreChange`, `onLivesChange`, `onLevelChange`, `onGameOver`.
- Game loop construido desde cero con `requestAnimationFrame` dentro del componente. No se carga ninguna imagen — todos los sprites (nave del jugador, enemigos, proyectiles, explosiones) se dibujan con primitivas canvas (polígonos, arcos, líneas).
- Nave del jugador: posicionada en la parte inferior del canvas, se mueve horizontalmente con las teclas ← / → (o A / D). Dispara hacia arriba con Espacio; un solo proyectil activo en pantalla hasta que impacte o salga del canvas.
- Formación inicial de enemigos: 40 enemigos dispuestos en 4 filas × 10 columnas en la mitad superior del canvas. Tres tipos de enemigos por aspecto visual:
  - **Abeja** (filas 0–1): 20 unidades, 10 pts al destruirlas en formación.
  - **Mariposa** (filas 2–3, columnas externas): 12 unidades, 20 pts en formación.
  - **Galaga Boss** (filas 2–3, columnas internas): 8 unidades, 40 pts en formación; doble hitbox (dos impactos para destruir).
- Movimiento de la formación: la formación completa se desplaza horizontalmente de lado a lado, rebotando al llegar a los márgenes. Con cada nivel la velocidad lateral aumenta un 10 %.
- Fase de buceo (diving): cada 3–5 s (aleatoriamente) entre 1 y 3 enemigos de la formación salen en picado hacia el jugador siguiendo una curva sinusoidal, disparan 1–2 proyectiles durante el buceo y regresan a su posición en la formación.
- Proyectiles enemigos: descienden verticalmente a velocidad fija; pueden estar activos hasta 4 simultáneamente en pantalla.
- Colisiones:
  - Proyectil del jugador vs. enemigo: destruye al enemigo (o quita un HP al Boss), suma puntos, genera efecto de explosión (8 partículas radiales dibujadas con líneas).
  - Proyectil enemigo o enemigo en buceo vs. nave del jugador: destruye la nave, resta 1 vida, llama `onLivesChange(lives - 1)`. Si `lives - 1 === 0`, llama `onLivesChange(0)` y luego `onGameOver(finalScore)`.
- Sistema de vidas: la nave arranca con 3 vidas. Vidas representadas como iconos de nave en el HUD interno.
- Condición de nivel completado: todos los enemigos de la formación están destruidos. Se inicia el siguiente nivel con una formación nueva idéntica (misma disposición, velocidades incrementadas). El nivel no se completa mientras haya enemigos en buceo activos.
- Bonus stage cada 3 niveles: durante 30 s aparecen 40 enemigos en paso desfilado (sin formación, sin disparar); destruirlos todos da bonus de 10 000 pts. No hay colisión mortal en bonus stage.
- Puntuación extra: destruir un enemigo en buceo vale el doble de su puntuación en formación.
- HUD interno del canvas: score (top-left, fuente blanca 14 px), nivel (top-center), vidas como iconos de nave (top-right, un triángulo pequeño por vida). Patrón doble HUD igual que los demás juegos de la plataforma.
- Prop `paused: boolean` congela `update()` pero sigue llamando a `draw()`.
- Limpiar los event listeners (`keydown` y `keyup` en `document`) en el `return` del `useEffect`.
- Crear `app/games/galaga/play/page.tsx` — play-page específica.
- Guardar score al terminar: modal React pre-rellena nombre desde `localStorage` (`av_player_name`), inserta en Supabase y persiste el nombre para la próxima partida.

**Fuera de alcance:**

- Sprites bitmap externos — todos los elementos se dibujan con primitivas canvas.
- La mecánica de captura de nave (el Boss atrapa la nave del jugador con un rayo tractor y se puede rescatar): se cubre en spec secundario.
- Power-ups o potenciadores (doble disparo, escudo): se cubren en spec secundario.
- Controles táctiles o mobile.
- Supabase Auth y RLS — `user_id` se almacena como `null`.
- Realtime en el leaderboard.
- Componente genérico `CanvasGame` (YAGNI).

---

## Data model

### INSERT en tabla `games`

```sql
INSERT INTO games (id, title, short, long, cat, cover, color)
VALUES (
  'galaga',
  'GALAGA',
  'Destruye la formación alienígena antes de que te hundan.',
  'Pilota tu caza espacial en la parte inferior de la pantalla y derriba oleadas de insectos alienígenas que atacan en formación y se lanzan en picado disparando. Cada nivel acelera la formación y aumenta la frecuencia de buceo. Tres vidas para llegar lo más lejos posible.',
  'SHOOTER',
  'cover-galaga',
  'yellow'
);
```

### Props del componente `GalagaGame`

```ts
interface GalagaGameProps {
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
}
```

El estado local arranca con `lives = 3`, `score = 0`, `level = 1`.
`onLivesChange(n)` se dispara cada vez que la nave es destruida.
`onLivesChange(0)` se dispara justo antes de `onGameOver(score)`.

No se introducen nuevas tablas ni tipos TypeScript — se reutilizan `GameRow` y `ScoreRow` de `lib/supabase/types.ts`.

---

## Implementation plan

1. **INSERT en Supabase** — ejecutar el SQL del data model en el SQL Editor de Supabase.
   Verificación: la fila `galaga` aparece en el Table Editor; `/games` muestra la card con cover `cover-galaga` y color `yellow`.

2. **Definir constantes y tipos** dentro de `GalagaGame.tsx`:

   ```ts
   const CANVAS_W = 480;
   const CANVAS_H = 640;
   const PLAYER_W = 32;
   const PLAYER_H = 28;
   const PLAYER_SPEED = 280; // px/s
   const BULLET_SPEED = 420; // px/s (jugador)
   const ENEMY_BULLET_SPEED = 220; // px/s
   const ENEMY_COLS = 10;
   const ENEMY_ROWS = 4;
   const ENEMY_W = 36;
   const ENEMY_H = 28;
   const ENEMY_PAD_X = 10;
   const ENEMY_PAD_Y = 12;
   const FORMATION_TOP = 80; // px desde arriba
   const MAX_ENEMY_BULLETS = 4;
   const DIVE_INTERVAL_MIN = 3000; // ms
   const DIVE_INTERVAL_MAX = 5000; // ms
   ```

   Tipos locales (no exportados):

   ```ts
   type EnemyType = 'bee' | 'butterfly' | 'boss';

   interface Enemy {
     id: number;
     type: EnemyType;
     formCol: number; // columna en la formación (0–9)
     formRow: number; // fila en la formación (0–3)
     x: number; // posición actual en canvas
     y: number;
     hp: number; // 1 para bee/butterfly, 2 para boss
     diving: boolean;
     diveT: number; // tiempo acumulado de la trayectoria de buceo (ms)
     divePath: DivePath | null;
     alive: boolean;
   }

   interface DivePath {
     startX: number;
     startY: number;
     amplitude: number;
     speed: number; // px/s
     angle: number; // ángulo inicial de descenso en radianes
   }

   interface Bullet {
     x: number;
     y: number;
     active: boolean;
   }

   interface Particle {
     x: number;
     y: number;
     vx: number;
     vy: number;
     life: number; // 0–1, decrece con el tiempo
   }
   ```

3. **Dibujo de sprites con primitivas canvas**:
   - `drawPlayer(ctx, x, y)`: triángulo apuntando hacia arriba (base 32 px, altura 28 px) en color blanco; dos alas laterales rectangulares (6 × 8 px) en gris claro; tobera en la base (rectángulo 8 × 6 px) en naranja.
   - `drawBee(ctx, x, y, color)`: hexágono de 14 px de radio en amarillo/naranja; ojos como dos puntos blancos; antenas (dos líneas de 8 px).
   - `drawButterfly(ctx, x, y)`: cuerpo central ovalado (10 × 16 px) en rojo; cuatro alas elípticas (14 × 10 px cada una) en azul claro con borde blanco.
   - `drawBoss(ctx, x, y, hp)`: cuerpo rectangular redondeado (36 × 28 px) en púrpura; dos "cuernos" triangulares en la parte superior; si `hp === 1`, parpadea en rojo.
   - `drawBullet(ctx, x, y, isEnemy)`: rectángulo de 3 × 12 px; amarillo para el jugador, rojo para enemigos.
   - `drawParticle(ctx, p)`: línea de 6 px de longitud desde la posición actual, con opacidad proporcional a `p.life`.
   - `drawExplosion(ctx, particles)`: itera y dibuja cada partícula activa del array de explosiones.

4. **Inicialización de la formación** — función `buildFormation(): Enemy[]`:
   - Genera 40 enemigos con `formCol` ∈ [0, 9] y `formRow` ∈ [0, 3].
   - Tipo asignado por fila: `formRow` 0–1 → `'bee'`; `formRow` 2–3 y columnas 0, 1, 8, 9 → `'butterfly'`; `formRow` 2–3 y columnas 2–7 → `'boss'`.
   - `hp`: 1 para bee y butterfly; 2 para boss.
   - Posición inicial calculada como: `x = CANVAS_W / 2 - (ENEMY_COLS / 2) * (ENEMY_W + ENEMY_PAD_X) + formCol * (ENEMY_W + ENEMY_PAD_X)`, `y = FORMATION_TOP + formRow * (ENEMY_H + ENEMY_PAD_Y)`.
   - Todos comienzan con `diving = false`, `alive = true`.
     Verificación: al inicio de nivel aparecen 40 enemigos distribuidos en 4 filas de 10 columnas.

5. **Movimiento de la formación** — dentro de `update(dt)`:
   - Calcular `formationSpeed = baseSpeed * (1 + (level - 1) * 0.10)` (px/s); `baseSpeed = 60`.
   - Mover `formationOffsetX += formationDir * formationSpeed * dt / 1000`.
   - Si el enemigo más a la derecha supera `CANVAS_W - ENEMY_W / 2 - 10` o el más a la izquierda baja de `ENEMY_W / 2 + 10`, invertir `formationDir`.
   - Cada enemigo que no esté en buceo actualiza su `x` e `y` desde `formationOffsetX` y su posición en la formación.
     Verificación: la formación oscila de lado a lado sin que ningún enemigo salga del canvas.

6. **Lógica de buceo** — dentro de `update(dt)`:
   - Acumular `nextDiveTimer -= dt`. Cuando llega a 0, seleccionar aleatoriamente 1–3 enemigos vivos no en buceo; inicializar su `divePath` (ángulo de inicio apuntando hacia el jugador + variación aleatoria de ±20°, amplitud sinusoidal entre 40 y 80 px, velocidad base 160 px/s escalada por nivel 5 % por nivel); marcar `diving = true`. Reiniciar `nextDiveTimer` con un valor aleatorio entre `DIVE_INTERVAL_MIN` y `DIVE_INTERVAL_MAX`.
   - Para cada enemigo en buceo: avanzar `diveT += dt`; calcular posición:
     - `progress = divePathSpeed * diveT / 1000` (px recorridos a lo largo del eje principal).
     - `x = divePath.startX + progress * sin(divePath.angle) + divePath.amplitude * sin(progress / 40)`.
     - `y = divePath.startY + progress * cos(divePath.angle)`.
   - Si `y > CANVAS_H + ENEMY_H`, el enemigo completa el buceo: resetear a su posición en la formación (`diving = false`, `diveT = 0`).
     Verificación: los enemigos en buceo trazan una curva sinusoidal hacia abajo y regresan a la formación.

7. **Disparo del jugador**:
   - Un único proyectil activo (`playerBullet`). `active = false` inicialmente.
   - Al pulsar Espacio (detectado en `keydown`): si `playerBullet.active === false`, crear proyectil en la posición central superior de la nave.
   - Cada frame: si `playerBullet.active`, `playerBullet.y -= BULLET_SPEED * dt / 1000`; si `y < 0`, `active = false`.
     Verificación: el jugador dispara con Espacio; no puede haber dos proyectiles propios simultáneos.

8. **Disparo de enemigos en buceo**:
   - Cada enemigo en buceo tiene un `shootTimer` independiente; cuando llega a 0, genera un proyectil enemigo si hay menos de `MAX_ENEMY_BULLETS` activos en pantalla.
   - Los proyectiles enemigos se almacenan en `enemyBullets: Bullet[]`; cada frame avanzan `y += ENEMY_BULLET_SPEED * dt / 1000`; si `y > CANVAS_H`, se marcan `active = false`.
     Verificación: los enemigos en buceo disparan y los proyectiles caen hacia el jugador.

9. **Detección de colisiones** (AABB simplificado):
   - `playerBullet` vs. cada `enemy` vivo: si los rectángulos solapan, `enemy.hp -= 1`; si `hp <= 0`, `enemy.alive = false`, suma puntos (× 2 si `enemy.diving`), genera 8 partículas de explosión.
   - Cada `enemyBullet` vs. nave del jugador: si solapan, desactivar proyectil, llamar `killPlayer()`.
   - Cada `enemy` en buceo vs. nave del jugador (cuerpo a cuerpo): si solapan, llamar `killPlayer()`, `enemy.alive = false`.
     Verificación: el proyectil propio destruye enemigos; los proyectiles enemigos destruyen la nave.

10. **Gestión de muerte del jugador** — `killPlayer()`:
    - Decrementar `lives`.
    - Llamar `onLivesChange(lives)`.
    - Si `lives === 0`: llamar `onLivesChange(0)`, luego `onGameOver(score)`, detener el loop.
    - Si `lives > 0`: breve pausa de 1.5 s (flag `respawning`), la nave reaparece centrada en la base; durante `respawning` el jugador no puede moverse ni disparar y la nave parpadea.
      Verificación: al morir con vidas restantes, la nave reaparece; al llegar a 0 vidas aparece el modal de game over.

11. **Condición de nivel completado** — dentro de `update(dt)`:
    - Si todos los `enemy.alive === false` y no hay enemigos en `diving`, llamar `nextLevel()`.
    - `nextLevel()`: incrementar `level`, llamar `onLevelChange(level)`, reconstruir formación con `buildFormation()`, resetear `formationOffsetX = 0`, resetear `formationDir = 1`, `nextDiveTimer` al valor inicial.
    - Si `level % 3 === 0` (niveles 3, 6, 9…), activar `bonusStage`.
      Verificación: al destruir todos los enemigos, aparece la siguiente oleada con mayor velocidad.

12. **Bonus stage**:
    - Flag `bonusStage = true`; duración máxima 30 s.
    - Generar 40 enemigos que desfilan en filas horizontales de arriba a abajo sin formación fija y sin disparar.
    - No hay colisión mortal (los enemigos que llegan abajo simplemente desaparecen).
    - Al destruir los 40 o al agotar el tiempo, mostrar mensaje "BONUS STAGE COMPLETE" / "BONUS STAGE" dibujado en canvas; si se destruyeron los 40 sumar 10 000 pts.
    - Finalizado el bonus stage, continuar con el siguiente nivel normal.
      Verificación: cada 3 niveles aparece el bonus stage; los enemigos no matan al jugador durante él.

13. **Crear `app/games/galaga/play/page.tsx`** — play-page específica:
    - Importar `GalagaGame` con `dynamic(..., { ssr: false })`.
    - Estado local: `score`, `lives` (inicial `3`), `level`, `paused`, `over`, `name`, `saved`, `gameKey`.
    - Pasar `paused` y los cuatro callbacks a `GalagaGame`.
    - Reutilizar el layout visual de la plataforma (HUD React + CRT + modal game over), igual que las play-pages de Asteroids, Tetris, Arkanoid, Snake y Frogger.
    - Modal game over: pre-rellenar nombre desde `localStorage.getItem('av_player_name')`; al confirmar, guardar en `localStorage` e insertar en Supabase `{ game_id: 'galaga', player_name: name, score, user_id: null }`.
    - Botón de guardar se deshabilita tras el primer envío.
    - Botón "JUGAR DE NUEVO" incrementa `gameKey` para remontar `GalagaGame`.
      Verificación: el HUD React refleja score, vidas y nivel en tiempo real.

14. **Verificación final** — `npm run build` termina sin errores de TypeScript. Ninguna ruta existente devuelve 500.

---

## Acceptance criteria

- [ ] La fila `galaga` existe en la tabla `games` de Supabase con los valores del data model.
- [ ] La card de Galaga aparece en `/games` con cover `cover-galaga` y color `yellow`.
- [ ] La ruta `/games/galaga/play` carga sin errores de SSR ni de TypeScript.
- [ ] El canvas (480 × 640) se renderiza correctamente con el fondo negro del espacio.
- [ ] La formación inicial muestra 40 enemigos en 4 filas de 10 columnas correctamente posicionados.
- [ ] Los tres tipos de enemigo (bee, butterfly, boss) son visualmente distinguibles.
- [ ] La formación se desplaza horizontalmente de lado a lado sin salir del canvas.
- [ ] La nave del jugador se mueve con ← / → (o A / D) sin salir de los márgenes.
- [ ] El jugador dispara con Espacio; no puede haber dos proyectiles propios simultáneos.
- [ ] El proyectil del jugador destruye enemigos tipo bee y butterfly de un impacto.
- [ ] El proyectil del jugador requiere dos impactos para destruir un Boss; el Boss parpadea en rojo tras el primero.
- [ ] Cada 3–5 s, 1–3 enemigos inician un buceo con trayectoria sinusoidal hacia abajo.
- [ ] Los enemigos en buceo disparan proyectiles que descienden hacia el jugador.
- [ ] No hay más de 4 proyectiles enemigos activos simultáneamente.
- [ ] Destruir un enemigo en buceo otorga el doble de puntos que en formación.
- [ ] Los enemigos en buceo regresan a su posición en la formación al llegar al borde inferior.
- [ ] La colisión de un proyectil enemigo con la nave destruye la nave y resta 1 vida.
- [ ] La colisión cuerpo a cuerpo de un enemigo en buceo con la nave destruye la nave y resta 1 vida.
- [ ] Tras morir con vidas restantes, la nave reaparece centrada con parpadeo durante 1.5 s.
- [ ] `onLivesChange(n)` se dispara en cada muerte; `onLivesChange(0)` se dispara antes de `onGameOver`.
- [ ] Al destruir toda la formación, comienza el siguiente nivel con mayor velocidad de formación.
- [ ] `onLevelChange(level)` se dispara al iniciar cada nuevo nivel.
- [ ] `onScoreChange(score)` se dispara en cada cambio de puntuación.
- [ ] Cada 3 niveles se activa el bonus stage (40 enemigos en desfile, sin daño al jugador, 30 s).
- [ ] Destruir los 40 enemigos del bonus stage suma 10 000 pts.
- [ ] El HUD interno del canvas (score, nivel, vidas-iconos) se dibuja correctamente.
- [ ] El HUD React de la plataforma refleja en tiempo real score, vidas y nivel.
- [ ] El botón "PAUSA" de la plataforma congela el game loop; "REANUDAR" lo reanuda.
- [ ] Las teclas P / Esc no provocan una pausa independiente del canvas.
- [ ] Al llegar a `lives = 0`, aparece el modal React con la puntuación final.
- [ ] El modal pre-rellena el nombre desde `av_player_name` si existe en localStorage.
- [ ] Al confirmar el nombre, el score se inserta en Supabase y el nombre se persiste en localStorage.
- [ ] El botón de guardar se deshabilita tras el primer envío (sin doble inserción).
- [ ] El botón "JUGAR DE NUEVO" reinicia la partida desde cero (nuevo `gameKey`).
- [ ] El score guardado aparece en `/games/galaga` y en `/hall-of-fame` al recargar.
- [ ] `npm run build` completa sin errores de TypeScript.
- [ ] Ninguna ruta existente devuelve 500.

---

## Decisions

- **Sí: Primitivas canvas sin sprites bitmap** — nave, enemigos, proyectiles y explosiones se dibujan con polígonos, arcos y líneas canvas. Razón: no existen assets de Galaga en el repositorio; dibujar por código elimina dependencias de carga de imágenes y mantiene el juego completamente autocontenido.

- **Sí: Doble HUD** — el canvas conserva su HUD interno y React muestra los mismos valores en el HUD de la plataforma. Razón: coherencia con el patrón establecido en todos los juegos de la plataforma.

- **Sí: 3 vidas** — Galaga original arranca con 3 vidas. `onLivesChange` notifica cada pérdida; `onLivesChange(0)` dispara el game over. Razón: fiel a la mecánica clásica; coherente con Arkanoid y Frogger.

- **Sí: Un solo proyectil del jugador activo** — el jugador no puede disparar mientras hay un proyectil en vuelo. Razón: mecánica canónica de Galaga; obliga a apuntar con precisión y añade tensión sin complejidad adicional de gestión de múltiples balas.

- **Sí: Buceo sinusoidal** — los enemigos en picado siguen una trayectoria curva con componente sinusoidal lateral. Razón: replica el movimiento característico de Galaga que hace los ataques impredecibles y el juego más dinámico que un shooter de movimiento recto.

- **Sí: Boss con 2 HP** — el Boss Galaga requiere dos impactos para ser destruido y parpadea en rojo tras el primero. Razón: mecánica original que diferencia el Boss de las otras unidades y recompensa al jugador con más puntos por el esfuerzo extra.

- **Sí: Bonus stage cada 3 niveles** — oleada de 40 enemigos sin disparo ni daño, con recompensa de 10 000 pts por destruirlos todos. Razón: mecánica original de Galaga que da respiro al jugador y recompensa la puntería; rompe el ritmo del loop principal sin complicar el modelo de estados.

- **Sí: Puntuación doble en buceo** — destruir un enemigo mientras está en picado vale el doble de su valor en formación. Razón: incentiva al jugador a apuntar a los enemigos en buceo (más difíciles de acertar) en lugar de esperar a que regresen a la formación.

- **Sí: Canvas 480 × 640 px** — relación de aspecto vertical 3:4 cercana a las proporciones del arcade original. Razón: Galaga es un shooter vertical; un canvas más ancho que alto no representaría bien el espacio de juego.

- **Sí: Play-page específica `app/games/galaga/play/page.tsx`** — en lugar de la ruta genérica `[id]/play`. Razón: coherencia con todos los juegos anteriores; Next.js App Router da prioridad a rutas estáticas sobre dinámicas.

- **Sí: `dynamic(..., { ssr: false })`** — el componente canvas se carga solo en cliente. Razón: `canvas` y `requestAnimationFrame` no existen en el entorno Node.js de Next.js SSR.

- **No: Mecánica de captura de nave** — el rayo tractor del Boss que captura la nave del jugador se cubre en spec secundario. Razón: requiere un estado de juego complejo (nave capturada, modo rescate, doble nave) que amplía significativamente el scope del core.

- **No: Power-ups** — doble disparo, escudo, etc., se cubren en spec secundario. Razón: el core establece la mecánica base; los modificadores de jugabilidad son una capa independiente.

- **No: Componente genérico `CanvasGame`** — cada juego tiene su componente propio. Razón: YAGNI.

- **No: RLS en este spec** — las tablas quedan abiertas (INSERT y SELECT públicos). Razón: se mitiga en el spec futuro de seguridad.

- **No: Realtime en leaderboards** — los scores se ven al recargar. Razón: la complejidad de subscriptions no aporta valor mientras haya pocos jugadores activos.

- **No: Controles táctiles o mobile** — fuera del scope de este spec. Razón: se aplica el agente `mobile-porter` después de la implementación core.
