# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Arcade Vault — online gaming platform where users play classic arcade games and compete for points on per-game leaderboards. Uses **Spec Driven Design** via the `/spec` and `/spec-impl` skills from `npx skills@latest add Klerith/fernando-skills` (see `skills-lock.json`).

## Stack

- **Next.js 16.2.6** with App Router — read `node_modules/next/dist/docs/` before writing Next.js code; APIs differ from training data (e.g. `middleware.ts` → `proxy.ts`)
- **React 19.2.4**
- **Tailwind CSS v4** (PostCSS plugin via `@tailwindcss/postcss`)
- **TypeScript**
- **Supabase** (`@supabase/ssr`, `@supabase/supabase-js`) — Auth (email+password, OAuth Google/GitHub) + `games` / `scores` tables with RLS
- **Resend** — contact form email delivery
- **Prettier + ESLint** — `npm run format`, `npm run format:check`, `npm run lint`

No test runner configured.

### Env vars (`.env.template`)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_DB_PASSWORD`, `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL` (base for OAuth / reset-password `redirectTo` — never use `window.location.origin`).

## Tooling

- **Hook** `PostToolUse` (`.claude/settings.json` → `.claude/hooks/format-and-lint.sh`): after every Write/Edit runs Prettier (ts/tsx/js/json/css/md) and `eslint --fix` (ts/tsx/js) on the edited file.
- **Plugins** enabled: `security-guidance`, `superpowers`.
- **MCP** `supabase` (`.mcp.json`) — used for migrations, SQL, advisors.

## Skills

Usa siempre `/frontend-design` para diseñar la interfaz de usuario.

- **`/spec`**, **`/spec-impl`** — flujo Spec Driven Design (Klerith/fernando-skills).
- **`/add-game`** (`.claude/skills/add-game/`) — genera `specs/NN-<slug>-game.md` para un nuevo juego canvas a partir de una carpeta de `references/started-games/` o una descripción libre. No escribe código; luego se ejecuta con `/spec-impl-game`.
- **`/spec-impl-game`** (`.claude/skills/spec-impl-game/`, espejo en `.agents/skills/`) — variante de `/spec-impl` para specs de juegos: mismo flujo (Fases 1–4) y al terminar encadena automáticamente `@skin-designer` y luego `@mobile-porter` de forma secuencial.

## Agentes

- **`game-planner`** — sugiere el próximo juego a implementar evaluando diversidad, factibilidad y reconocimiento clásico. To-do persistente en `references/game-suggestions-todo.md`. Úsalo con "qué juego sigue". Detalle: `.claude/agents/game-planner.md`.
- **`game-jam`** — dado un tema, genera ≥2 specs completos en `specs/game-jam/<game-id>/`. Úsalo con "game jam: \<tema\>". Detalle: `.claude/agents/game-jam.md`.
- **`skin-designer`** — aplica los 3 skins canónicos (classic, retro, neon) a un juego. Progreso en `references/game-with-themes.md`. Úsalo con "aplica skins a \<juego\>". Detalle: `.claude/agents/skin-designer.md`.
- **`mobile-porter`** — añade controles táctiles (spec 10) a un juego sin tocar el componente canvas. Úsalo con "porta \<juego\> a mobile". Detalle: `.claude/agents/mobile-porter.md`.
- **`game-performance-booster`** — audita y corrige los 7 patrones de performance (spec 12) en un juego. Úsalo con "optimiza \<juego\>". Detalle: `.claude/agents/game-performance-booster.md`.
- **`security-auditor`** — audita seguridad de DB Supabase (RLS, políticas, advisors) y app Next.js (headers, proxy.ts, secretos, deps). Solo lectura. Bitácora en `references/security/audit-log.md`, checklist en `references/security/security-checklist.md`. Úsalo con "audita seguridad". Detalle: `.claude/agents/security-auditor.md`.

## Architecture

App Router exclusively — no `pages/` directory.

### Routes (`app/`)

