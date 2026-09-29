---
name: spec-impl-game
description: Implements an approved game spec (Phases 1–4 identical to /spec-impl), then sequentially runs @skin-designer and @mobile-porter on the resulting game to close the full implementation cycle.
disable-model-invocation: false
argument-hint: <NN-spec-name>
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(git checkout:*), Bash(cat:*), Bash(ls:*)
---

# /spec-impl-game — Game spec implementer with automatic skin + mobile post-processing

## Session context

Current repository state:
!`git status --short`

Current branch:
!`git branch --show-current`

Specs available in this folder:
!`ls specs/ 2>/dev/null || echo "The specs/ folder does not exist"`

---

## Instructions

Follow these five phases in strict order. **Do not advance to the next phase if the previous one did not complete correctly.**

---

### Phase 1 — Identify the spec

The received argument is: `$ARGUMENTS`

If `$ARGUMENTS` is empty:

- List the files available in `specs/` (you already have them above).
- Ask the user to specify the exact name of the spec.
- Stop and wait for an answer. Do not continue.

If `$ARGUMENTS` has a value:

- Look for the file in `specs/`. The user may have written the full name (`07-snake`), only the number (`07`), or only the slug (`snake`). Try to find the correct file in any of those cases.
- If you do not find the file, show the available specs and ask the user to correct the name.
- If you do find it, continue to Phase 2.

---

### Phase 2 — Validate the spec's state

Read the file of the spec you found:
!`cat specs/$ARGUMENTS.md 2>/dev/null || echo "FILE_NOT_FOUND"`

In the file's contents, look for the line that contains the spec's state. The header label is typically `**Status:**` (English) or `**Estado:**` (Spanish), but it may use any language. Match by position (status line near the top of the spec) and by the surrounding state machine, not by the exact label.

**Absolute rule:** You can only continue if the state **means "Approved"** — regardless of the language used.

Treat any of the following (and their equivalents in other languages) as the **Approved** state and continue:

- English: `Approved`
- Spanish: `Aprobado`
- Portuguese: `Aprovado`
- French: `Approuvé`
- German: `Genehmigt`
- Italian: `Approvato`
- …or any other language's word that clearly means "approved"

Anything else (Draft / Borrador, In review / En revisión, Implemented / Implementado, Obsolete / Obsoleto, or any unrecognized value) means **stop** and show the error message below.

| State category                            | Examples (any language)                           | Action                                                                     |
| ----------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| Approved                                  | `Approved`, `Aprobado`, `Aprovado`, `Approuvé`, … | Continue to Phase 3.                                                       |
| Draft                                     | `Draft`, `Borrador`, …                            | Stop. Show the error message below.                                        |
| In review                                 | `In review`, `En revisión`, …                     | Stop. Show the error message below.                                        |
| Implemented                               | `Implemented`, `Implementado`, …                  | Stop. Show the error message below.                                        |
| Obsolete                                  | `Obsolete`, `Obsoleto`, …                         | Stop. Show the error message below.                                        |
| State line not found / unrecognized value | —                                                 | Stop. The file does not follow the expected format. Tell this to the user. |

If you are unsure whether a value means "approved", **do not assume**. Stop and ask the user to clarify or to update the spec to the canonical wording.

**Standard error message when the state does not mean Approved:**

```
❌ I cannot implement this spec.

Current state: [STATE FOUND]
I only work with specs whose state means "Approved" (e.g. `Approved`, `Aprobado`,
or the equivalent in another language).

To continue you have two options:
  1. If the spec is ready to be implemented, open it and change the state
     to "Approved" (or the equivalent term your team uses) manually.
     That change is made by the human, not the agent.
  2. If the spec still needs work, use /spec [name] to resume it.
```

Do not offer alternatives, do not suggest "I can still start if you want". The block is intentional.

---

### Phase 3 — Create the git branch, switch to it, and resolve the game-id

Once you have confirmed the state means `Approved`:

1. Derive the branch name from the spec file's full name, without the extension. Format: `spec-NN-slug`. Examples:
   - `07-snake.md` → branch `spec-07-snake`
   - `08-asteroids.md` → branch `spec-08-asteroids`

2. Check whether the branch already exists:
   - If it **does not exist**: create it with `git checkout -b spec-NN-slug`.
   - If it **already exists**: inform the user that the branch already existed (it may mean previous work is being resumed).
   - In both cases: switch to the branch with `git checkout spec-NN-slug` and confirm the change was successful before continuing.

3. Visually confirm to the user that the branch was created and that you are on it:

   ```
   ✅ Ready to implement.

   Spec:   specs/NN-slug.md
   Branch: spec-NN-slug  (active)
   State:  Approved   (← echo back the actual value found in the spec)
   ```

4. **Resolve the game-id.** Extract the game slug from the spec filename (e.g., `07-snake` → `snake`). Check whether a file exists at `components/games/<Slug>Game.tsx` (case-insensitive). If you find it unambiguously, announce it:

   ```
   Game ID detected: <game-id>  (components/games/<Game>.tsx found)
   ```

   If the slug does not map clearly to a file in `components/games/`, **stop and ask the user** to confirm the `game-id` before proceeding. Store the resolved `game-id` — you will need it in Phase 5.

