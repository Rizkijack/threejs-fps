// BREACHPOINT packaging entry (Node 22, standard library only).
//
// The game itself is the static `game/` folder next to this file: plain ES modules, three.js
// pulled in through an import map, no build step. This program exists for the grader, which
// asks for one directory it can read: everything under /output is a copy of the game, the
// screenshots, and a dossier.json summary produced by the vendored make.fun helper.
//
// Locally the grader's /output does not exist, so MAKEFUN_OUTPUT_DIR stands in:
//   mkdir out && MAKEFUN_OUTPUT_DIR=out node main.ts
// then open game/index.html through `node serve.ts` for the playable build.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// The program lives beside the game/ and screenshots/ folders it packages, so resolve both
// from this module's own URL rather than from the caller's working directory.
const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });

// Game files are plain static assets and vendor three.js, so a recursive copy is the whole
// install step. Screenshots are optional: a build without them still yields a valid dossier.
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// These are the scorer's own limits (reference/gate.json). text_max_bytes caps the written
// description; the rest make buildDossier refuse anything the scorer would refuse: more than
// four screenshots, a single screenshot over 256 KiB, or a game/ tree past 993 files / 48 MiB.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));
