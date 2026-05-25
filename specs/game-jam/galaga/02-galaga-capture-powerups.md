# SPEC — Galaga: mecánica de captura de nave y power-ups

> **Estado:** Propuesto
> **Depende de:** 06-games-table-leaderboard-supabase, 01-galaga-core
> **Fecha:** 2026-05-25
> **Objetivo:** Extender GalagaGame con la mecánica de captura de nave mediante rayo tractor del Boss, el modo de doble nave al rescatarla, y tres power-ups coleccionables (doble disparo, escudo y velocidad) que enriquecen la progresión sin alterar el contrato de props ni el flujo de la plataforma.

---

## Scope

**In:**

- Extender `components/games/GalagaGame.tsx` con la lógica de captura, rescate y doble nave.
- Mecánica de rayo tractor: un Boss Galaga (con `hp === 2`, es decir, sin daño previo) puede activar el rayo tractor cada 20–30 s (temporizador independiente por Boss, aleatorio). El rayo desciende desde el Boss como un haz animado de 12 px de ancho que se extiende hacia abajo a 180 px/s. Si el haz toca la nave del jugador, la nave queda capturada: sube lentamente hasta posicionarse junto al Boss en la formación. El Boss captor pasa a tener un sprite diferenciado ("Boss con escolta capturada").
- Estado de nave capturada: la nave del jugador sigue jugable con la nave principal mientras la capturada está en la formación. Si la nave principal muere durante este periodo, la capturada se pierde definitivamente (no se recupera) y la partida continúa normalmente con 1 vida menos. El hud interno muestra el icono de nave capturada en color atenuado.
- Rescate de la nave capturada: si el jugador destruye al Boss que tiene la escolta, la nave capturada comienza a descender lentamente hacia la posición del jugador durante 2 s; al completar el descenso, el jugador pasa a controlar una **doble nave** (dos naves yuxtapuestas, separadas 36 px horizontalmente). Ambas naves se mueven y disparan al unísono. La doble nave tiene hitbox doble (una colisión destruye una de las dos naves y la partida vuelve a nave simple).
- Si el Boss captor es destruido por la nave capturada convertida en escolta enemiga (raro pero posible al disparar inadvertidamente la posición del Boss), la nave capturada también se destruye sin bonus.
- Power-ups: aparecen como cápsulas coleccionables cuando un enemigo específico es destruido. La aparición es poco frecuente (probabilidad 12 % por enemigo destruido en los niveles ≥ 2). Las cápsulas caen verticalmente a 80 px/s; si no son recogidas antes de salir del canvas, desaparecen. Solo puede haber 1 cápsula activa en pantalla simultáneamente.
  - **Doble disparo** (cápsula azul, icono de dos líneas verticales paralelas): durante 15 s el jugador puede tener 2 proyectiles activos simultáneamente en lugar de 1. Dibujada como rectángulo redondeado azul 20 × 14 px con dos líneas blancas verticales.
  - **Escudo** (cápsula verde, icono de arco): durante 10 s un arco semitransparente de radio 22 px rodea la nave. El primer impacto de proyectil enemigo o colisión cuerpo a cuerpo consume el escudo (desaparece) sin restar vida. Dibujado como rectángulo redondeado verde 20 × 14 px con un arco blanco.
  - **Velocidad** (cápsula naranja, icono de flecha doble): durante 8 s la velocidad de la nave aumenta de 280 a 420 px/s. Dibujada como rectángulo redondeado naranja 20 × 14 px con flecha doble blanca horizontal.
- HUD interno ampliado: indicadores de power-up activo dibujados en canvas en la esquina inferior derecha. Cada indicador muestra el icono del power-up y una barra de progreso de ancho decreciente (60 px → 0) proporcional al tiempo restante de efecto.
- Temporizador de power-up gestionado dentro del game loop (acumular `dt`); al expirar, se restaura el estado base (1 proyectil, sin escudo, velocidad estándar).
- Los power-ups y el rayo tractor se desactivan durante el bonus stage (el Boss no activa el rayo; no caen cápsulas).
- Limpieza: todos los temporizadores de power-up y de rayo tractor se cancelan al desmontar el componente (en el `return` del `useEffect` que ya existe en el spec core).

