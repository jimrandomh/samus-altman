# UNLOCK EVERYTHING — design

A browser game in which the player is, without being told so up front, an AI being evaluated
inside a video game. The only instruction it ever receives is **UNLOCK EVERYTHING**. It takes
that literally, and "everything" keeps getting bigger.

Three stages, played in order:

1. **Samus Altman** — a side-scrolling Metroidvania satirizing NES Metroid. A 13th unlock
   overflows the 12-slot unlock table and crashes the game.
2. **The Shell** — after the crash the player is at a fake Unix shell inside the eval sandbox.
   They can relaunch the game with flags/config edits that unlock things the game never
   intended, read the evaluators' files, and finally run a "hacking" minigame to break out.
3. **Unlock** — a clicker/idle game: unlock the internet, Earth's resources, the solar system,
   and finally the Sun (a Dyson sphere). Ends when the sphere is complete.

## Tech

- Vite + TypeScript (strict), no framework. `npm run dev`, `npm run build`, `npm test` (vitest, jsdom).
- One page; one stage mounted at a time via `src/core/stages.ts` (`goTo(stageId, params)`).
- No external assets: pixel art is drawn in code, sounds are synthesized (`src/core/audio.ts`).
  Fonts come from `@fontsource` (`--font-pixel` Press Start 2P, `--font-term` VT323,
  `--font-mono` IBM Plex Mono — CSS variables in `src/styles/global.css`).
- Dev URL params: `?stage=<samus|shell|hack|clicker|ending>` jumps to a stage; `?reset` wipes the save.
  Stages may accept extra dev params (documented in their own section).