- `layout.tsx` — root layout (Geist fonts, global CSS, `UserProvider`, `Nav`)
- `page.tsx` — home / landing
- `about/` — about + contact form
- `api/contact/` — Resend-backed contact endpoint
- `auth/page.tsx` — login / registro / forgot-password con Supabase Auth (email+password + OAuth Google/GitHub). Registro valida `PASSWORD_REGEX` (≥8, mayúscula, minúscula, dígito, símbolo); muestra banner si `?error=callback`.
- `auth/callback/route.ts` — intercambia código OAuth / confirmación de email por sesión (`exchangeCodeForSession`); en error redirige a `/auth?error=callback`.
- `auth/reset-password/page.tsx` — nueva contraseña (mismo `PASSWORD_REGEX`).
- `games/` — games index (`GamesGrid.tsx`) + per-game routes `games/<name>/play/`: `arkanoid`, `asteroids`, `frogger`, `snake`, `tetris`
  (see `references/implemented-games.md`) when you need to check which games are implemented and how to implement new ones.
- `games/[id]/` — dynamic game detail with nested `play/` route (consume tabla `games`)
- `hall-of-fame/` — leaderboard / scores
- `context/UserContext.tsx` — client auth context; `useUser()` expone `{ user, session, username, avatarUrl, signOut }` (Supabase `User`/`Session`)
- `data/` — static catalog: `games.ts`, `scores.ts`, `index.ts`
- `pokemon-counter/` — página demo (no es parte del producto)
- `RevealObserver.tsx` — scroll-reveal animations

### Root files

- `proxy.ts` — Next 16 Proxy (ex-middleware). Matcher `/auth`: si existe cookie de sesión Supabase (`sb-<project-ref>-auth-token`) redirige a `/`. El project ref está hardcodeado — actualizarlo si cambia el proyecto Supabase.
- `next.config.ts` — security headers en todas las rutas (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `X-DNS-Prefetch-Control`); `allowedDevOrigins` para probar en móvil por LAN.

### Shared code

- `components/Nav.tsx` — top navigation; avatar + username + "Cerrar sesión" con sesión activa
- `components/MobileGamepad.tsx` + `MobileGamepad.module.css` — gamepad táctil reutilizable (spec 10) con skin neon (spec 11)
- `components/games/` — canvas game implementations (`ArkanoidGame`, `AsteroidsGame`, `FroggerGame`, `SnakeGame`, `TetrisGame`), cada uno con skins classic/retro/neon
- `lib/supabase/` — `client.ts` (browser), `server.ts` (RSC/route handlers; `setAll` en try/catch porque RSC no puede escribir cookies), `types.ts` (`GameRow`, `ScoreRow`)
- `public/` — sprite sheets (`spritesheet-breakout.png`, `fruits.png`) and audio (`ball-bounce.mp3`, `break-sound.mp3`)

### References (`references/`)

- `implemented-games.md`, `game-with-themes.md`, `game-suggestions-todo.md` — estado de juegos / skins / sugerencias
- `started-games/` — prototipos vanilla JS fuente para portar (input de `/add-game`)
- `templates/` — maquetas JSX/HTML de diseño original
- `security/` — checklist + bitácora de auditorías
- `gamepad-assets/`, `source-assets/` — assets fuente

### Specs

`specs/` holds the spec-driven design history (01–15), plus `specs/game-jam/` for thematic jams. Hitos recientes: 10–11 mobile gamepad, 12 frogger performance, 13 Supabase Auth, 14 RLS + password + headers, 15 auth hardening.

## Conventions

- Server Components by default; add `"use client"` only when needed (game canvases, auth context, interactive forms).
- New routes: folder under `app/` with `page.tsx`.
- Shared UI in `components/`; game logic colocated in `components/games/<Game>.tsx`.
- Supabase: import from `lib/supabase/server` in RSC / route handlers, `lib/supabase/client` in client components.
- New games: `/add-game` → `/spec-impl-game`. Pattern: spec in `specs/`, canvas component in `components/games/`, route `app/games/<name>/play/`, fila en tabla `games`, score writes through `lib/supabase`.
- Play pages: pre-rellenar `player_name` con `username` de `useUser()` (editable) y enviar `user_id` al insertar en `scores` (RLS: INSERT solo `authenticated` con `auth.uid() = user_id`; invitados no guardan score).
- Auth: contraseñas con `PASSWORD_REGEX`; `redirectTo` siempre desde `NEXT_PUBLIC_APP_URL`; `autocomplete` correcto (`current-password` / `new-password`).
- DB changes vía MCP supabase; tras cambios corre `security-auditor`.