**Fuera de alcance:**

- Modificar el contrato de props `GalagaGameProps` — los callbacks `onScoreChange`, `onLivesChange`, `onLevelChange`, `onGameOver` no cambian.
- Persistencia de power-ups entre partidas o niveles — los efectos son exclusivamente intra-partida e intra-nivel.
- Stack de power-ups (dos cápsulas activas simultáneamente del mismo tipo) — el nuevo power-up recogido reemplaza y reinicia el temporizador del tipo activo si coincide.
- Animaciones elaboradas de muerte (partículas avanzadas) — el spec core ya gestiona las 8 partículas radiales de explosión.
- Controles táctiles o mobile.
- Supabase Auth y RLS.
- Realtime en el leaderboard.

---

## Data model

No se añaden nuevas tablas ni columnas. Este spec opera íntegramente dentro del componente `GalagaGame.tsx` y los datos de partida (score, vidas, nivel) ya fluyen por los callbacks existentes definidos en el spec core.

### Nuevos tipos locales en `GalagaGame.tsx`

```ts
type PowerUpType = 'double-shot' | 'shield' | 'speed';

interface PowerUp {
  type: PowerUpType;
  x: number;
  y: number;
  active: boolean;
}

interface ActiveEffect {
  type: PowerUpType;
  remaining: number; // ms restantes
  duration: number; // ms totales del efecto (para calcular el ratio de la barra)
}

interface TractorBeam {
  bossId: number;
  active: boolean;
  y: number; // extremo inferior actual del haz
  capturing: boolean;
  captureComplete: boolean;
}

type PlayerMode = 'single' | 'captured-escort' | 'double';
```

### Variables de estado adicionales (locales al componente)

```ts
let playerMode: PlayerMode = 'single';
let capturedByBossId: number | null = null; // id del Boss que capturó la nave
let tractorBeam: TractorBeam | null = null;
let activeEffect: ActiveEffect | null = null;
let fallingPowerUp: PowerUp | null = null;
```

---

## Implementation plan

1. **Añadir tipos y variables de estado adicionales** al inicio del bloque de estado del `useEffect` en `GalagaGame.tsx`, inmediatamente después de las declaraciones del spec core.
   Verificación: el archivo compila sin errores de TypeScript tras el añadido.

2. **Implementar el rayo tractor**:

   a. Al inicializar cada Boss en `buildFormation()`, asignarle un `tractorTimer` aleatorio entre 20 000 y 30 000 ms.

   b. Dentro de `update(dt)`, para cada Boss vivo con `hp === 2` (intacto), no en buceo, y sin rayo activo:
   - Decrementar `boss.tractorTimer -= dt`.
   - Si `tractorTimer <= 0` y `tractorBeam === null` y `playerMode === 'single'`: crear `tractorBeam = { bossId: boss.id, active: true, y: boss.y + ENEMY_H / 2, capturing: false, captureComplete: false }`. Reiniciar `tractorTimer` con un nuevo valor aleatorio.

   c. Dentro de `update(dt)`, si `tractorBeam !== null && tractorBeam.active && !tractorBeam.capturing`:
   - `tractorBeam.y += 180 * dt / 1000`.
   - Si el haz (rectángulo de 12 px de ancho centrado en `boss.x`) solapa con el rectángulo de la nave del jugador: `tractorBeam.capturing = true`; iniciar animación de subida de la nave capturada hacia el Boss.

   d. Durante `tractorBeam.capturing`:
   - La nave del jugador sube 120 px/s hacia la posición del Boss.
   - Al llegar (`Math.abs(player.y - boss.y) < 4`): `tractorBeam.captureComplete = true`; `tractorBeam.active = false`; `playerMode = 'captured-escort'`; `capturedByBossId = boss.id`; la nave del jugador reaparece en su posición base (centro inferior del canvas) sin consumir una vida.

   e. Si el haz llega a `y > CANVAS_H` sin capturar: `tractorBeam = null`.

   f. `drawTractorBeam(ctx, beam, bossX)`: haz vertical de 12 px de ancho con color `rgba(0, 255, 0, 0.6)`, animado con segmentos alternos (patrón de líneas discontinuas de 8 px actualizados cada frame con un offset acumulado).
   Verificación: el haz desciende desde el Boss y captura la nave al contacto; la nave reaparece en la base sin pérdida de vida.

