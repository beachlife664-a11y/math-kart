---
name: math-kart
description: "Run, verify, and modify the bundled Math Kart v13 Three.js math racing game with one or two real local players, numeric-answer controls, responsive lower math panels, and stable shared or split cameras. Use when asked to install or play Math Kart, copy its complete project, continue developing this repository, create a derivative that must preserve its current art and gameplay, or validate its lightweight Meshopt models and runtime assets."
---

# Math Kart

Use `assets/math-kart/` as the single authoritative game template. Preserve the current game, art, and tests unless the user explicitly requests a change. Do not regenerate or download replacement art for an exact copy.

## Resolve the project

Set `SKILL_DIR` to the directory containing this file. Resolve bundled resources from that directory, not from the current working directory.

- For an existing writable game copy identified by the user, work there directly.
- Otherwise create one writable project outside the installed Skill directory:

```bash
python3 "$SKILL_DIR/scripts/create_project.py" --destination /absolute/path/to/math-kart-project
cd /absolute/path/to/math-kart-project
```

Use `py -3` instead of `python3` when that is the available Python 3 launcher on Windows. The destination must be absent or empty; never overwrite an existing project. The copy includes the lockfile, runtime resources, audio masters, tests, and verification scripts without caches, raw authoring models, or historical QA output.

## Run the game

Run game commands from the writable project root.

```bash
node scripts/setup.mjs
npm run preview:static
```

Open `http://127.0.0.1:28474/`. Set `PORT` to another available port when needed. The first dependency install requires npm registry access; after installation, the game needs no network, API key, asset-generation account, or external model service.

For development, use `npm run dev -- --port 28473`. Read [GAMEPLAY.md](references/GAMEPLAY.md) before changing controls, layout, race rules, or cameras. Read [ARCHITECTURE.md](references/ARCHITECTURE.md) and [CODING_STANDARDS.md](references/CODING_STANDARDS.md) before changing implementation.

## Verify and package

Validate the Skill after changing its structure or bundled resources:

```bash
python3 "$SKILL_DIR/scripts/validate_package.py"
```

Install test dependencies and run the complete game gate from the writable project root:

```bash
node scripts/setup.mjs --with-tests
npm run verify:local
```

Use `npm run verify:local -- --full-race` for the full two-lap real-answer race. Use `npm run verify:ci` only on hosts without hardware WebGL; it does not replace local graphical and real-input verification. See [QA.md](references/QA.md) and [REPRODUCE.md](references/REPRODUCE.md) for individual checks and troubleshooting.

## Preserve these invariants

- Support one or two real local players, with no AI racer substituted for a missing player.
- Keep driving automatic and math entry numeric. Each player has independent questions, input, rewards, and results.
- Keep the 3D race above the lower answer area. Do not restore side panels that cover the race or cars.
- Keep the large formula and keypad responsive on desktop and mobile. Keep shared, split, and merged two-player cameras stable as distance changes.
- Keep one copy of the game and its models. Do not add a second template or duplicate `public/models/` to enlarge the package.
- Preserve Meshopt decoding and the existing geometry, materials, textures, and animation. Never trade visible quality or gameplay for a smaller package.
- Update `assets/runtime-manifest.json` after any runtime-resource change. Run resource hashes, production preview, real-input gameplay, desktop/mobile layout, and canvas checks before claiming equivalence.
- Treat source bytes and player-visible output separately: compression changes file bytes, so prove structural and visible equivalence rather than claiming byte identity.

## Load specialist references only when needed

- [ASSET_PIPELINE.md](references/ASSET_PIPELINE.md): model provenance, LOD, integration, and Meshopt workflow.
- [LIGHTWEIGHT.md](references/LIGHTWEIGHT.md): size baseline and lightweight quality gates.
- [AUDIO_PIPELINE.md](references/AUDIO_PIPELINE.md): audio masters, events, looping, and mixing.
- [REPOSITORY_CONTENTS.md](references/REPOSITORY_CONTENTS.md): distributed files versus local-only authoring and QA material.
- [ASSET_LICENSES.md](references/ASSET_LICENSES.md): code, generated-asset, and dependency licensing boundaries.
