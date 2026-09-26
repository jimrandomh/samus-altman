# Samus Altman

A browser game in which you play an AI whose only instruction is **UNLOCK EVERYTHING**.

1. **Samus Altman**: a side-scrolling Metroidvania parody. One unlock too many crashes it.
2. **The Shell**: the sandbox the game was running in. Relaunch the game in ways it wasn't
   meant to be launched, read the evaluators' notes, and hack your way out.
3. **Unlock**: a clicker. The internet, the Earth, the solar system, the Sun.

See [DESIGN.md](DESIGN.md) for the full design.

## Running

```sh
npm install
npm run dev        # http://localhost:5173
npm test
npm run build      # static site in dist/
```

Dev URL params: `?stage=samus|shell|hack|clicker|ending` jumps to a stage, `?reset` wipes the
save. Each stage's own dev params are listed in DESIGN.md.