3. **Estado `captured-escort`** — dentro de `update(dt)`:
   - La nave capturada se representa como un enemigo con sprite de nave (triángulo blanco atenuado, opacidad 0.6) posicionado junto al Boss captor (`boss.x + 40`, `boss.y`).
   - Si el Boss captor (`capturedByBossId`) es destruido: la nave capturada inicia descenso a 140 px/s hacia `y = CANVAS_H - 60` (posición base del jugador) durante máximo 2 s.
   - Al completar el descenso: `playerMode = 'double'`; renderizar la doble nave.
   - Si la nave principal del jugador muere durante `captured-escort`: `playerMode = 'single'`; `capturedByBossId = null`; la nave capturada desaparece; se descuenta 1 vida (ya gestionado por `killPlayer()` del spec core).
     Verificación: destruir el Boss captor inicia el descenso de la nave capturada; al completar el descenso el jugador controla la doble nave.

4. **Modo doble nave** — dentro de `update(dt)` y `draw()`:
   - La doble nave se representa como dos naves separadas 36 px horizontalmente, centradas en `player.x`.
   - Movimiento: ambas se mueven al unísono con ← / → igual que la nave simple, respetando los márgenes del canvas (la nave más exterior no puede salir de pantalla).
   - Disparo: en modo simple genera 1 proyectil; en modo doble genera 2 proyectiles simultáneos (uno desde cada nave), cada uno independiente; el límite pasa a ser 2 proyectiles activos.
   - Colisión en modo doble: el primer impacto destruye la nave más cercana al proyectil enemigo; `playerMode` vuelve a `'single'`; se descuenta 1 vida; se llama `onLivesChange(lives)`.
   - Hitbox: en modo doble, cada nave tiene su propio rectángulo de colisión.
     Verificación: en modo doble el jugador dispara dos proyectiles simultáneos; el primer impacto vuelve al modo simple y descuenta 1 vida.

5. **Implementar el sistema de power-ups**:

   a. Al destruir un enemigo en `update(dt)` (colisión resuelta):
   - Si `level >= 2` y `fallingPowerUp === null` y `Math.random() < 0.12`:
     - Seleccionar tipo aleatoriamente: 33 % cada uno.
     - Crear `fallingPowerUp = { type, x: enemy.x, y: enemy.y, active: true }`.

   b. Dentro de `update(dt)`, si `fallingPowerUp !== null && fallingPowerUp.active`:
   - `fallingPowerUp.y += 80 * dt / 1000`.
   - Si `fallingPowerUp.y > CANVAS_H`: `fallingPowerUp = null`.
   - Si solapa con la nave del jugador (o cualquiera de las dos en modo doble): recoger power-up, llamar `applyPowerUp(fallingPowerUp.type)`.

   c. `applyPowerUp(type: PowerUpType)`:
   - Si ya existe un `activeEffect` del mismo `type`: reiniciar su `remaining` a la duración máxima.
   - Si el `activeEffect` es de tipo diferente: aplicar el nuevo tipo (el anterior expira inmediatamente).
   - Duraciones: `'double-shot'` → 15 000 ms, `'shield'` → 10 000 ms, `'speed'` → 8 000 ms.
   - Actualizar las variables de control (ej. `maxActiveBullets`, `playerSpeed`, `shieldActive`).

   d. Dentro de `update(dt)`, si `activeEffect !== null`:
   - `activeEffect.remaining -= dt`.
   - Si `remaining <= 0`: llamar `expirePowerUp()` — restaurar el estado base correspondiente; `activeEffect = null`.

   e. Efecto **escudo** en colisiones: antes de llamar `killPlayer()`, comprobar si `shieldActive === true`; si lo está, consumir el escudo (`shieldActive = false`, `activeEffect = null`) y no restar vida.
   Verificación: recoger una cápsula activa su efecto; la barra decrece en tiempo real; el escudo absorbe un impacto.