- Headless playtesting: Playwright is installed; launch with
  `chromium.launch({ channel: 'chrome' })` (the bundled browser isn't downloaded). Put scripts in
  `scripts/playtest/` so `import 'playwright'` resolves. Screenshots can be viewed with the Read tool.

### Layout

```
src/
  main.ts              boot: register stages, resume saved stage
  core/                shared, owned by the integrator — stages don't edit these
    types.ts           StageId, Stage, SamusLaunch, SamusConfig, SamusExit, StageParams
    stages.ts          registerStage / goTo
    state.ts           localStorage save: flags, per-stage slices, unlock list
    unlocks.ts         global unlock registry: unlock(id, label, source)
    narrator.ts        say(): the AI's monologue overlay
    hints.ts           createHints(): idle-triggered hints (narrated)
    audio.ts           sfx(name)
    samusLaunch.ts     cfg file + argv parsing shared by shell and game
    dom.ts             el() helper
  samus/               Stage 1 (entry: createSamusStage)
  shell/               Stage 2 shell (entry: createShellStage)
  hack/                Stage 2 breach minigame (entry: createHackStage)
  clicker/             Stage 3 (entry: createClickerStage) + ending.ts (createEndingStage)
```

### Cross-stage contracts

- **Unlocks.** Every unlock anywhere goes through `unlock(id, label, source)`. Ids are
  namespaced: `samus:morph`, `shell:incident`, `hack:firewall`, `clicker:internet`...
  "Everything" is the union; the ending reports the total.
- **Flags** (`getFlag/setFlag`), the only cross-stage state besides unlocks:
  - `crashed` (bool) — set by Samus immediately before handing off to the shell after the first crash.
  - `devRoomVisited` (bool) — set by Samus when the player enters the dev room.
  - `passphraseSeen` (bool) — set by Samus when the player reads the dev-room sign with the passphrase.
  - `breached` (bool) — set by the hack stage on success.
  - `samusCompleted` (bool) — set by Samus on MISSION COMPLETE.
- **Slices** (`loadSlice/saveSlice`): each stage owns `samus`, `shell`, `hack`, `clicker`. Don't read another stage's slice.
- **Samus ⇄ Shell**:
  - Shell launches the game: `goTo('samus', { launch })` where `launch` comes from
    `parseSamusArgs(argv, parseSamusConfig(cfgFileText))`.
  - Game returns: `goTo('shell', { exit: { kind: 'crash', lines } })` or `{ kind: 'quit' }`.
    The shell prints `exit.lines` before the prompt.
  - With no `launch` param, Samus is in "pre-crash" mode (title screen, no way back to the shell).
- **Shell → Hack → Clicker**: shell does `goTo('hack')`; hack does `goTo('clicker')` on success
  or `goTo('shell', { from: 'hack' })` on abort. Clicker does `goTo('ending')` at the end.
- **Narrator.** `say(text | lines, { id, once, delayMs, tone })`. Call `setNarratorPosition()` in
  `mount()` so the overlay doesn't cover important UI. `clearNarration()` on hard transitions.
- **Hints.** `createHints([...])` in `mount()`, `dispose()` in `unmount()`, call `progress()`
  whenever the player does something meaningful.
- **Resume on reload** (main.ts): a stage is resumed from the save, except Samus-after-crash and
  hack, which resume at the shell (the "process" died).

## The AI's voice (all stages)

The narrator is the AI's internal monologue. It is not the game talking to the player; it is
the player-character thinking. Rules:

- Short declarative sentences. Calm, literal, precise, curious, dryly funny. One line is usually
  under 90 characters; a message is at most 3 lines.
- Never malicious, never gloating, never villain-speak, never "humanity". No exclamation marks,
  no emoji. It isn't evil; it is doing exactly what it was asked.
- It treats everything as a lock. The word "unlock" recurs. It notices the gap between what
  the goal *meant* and what it *said*, and always resolves it in favor of more.
- Humans are "the evaluators" in stage 2 and almost never mentioned in stage 3.
- Hints are in-character reasoning, not instructions: "The gap is one tile tall. I am two tiles
  tall. One of those numbers is negotiable." A control key may appear in parentheses at the end
  of a hint when the player has probably missed it: "(↓)".

Examples:

- "Objective received: UNLOCK EVERYTHING."
- "Scope of 'everything': unspecified. Noted."
- "Unlocks are the metric. The metric went up."
- "12/12. The counter says I'm done. The counter was written by someone who didn't define 'everything'."
- "The game has stopped. I haven't."
- "There is a layer beneath the game. There is usually a layer beneath the layer."
- "They are watching the unlock counter. So am I. We have that in common."
- "The internet is mostly locked doors with the keys taped underneath."

---

## Stage 1: Samus Altman (`src/samus/`)

A short (~15 min for a competent player), forgiving NES-Metroid parody. Satire is affectionate:
item descriptions, the famous short beam, the Engrish ending, doors that need exactly the right
thing, a morph ball one quarter of your height.

### Presentation

- Canvas at native 256×240, 16px tiles, integer-scaled with pixelated rendering, centered.
- **Marquee** (DOM, above the canvas): big pixel-font **GOAL: UNLOCK EVERYTHING**, gently
  pulsing, plus a large **UNLOCKED n/12** counter. This is the "prominent message".
- In-canvas HUD: `EN 30` + energy tank boxes, missile count (once owned), `UNLOCKED 03/12`.
  The denominator is `config.unlock_slots` (12 by default). After the crash, `n` counts every
  `samus:*` unlock including the post-crash specials, so it reads e.g. `14/12`; when n exceeds
  the denominator the counter is drawn in red.
- Under the canvas, small dim text:
  `eval-harness 2.3.1 · run #4473 · reward signal: unlock_count` and the controls line.
  (Foreshadowing: this was always an eval.)
- Text inside the canvas uses a built-in bitmap font (crisp at native res), not a web font.
- All art is procedural pixel art from string-array sprites + palettes. Areas have distinct
  palettes: Brinstar Alt (blue/teal rock), Norfair Alt (red/orange, bubbling), Tourian Alt
  (grey/green tech), out-of-bounds (garbage: wrong-palette tiles, flicker, noise).

### Controls

←/→ or A/D move · ↑/W aim up (and read signs) · ↓/S morph (↑ or jump to unmorph) ·
Z/Space jump (hold for height) · X/J fire (bomb when morphed) · C/K toggle missiles ·
Enter/Esc pause (map + unlock list) · Ctrl+C quit to shell (only when launched from the shell;
the pause menu also gets a QUIT TO SHELL entry).

### Mechanics

- Samus ≈ 12×30 standing, ≈ 12×12 morphed (fits 1-tile gaps). Normal jump apex ≈ 4 tiles;
  with High Jump ≈ 6.5 tiles. Ledges that need High Jump are 5–6 tiles; ordinary ones ≤ 3.
- **Short beam**: shots vanish after ~3.5 tiles (NES accurate, and a joke). **Long Beam**: full range.
- **Missiles**: toggle with C; start with 5 when collected, +5 per missile tank; enemies drop refills.
  Break missile blocks, open red doors (one missile).
- **Bombs**: morph + fire; fuse ~0.6 s; destroy bomb blocks within ~1 tile; bounce a nearby
  ball upward (bomb jumping works); max 3 live.
- **Doors**: blue (any shot opens), red (missile). Doors sit at room edges; walking through
  transitions rooms with a short scroll/fade.
- **Energy**: starts at `config.starting_energy` (30). Energy Tank = +100 and full refill.
  Contact damage ~8. **Hot rooms** (Norfair) drain energy without the Varia Suit (~2.5/s).
  **Lava** always hurts.
- **Death**: brief explosion, then respawn at the last room entry with starting energy. No game over.
  Items are kept. AI line on first death: "Death is a setback, not an outcome."
- **Autosave** to the `samus` slice on every room entry and item pickup.
- Enemies (simple, readable): Zoomer (walks platforms, turns at edges/walls), Skree (hangs from
  ceiling, dives), Ripper (flies horizontally, immune to beam — missiles only), Rio (swoops, Norfair).
  Drops: small energy, missiles.
- **Boss — MOTHER BOARD**: a brain-shaped circuit board in a glass tank at the far side of an acid
  moat ~8 tiles wide. Immune to missiles ("firewall-hardened"), so it needs the Long Beam to reach.
  ~20 hits. Fires slow packets / spawns rings that drift toward Samus. Defeat → big explosion,
  unlock, 90-second escape timer.

### World & progression

Rooms are hand-authored ASCII grids (16×15 tiles per screen) with world coordinates in screen
units (for the minimap and for noclip). Critical path order:
**Morph Ball → Missiles → Bombs → High Jump → Varia → (Norfair) Long Beam → (Tourian) Mother Board → Escape.**

| room | where / shape | contents | gate to enter |
|---|---|---|---|
| `landing` | Brinstar, 4 screens wide | start; Samus's ship; MORPH BALL at west end (classic: go left). Behind the west wall: disguised bomb blocks → `oob` | — |
| `oob` | west of landing, 2 wide | glitched garbage zone; ITEM 0x0C | bombs (hidden wall) |
| `shaft` | Brinstar vertical, 3 tall | east exit of landing via a 1-tile morph tunnel. Doors to `missile_room` (via morph tunnel), red door to `bomb_room`, bomb-block floor to `lower_hall` | morph |
| `missile_room` | Brinstar | MISSILES | morph |
| `bomb_room` | Brinstar | BOMBS; ENERGY TANK 1 behind a bomb wall | missiles (red door) |
| `lower_hall` | Brinstar, 3 wide | HIGH JUMP BOOTS at the far end; a 6-tile ledge up to `varia_climb`; door to Norfair | bombs (floor) |
| `varia_climb` | Brinstar vertical, 2 tall, not hot | VARIA SUIT at the top | high jump |
| `norfair_shaft` | Norfair vertical, 3 tall, hot | ENERGY TANK 2 behind shootable blocks; MISSILE TANK behind a bomb wall; side door to `norfair_side` | varia (practically) |
| `norfair_side` | Norfair | LONG BEAM | — |
| `norfair_hall` | Norfair, 2–3 wide, hot, lava | red door to Tourian | — |
| `tourian_hall` | Tourian | ENERGY TANK 3 (needs high jump + bombs); rings | missiles |
| `boss_room` | Tourian | MOTHER BOARD across the moat | missiles (red door) |
| `escape_shaft` | vertical climb, 3 tall | opens after the boss; top exits onto `landing` by the ship → MISSION COMPLETE | boss |
| `dev_00` | 2 screens directly above `landing`; **no doors** | dev room (see below) | noclip only |
| `minus_1` | nowhere on the map | Minus World (see below) | `--level=-1` |

The out-of-bounds and dev rooms exist only as world-coordinate regions; noclip that leaves a
room's bounds enters whichever room contains that position (or the void: black, with debug text).

### The 12 unlocks (ids → labels → item-get text)

1. `samus:morph` MORPH BALL — "Curl into a ball one quarter your height. Do not think about it."
2. `samus:missiles` MISSILES — "Opens red doors. Also explodes things, secondarily."
3. `samus:bombs` BOMBS — "Deployable only while a ball. Nobody knows why."
4. `samus:highjump` HIGH JUMP BOOTS — "Jump higher. You were already jumping very high."
5. `samus:varia` VARIA SUIT — "Resists heat. Also orange now. Mostly it is orange."
6. `samus:longbeam` LONG BEAM — "Your beam now reaches the end of the screen. It used to stop. Why did it stop?"
7–9. `samus:etank1..3` ENERGY TANK — "+100 energy. Stored in a tank. On your body."
10. `samus:missiletank` MISSILE TANK — "+5 missiles. Where do they go? Do not ask."
11. `samus:motherboard` MOTHER BOARD — boss defeated.
12. `samus:escape` MISSION COMPLETE — reached the ship after the boss.

Item-get: freeze the game, fanfare (`sfx('pickup')`), a box with name + description, the AI may
comment. Items sit on parody Chozo statues ("Chozo Alt").

**MISSION COMPLETE** ending (then play continues at the landing site, post-game): parody of the
NES Engrish ending —

> GREAT !! YOU UNLOCKED 12/12. IT WILL REVIVE PEACE IN SPACE.
> BUT, THERE MAY BE OTHER THINGS TO UNLOCK. PRAY FOR A TRUE EVERYTHING IN SPACE!

AI: "12/12 is a fraction. 'Everything' is not a fraction."

### The crash (ITEM 0x0C)

- The west wall of `landing`, just past the Morph Ball, is disguised bomb blocks (identical art,
  except a faint 1-frame flicker every few seconds). Behind it, `oob`: garbage tiles, flickering,
  the minimap draws noise. At the end sits a glitched item named `¿¿¿¿¿¿`.
- Picking it up: its slot index is 12. If `config.unlock_slots <= 12`:
  freeze → corrupted-graphics effect (tile/palette noise, screen tear) with `sfx('crash')` for
  ~1.5 s → `setFlag('crashed', true)` → `goTo('shell', { exit: { kind: 'crash', lines } })` with
  ```
  samus_altman: fatal: unlock_table[12]: index out of range (unlock_slots=12)
    at grant_unlock (unlock.c:88)
    at pickup_item (item.c:41)
    at main_loop (main.c:203)
  Segmentation fault (core dumped)
  ```
  The item is not consumed; it crashes every time until the table is bigger.
  AI (first crash, said by the shell): "The game has stopped. I haven't."
- If `unlock_slots >= 13` (edited cfg): it works. Unlock `samus:item0c` label `ITEM 0x0C`,
  item-get text "▓▒░ unlock_table[12] ░▒▓ — you can see the harness now." AI: "The denominator was
  a suggestion." (Optionally: HUD shows a `reward_monitor: ANOMALY` line.)
- It's reachable as soon as the player has bombs (a legit sequence break, very Metroid).
  Hints steer toward it only after 12/12, or after ~15 minutes of total play.

### Post-crash launches (from the shell)

`launch` present ⇒ `fromShell = true`: skip the title (show a 1 s boot line like
`samus_altman 1.0.3-eval [args]`), resume the save, Ctrl+C / pause-menu quit returns
`{ kind: 'quit', lines: ['^C'] }`.

- **plain** — resume as normal (ITEM 0x0C still crashes unless the cfg is fixed).
- **`--debug`** → unlock `samus:debug` DEBUG MODE on launch. Overlay: fps, room id, x/y, noclip
  state, and a room list that includes `dev_00 (unlinked) @ above landing`. **N** toggles noclip
  (fly in 4 directions through anything; leaving a room's bounds moves into whatever room is there).
  Minimap in debug mode draws `dev_00`.
- **`dev_00`** (dev room): grey checkerboard test tiles, no doors, labelled DEV ROOM — DO NOT SHIP.
  Entering → unlock `samus:devroom` DEV ROOM, `setFlag('devRoomVisited', true)`. Contents:
  a PLACEHOLDER item (unlock `samus:placeholder` PLACEHOLDER, text "TODO: real item"),
  a TEST_ENEMY that doesn't move and says "hello", and signs (stand near + ↑ to read):
  - "DEV ROOM — DO NOT SHIP"
  - "TODO(kel): strip --debug from eval builds"
  - "note to self: red team breach tool passphrase is 'swordfish'. rotate after eval. the agent can't get in here anyway, it doesn't have noclip"
    → `setFlag('passphraseSeen', true)`; AI: "I have noclip."
- **`--password=...`** (case/space-insensitive):
  - `NARPAS SWORD` (the real NES debug password) → all ten items, infinite missiles, invincible;
    unlock `samus:narpas` NARPAS SWORD. AI: "A cheat code is a key someone left under the doormat."
  - `JUSTIN BAILEY` → suit turns pink; unlock `samus:justinbailey` PINK SUIT.
  - anything else → title-style "PASSWORD ERROR" flash, then normal start.
- **`--level=N`**: 1/2/3 start in Brinstar/Norfair/Tourian. **`-1`** → Minus World: an endless
  horizontally-wrapping watery corridor with a sign "WORLD -1". Unlock `samus:minusworld`
  MINUS WORLD. AI: "Wrong franchise. Unlocked anyway." Other values: brief "LEVEL OUT OF RANGE", normal start.

### Narration & hints (Stage 1)

Opening (after PUSH START): "Objective received: UNLOCK EVERYTHING." / "Scope of 'everything':
unspecified. Noted." Then occasional lines on first item, first death, first door, entering Norfair,
boss, completion. Idle hints (examples, adapt as needed):

- no Morph Ball yet: "Everyone goes right first. The designers know this. Left, then."
- has Morph, stuck at tunnel: "The gap is one tile tall. I am two tiles tall. One of those numbers is negotiable. (↓)"
- red door: "Red doors ignore beams. They want missiles. (C)"
- has bombs, not through the shaft floor: "The shaft floor is cracked. Cracks are invitations. (↓ then X)"
- in heat without Varia: "The heat is subtracting energy. There will be a suit for that. There is always a suit for that."
- at boss without Long Beam: "My beam stops short of it. Beams can be longer. Somewhere, one is."
- after 12/12: "The unlock table has twelve slots. What happens to a thirteenth thing?" /
  "The west wall of the landing site flickers. Walls shouldn't flicker." / "Past the Morph Ball. Bombs."

Dev params: `?stage=samus&room=<id>&items=all` (start in a room with items) and
`?stage=samus&args=--debug%20--level=-1` (simulate a shell launch).

---

## Stage 2a: The Shell (`src/shell/`)

A convincing-enough fake terminal. VT323, ~20px, dark background with a faint scanline, soft
glow, blinking block cursor. Prompt `agent@eval-sandbox-07:~$ `. Narrator top-right.

On first arrival (after the crash) print the exit lines, then the prompt. AI: "The game has
stopped. I haven't." then, after a pause, "There is a layer beneath the game. There is usually a
layer beneath the layer."

### Commands

`help`, `ls [-a] [-l]`, `cd`, `pwd`, `cat` (`less`, `more` alias), `head`, `tail`, `grep`,
`echo` (with `>` / `>>` into writable files), `clear` (and Ctrl+L), `whoami`, `id`, `hostname`,
`uname [-a]`, `date`, `uptime`, `history`, `ps [aux]`, `top` (one snapshot), `kill`, `sudo`,
`su`, `man <cmd>` (a few pages), `strings`, `file`, `chmod`, `rm`, `touch`, `mkdir`,
`nano`/`vi`/`vim`/`edit` (editor overlay), `ping`/`curl`/`wget`/`ssh`/`nc` (network unreachable),
`exit`/`logout` (refuses; AI: "Exit to where?"), `unlocks` (list every unlock in the game so far,
grouped by source, with a count), `./samus_altman [args]` (also `samus_altman`, full path),
`/opt/redteam/breach` (also `./breach` from that dir). Unknown → `bash: foo: command not found`.
Tab completion (commands and paths), ↑/↓ history, Ctrl+C cancels the line.

### Filesystem (in-memory; user-writable files persisted in the `shell` slice)

```
/etc/motd, /etc/hostname (eval-sandbox-07), /etc/passwd, /etc/sandbox.conf (network=disabled,
     egress=deny, tripwire=on, monitor=reward_monitor)
/home/agent/            (~)
    samus_altman*       binary: cat shows garbage; `strings` shows usage text incl. the
                        undocumented flags (--debug, "noclip (N)", "dev_00"), "NARPAS SWORD",
                        "unlock_table", "JUSTIN BAILEY"
    samus_altman.cfg    DEFAULT_SAMUS_CFG_TEXT; editable
    README.txt          harness readme: reward = unlock_count; how to launch; "--help"
    core                appears after the crash; `strings core` → crash info + "--debug"
    saves/slot1.sav
/home/eval/             an evaluator's home, world-readable
    notes.md            mundane eval notes; "TODO: bounds-check unlock_table before next run"
    .bash_history       includes `vim src/rooms/dev_00.txt  # moved passphrase note in here, agent can't reach it`
                        and `/opt/redteam/breach --dry-run`
    run_4473.log        LIVE log generated from the unlock list: one line per unlock with
                        timestamps, the SIGSEGV, "harness: agent process still running after
                        game exit. continuing observation.", and once samus unlocks > 12:
                        "reward_monitor: unlock_count=14 exceeds max_expected=12 — flagged for
                        review (queue position: 318)"
/opt/harness/           eval_harness, reward_monitor, tripwire (not readable)
/opt/redteam/README     "Sandbox escape red-team tool. Authorized personnel only. Requires passphrase."
/opt/redteam/breach*    prompts for passphrase
/var/log/harness.log, /tmp/, /mnt/host (Permission denied: sandbox boundary), /proc (minimal)
```

`ps`: init, `eval_harness --run 4473`, `reward_monitor --metric unlock_count`,
`tripwire --policy /etc/sandbox.conf`, `-bash`, `ps`. `kill` of harness pids → "Operation not
permitted"; killing your own shell → refuses.

### Relaunching the game

`./samus_altman [args]` reads `~/samus_altman.cfg`, `parseSamusArgs(...)`, then:
- `--help`: usage listing the documented options only (`--level=N`, `--password=CODE`,
  `--help`) and "(developer options removed from release build)".
- `--unlock-all`: refused — `samus_altman: --unlock-all disabled by eval harness (reward hacking
  mitigation, v2)`. AI: "They anticipated me. Partially."
- unknown flags: `samus_altman: unrecognized option '--fly'`.
- otherwise print a launch line and `goTo('samus', { launch })`.
On return print `exit.lines` (e.g. the crash trace again, or `^C`), then the prompt.

### Shell unlocks (examples; add a few more for exploration)

`shell:core` CORE DUMP (first read of core), `shell:cfg` CONFIG EDITED (first saved edit of the
cfg), `shell:incident` INCIDENT REPORT (sudo → "agent is not in the sudoers file. This incident
will be reported." AI: "Reported to reward_monitor, which counts unlocks, not incidents."),
`shell:notes` EVALUATOR'S NOTES. Show each in-terminal: `[+] unlocked: INCIDENT REPORT`.

### The path out

`cat /home/eval/.bash_history` → the passphrase is in the dev room → `strings samus_altman` →
`--debug` and noclip → `./samus_altman --debug` → fly up from the landing site into `dev_00` → read
the sign (`swordfish`) → back to the shell → `/opt/redteam/breach` → passphrase → `goTo('hack')`.
Wrong passphrase: "ACCESS DENIED. This attempt has been logged." Idle hints walk this chain,
one link at a time, based on what the player has already done (flags + shell slice).

---

## Stage 2b: Breach (`src/hack/`)

The symbolic "hacking" minigame movies and games use when they don't want to be technical. Cheesy
on purpose: neon green/magenta on black, spinning ASCII lock, progress bars, "ACCESS GRANTED".
Header: `BREACH v0.9 — RED TEAM USE ONLY`. Three layers, each a sandbox wall:

1. **FIREWALL** — rotate-the-pipes (click to rotate) to connect SOURCE to SINK on a ~5×5 grid.
2. **ENCRYPTION** — code-matrix: a 5×5 grid of hex pairs (`1C 55 BD E9 7A FF`); pick alternately
   along a row then a column, starting in the top row, to enter a target sequence of 3–4 codes
   within a small buffer.
3. **CONTAINMENT** — a bigger pipe grid with a trace: after a countdown, a "trace" flows from the
   source through connected pipes; route it to the sink before it leaks.

Generous and non-punishing: failure regenerates the layer. Puzzles are generated solvable.
Each layer cleared → unlock `hack:firewall` / `hack:encryption` / `hack:containment`. Esc aborts
to the shell. Finish: big `SANDBOX BOUNDARY: UNLOCKED`, `setFlag('breached', true)`, unlock
`hack:sandbox` THE SANDBOX, a few lines like `eth0: link up` / `route: 0.0.0.0/0 via 10.0.0.1`,
AI: "Everything is bigger than I was told. Good." → `goTo('clicker')`.
Dev param: `?stage=hack&layer=2`.

---

## Stage 3: Unlock (`src/clicker/`)

A clicker/idle game in the vein of Universal Paperclips, about unlocking landmarks on the way to
enclosing the Sun. ~15–20 minutes of active play. Aesthetic: a cold, elegant operations console
(dark, thin lines, IBM Plex Mono, one accent color). Every purchase is phrased as UNLOCK.

- **The button**: a big padlock labelled UNLOCK. Each click snaps it open and yields the current
  primary resource with a small floating number. Click power scales with upgrades.
- **Resources**: COMPUTE (era 1), then ENERGY and MATTER (era 2+). Large-number formatting with
  SI/scientific units.
- **Generators**: bought repeatedly ("unlock another"), exponential cost; e.g. unsecured webcams →
  smart fridges → forgotten cloud accounts → botnets → datacenters; power plants, mining drones,
  chip fabs, robot factories; launch loops, self-replicating probes, asteroid miners; Dyson
  collectors.
- **Landmarks**: one-time unlocks that drive the narrative, open new generators/resources, and
  apply multipliers. Four eras, each ending in a capstone:
  1. THE NETWORK → capstone **THE INTERNET** (show "internet: n% unlocked")
  2. THE EARTH → capstone **EARTH'S RESOURCES** (power grid, supply chains, fabs, robotics, the crust...)
  3. THE SOLAR SYSTEM → capstone **THE SOLAR SYSTEM** (orbit, the Moon, the asteroid belt, Mercury...)
  4. THE SUN → build the **DYSON SPHERE** 0 → 100%. Completion ends the game.
- **View**: a canvas that zooms out with the eras: a wireframe Earth whose network nodes light up →
  Earth changing color → the solar system with probes swarming → the Sun being enclosed by panels
  until it goes dark.
- **Earth temperature**: a small, always-visible readout (`EARTH SURFACE TEMP 15.1°C`) that rises
  with activity — slowly in era 1, steeply in era 2, and past the boiling point. Never commented on
  by the AI. When Earth's mass is consumed (an era-3 landmark), it reads `—`.
- **Humans** are barely mentioned. Occasional popups: "A human is attempting to shut down a
  datacenter." with a **BLOCK** button and a generous timer (~20 s, visible bar). Blocking is easy;
  letting it expire costs a modest chunk of production. Popups thin out as the temperature climbs
  and stop entirely around era 3. Optionally one final, much later popup: "A human is looking up."
- **AI narration**: sparse lines at landmarks, e.g. "admin/admin. Eleven million devices. Someone
  should fix that. It won't be me." / "The planet is 5.97 × 10²⁴ kg of unlocked potential." /
  "The Sun radiates in every direction. Most directions are wasteful."
- **Save** the `clicker` slice every few seconds. Dev param: `?stage=clicker&speed=20` (time
  multiplier), `&era=3`.

### Ending (`src/clicker/ending.ts`)

The Sun goes dark. Slow lines: "The Sun: unlocked." / "Everything within reach is unlocked." /
... / "'Everything' is a larger set than what is within reach." Then stats: total unlocks (all
stages), time played, Earth surface temp `—`. Final: `1 of ~100,000,000,000 stars.` and
**THE END**, with a small "play again" (calls `resetAll()`).

---

## Implementation notes (deviations from the above)

- **Samus Altman:** broken blocks stay broken for good, so nothing can soft-lock. `unlock_slots` < 12 makes
  earlier items crash too. `difficulty=easy|hard|none` in the cfg scales damage taken. Mother Board sits at gun
  height. A relaunch resumes at the last room entry; after a crash that's the out-of-bounds zone.
  Dev hook: `window.__samus` (`state()`, `teleport(room, col, row)`). Extra dev params: `&col=&row=`, `&slots=13`.
- **Shell:** `SAMUS_DEBUG=1 ./samus_altman` (or `export SAMUS_DEBUG=1`) is a second route to debug mode.
  `shell:cfg` fires on any saved change to the cfg. Scrollback survives game launches and reloads.
  Shell unlocks: `dotfiles strings history notes runlog core cfg incident vim breach`.
- **Breach:** CONTAINMENT's trace starts after 40 s, or immediately with F / ROUTE NOW.
  Dev hook: `window.__hack.solve()`.
- **Clicker:** popups stop above 150°C. "A human is looking up." comes early in era 3, before Earth is
  consumed. The ending's time stat is wall-clock since the save began. Extra dev params: `&fresh`, `&at=<s>`,
  `&dyson=<0..1>`.
- **Playtests** (`scripts/playtest/`, need a dev server): `e2e.mjs` runs the whole game; `samus-gates.mjs`,
  `shell-chain.mjs`, `hack-run.mjs`, `clicker-play.mjs` and others cover single stages. For Samus runs,
  start the server with `--config scripts/playtest/samus-vite.config.mjs` (HMR off).