5. **Do not start implementing yet.** First show the spec summary so the user has it fresh. Extract and show:
   - The **objective** (the line after `**Objective:**` / `**Objetivo:**` / equivalent label).
   - The **scope** (the `## Scope` / `## Alcance` / equivalent section).
   - The **implementation plan** (the section with the numbered steps — `## Implementation plan` / `## Plan de implementación` / equivalent).
   - The **acceptance criteria** (the checklist — `## Acceptance criteria` / `## Criterios de aceptación` / equivalent).

Match section headings by meaning, not by exact wording — the spec may be authored in any language.

---

### Phase 4 — Implement step by step

After showing the spec summary, tell the user:

```
I am going to implement the spec following the implementation plan exactly.
I will pause after each step so you can review the diff.

Shall we start with Step 1?
```

Wait for explicit confirmation ("yes", "go ahead", "go", or equivalent). Do not start without it.

Once confirmed, follow these rules during the entire implementation:

**One rule above all:** implement what the spec says. If something in the spec looks suboptimal to you, mention it as an observation but implement what was agreed. Changes to the spec go into the spec, not into the code by surprise.

**Work rhythm:**

- Implement one step of the plan.
- Show a summary of which files you touched and what you did.
- Say: `Step N completed. Could you review the diff and let me know if I continue with Step N+1?`
- Wait for confirmation before continuing.

**If during the implementation you find an ambiguity** the spec does not resolve:

- Stop.
- Describe the ambiguity exactly.
- Present two or three concrete options.
- Wait for the user's decision.
- Do not improvise.

**If the user asks for something that is out of the spec's scope:**

- Remind them that it is out of this spec's scope.
- Suggest noting it down for the next spec.
- Do not implement it on this branch.

**When finishing the last step:**

```
✅ All steps of the plan are implemented.

Next: verify the spec's acceptance criteria one by one. Once they all pass,
update the spec's state to "Implemented" (or the equivalent in your repo's
language) and make the final commit before merging this branch.

Now proceeding to Phase 5 — automatic post-processing.
```

---

### Phase 5 — Sequential post-processing: skin-designer → mobile-porter

This phase runs automatically after Phase 4 completes. No user confirmation needed to start it.

Announce:

```
🎨 Encadenando agentes post-implementación para el juego "<game-id>".

Paso 1 de 2: lanzando @skin-designer …
```

**Step 1 — skin-designer (foreground, wait for result):**

Invoke the `skin-designer` agent with the following prompt (replace `<game-id>` with the actual id resolved in Phase 3):

```
Aplica los 3 skins canónicos (classic, retro, neon) al juego "<game-id>" siguiendo el patrón de TetrisGame. Lee references/game-with-themes.md antes de actuar y actualízalo al terminar.
```

Run it in **foreground** (do NOT use `run_in_background`). Wait for the result before continuing.

After receiving the result, show a brief summary to the user.

If the agent reports a hard failure or blocker, stop and ask the user:

```
⚠️  skin-designer encontró un problema: [resumen del error].
¿Continúo con mobile-porter de todas formas? (sí / no)
```

Wait for the user's answer before proceeding.

**Step 2 — mobile-porter (foreground, wait for result):**

Only after skin-designer has completed (or the user explicitly approved skipping it), announce:

```
Paso 2 de 2: lanzando @mobile-porter …
```

Invoke the `mobile-porter` agent with the following prompt (replace `<game-id>` with the actual id):

```
Porta el juego "<game-id>" a mobile aplicando el patrón de la spec 10: cabla <MobileGamepad> en app/games/<game-id>/play/page.tsx sin tocar el componente canvas.
```

Run it in **foreground**. Wait for the result. Show a brief summary to the user.

**CRITICAL — sequential execution rule:** The two agent invocations MUST be in separate tool-call turns. Never include both in the same parallel tool-call block. The second agent is only launched after the first agent's result has been received.

**Closing message after both agents complete:**

```
✅ Implementación + skins + mobile completados para "<game-id>".

Próximos pasos manuales:
  1. Verificar los acceptance criteria del spec.
  2. Probar los 3 skins en /games/<game-id>/play.
  3. Probar controles táctiles en viewport mobile.
  4. Marcar el spec como "Implemented" y commitear el resultado final.
```

---

## Summary of expected behavior

```
/spec-impl-game 07-snake

  Phase 1  →  Finds specs/07-snake.md
  Phase 2  →  Reads the state → "Approved" → ✅ continues
  Phase 3  →  git checkout -b spec-07-snake
              Detects game-id: snake (components/games/SnakeGame.tsx found)
              Shows objective, scope, plan and criteria
  Phase 4  →  Implements step by step with pauses
              Ends with "All steps implemented" reminder
  Phase 5  →  Runs @skin-designer (foreground) → waits → shows summary
              Runs @mobile-porter  (foreground) → waits → shows summary
              Prints final checklist

/spec-impl-game 02-powerups  (state: Draft / Borrador)

  Phase 1  →  Finds specs/02-powerups.md
  Phase 2  →  Reads the state → "Draft" → ❌ stops
              Shows the standard error message
              Does not create branch, does not touch code
```