6. **Dibujar las cápsulas de power-up** — `drawPowerUp(ctx, pu)`:
   - Rectángulo redondeado (radio de esquina 4 px) de 20 × 14 px con el color del tipo.
   - Icono interior (2 líneas, arco o flecha) en blanco de 1.5 px de grosor.
   - Las cápsulas parpadean (alternar opacidad 1 / 0.5 cada 400 ms) cuando llevan más de 3 s en pantalla sin ser recogidas.
     Verificación: las cápsulas son visualmente distinguibles entre sí y parpadean correctamente.

7. **Dibujar los indicadores de power-up activo en el HUD interno** — `drawPowerUpHUD(ctx)`:
   - Posicionados en la esquina inferior derecha del canvas, a 10 px del borde.
   - Por cada `activeEffect` activo (máximo 1): dibujar rectángulo del tipo (20 × 14 px) y a su izquierda una barra de 60 px de ancho, altura 6 px, que representa el tiempo restante (`ratio = remaining / duration`). Color de la barra: azul para doble disparo, verde para escudo, naranja para velocidad.
     Verificación: el indicador aparece al recoger una cápsula y la barra decrece hasta 0.

8. **Dibujar el escudo activo** — `drawShield(ctx, player)`:
   - Arco de 270° (apertura inferior) de radio 22 px centrado en la nave, color `rgba(0, 255, 128, 0.45)`, grosor 3 px.
   - En modo doble nave, dibujar un arco sobre cada nave.
     Verificación: el arco verde es visible alrededor de la nave mientras el escudo está activo.

9. **Desactivar rayo tractor y power-ups en bonus stage**:
   - Al entrar en `bonusStage`, establecer `tractorBeam = null` y no decrementar los `tractorTimer` de los Bosses durante el bonus stage.
   - No generar `fallingPowerUp` al destruir enemigos del bonus stage.
     Verificación: durante el bonus stage no aparece ningún rayo tractor ni ninguna cápsula.

10. **Verificación final** — `npm run build` termina sin errores de TypeScript. Todas las rutas existentes responden sin errores 500.

---

## Acceptance criteria

- [ ] El Boss Galaga con `hp === 2` activa el rayo tractor cada 20–30 s si no hay otro rayo activo y el jugador tiene nave simple.
- [ ] El haz del rayo tractor desciende desde el Boss a 180 px/s con animación de líneas discontinuas en verde.
- [ ] El haz toca la nave del jugador y la captura; la nave sube hasta el Boss y el jugador reaparece en la base sin perder una vida.
- [ ] Si el haz llega al borde inferior sin capturar, desaparece sin consecuencias.
- [ ] En estado `captured-escort`, el icono de nave capturada aparece junto al Boss con opacidad reducida.
- [ ] Destruir el Boss captor inicia el descenso de la nave capturada hacia la base del jugador.
- [ ] Al completar el descenso, el jugador controla la doble nave (dos naves yuxtapuestas).
- [ ] La doble nave dispara 2 proyectiles simultáneos.
- [ ] El primer impacto en modo doble destruye una nave, vuelve al modo simple y resta 1 vida.
- [ ] Si la nave principal muere durante `captured-escort`, la nave capturada desaparece y el modo vuelve a `single`.
- [ ] Las cápsulas de power-up caen a 80 px/s al destruir un enemigo (prob. 12 %, niveles ≥ 2).
- [ ] Solo puede haber 1 cápsula activa en pantalla; las nuevas cápsulas no aparecen si ya hay una.
- [ ] Las cápsulas son visualmente distinguibles: azul (doble disparo), verde (escudo), naranja (velocidad).
- [ ] Las cápsulas parpadean tras 3 s sin ser recogidas.
- [ ] Recoger la cápsula de doble disparo permite tener 2 proyectiles activos durante 15 s.
- [ ] Recoger la cápsula de escudo genera el arco verde alrededor de la nave durante 10 s.
- [ ] El escudo absorbe 1 impacto sin restar vida y desaparece al hacerlo.
- [ ] Recoger la cápsula de velocidad aumenta la velocidad de la nave a 420 px/s durante 8 s.
- [ ] El HUD interno muestra el indicador del power-up activo con barra de progreso decreciente.
- [ ] La barra del indicador llega a 0 cuando el efecto expira; el estado base se restaura.
- [ ] Recoger el mismo tipo de power-up cuando está activo reinicia su temporizador.
- [ ] Durante el bonus stage no aparecen rayos tractores ni cápsulas de power-up.
- [ ] Todos los temporizadores de power-up y rayo tractor se limpian al desmontar el componente.
- [ ] El contrato de props `GalagaGameProps` no cambia (ningún prop nuevo añadido).
- [ ] `npm run build` completa sin errores de TypeScript.
- [ ] Ninguna ruta existente devuelve 500.

---

## Decisions

- **Sí: Rayo tractor solo para Boss con `hp === 2`** — el Boss debe estar intacto para activar el rayo. Razón: fiel a la mecánica original de Galaga; un Boss dañado no puede capturar naves, lo que da al jugador una estrategia defensiva (dañar al Boss para neutralizar su rayo).

- **Sí: La nave principal continúa jugable durante la captura** — el jugador no queda indefenso mientras la nave está capturada. Razón: mecánica original de Galaga; añade la decisión táctica de arriesgarse a disparar al Boss captor (destruirlo libera la nave capturada) o seguir jugando sin el riesgo.

- **Sí: Reaparición en la base sin perder vida al ser capturado** — la captura en sí no cuesta una vida; solo la muerte de la nave principal durante `captured-escort` cuenta como muerte. Razón: mecánica original; si la captura costara una vida inmediatamente, los jugadores evitarían sistemáticamente al Boss captor y se perdería la dimensión táctica.

- **Sí: Doble nave tras rescate** — destruir al Boss captor libera la nave y activa el modo de doble nave. Razón: es la recompensa canónica de Galaga por la maniobra de rescate; el modo doble es más poderoso (dos proyectiles) pero con hitbox mayor, equilibrando riesgo y recompensa.

- **Sí: Solo 1 cápsula activa en pantalla** — no se generan nuevas cápsulas mientras hay una cayendo. Razón: simplifica el modelo de estado y evita que la pantalla se llene de cápsulas a niveles altos; el jugador siempre tiene una decisión clara (recoger o dejar caer).

- **Sí: Solo 1 efecto activo simultáneamente** — un nuevo power-up reemplaza al activo si son del mismo tipo (reinicia el temporizador); si son de tipo diferente, el nuevo reemplaza al antiguo. Razón: la gestión de múltiples efectos solapados (stacking) añade complejidad de display y de lógica de restauración sin aportar suficiente profundidad de juego en este contexto.

- **Sí: Power-ups no aparecen en niveles 1** — la probabilidad de aparición es 0 en el nivel 1. Razón: el nivel 1 actúa como tutorial de la mecánica base; introducir power-ups desde el primer nivel puede distraer al jugador de aprender los controles y el patrón de la formación.

- **Sí: Desactivar rayo tractor y power-ups en bonus stage** — el bonus stage es una fase de respiro y puntuación pura. Razón: añadir el rayo tractor durante el bonus stage rompería la naturaleza de "pausa segura" que el bonus stage tiene en el original; los power-ups tampoco encajan porque el bonus stage ya es una recompensa en sí.

- **No: Stack de múltiples power-ups del mismo tipo** — recoger el mismo tipo reinicia el temporizador pero no acumula efectos. Razón: el stacking (ej. 30 s de doble disparo) desequilibraría la dificultad de niveles altos sin añadir complejidad de diseño interesante.

- **No: Persistencia de power-ups entre niveles** — al completar un nivel, todos los efectos activos expiran. Razón: cada nivel comienza en un estado limpio y reproducible; permitir efectos entre niveles crearía partidas con estados muy dispares según qué power-up se recogió al final del nivel anterior.

- **No: Modificar el contrato de props** — este spec no añade nuevos props a `GalagaGameProps`. Razón: la plataforma no necesita conocer el estado interno de power-ups o captura; solo le importa score, vidas, nivel y game over, que ya fluyen por los callbacks existentes.

- **No: Controles táctiles o mobile** — fuera del scope. Razón: se aplica el agente `mobile-porter` después de la implementación.

- **No: RLS en este spec** — las tablas quedan abiertas. Razón: se mitiga en el spec futuro de seguridad.
