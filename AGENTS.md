# FX2 / LAXTHA Web Dashboard Agent Notes

This file is the handoff contract for AI coding agents working in this repository.
Read it before changing code.

## Project Scope

- This repository is the web dashboard only: `laxtha_pro1`.
- Ignore the Android/native app folder outside this repo unless the user explicitly asks for it.
- The product is a Chrome-based real-time FX2 / LAXTHA EEG dashboard using React, TypeScript, Vite, Tailwind CSS, uPlot, Web Serial, and Web Bluetooth.
- Deployment target is Netlify/HTTPS.

## User's Standing Preferences

- When the user asks for a code change, implement it, run verification, commit, and push to `origin/main`.
- Push every completed fix unless the user explicitly says not to push.
- Keep changes small and practical. The user prefers direct fixes over large rewrites.
- Do not require the user to repeat these defaults every time.
- Reply in Korean unless the user asks otherwise.

## Core Product Goals

- Make the dashboard usable for live EEG monitoring with minimal confusion.
- Demo mode should feel predictable: manual demo panel changes must not be overwritten unexpectedly.
- Hardware modes should have clear connection, disconnect, and reconnect paths.
- Chart startup should be empty until real demo/hardware samples arrive. Do not seed fake initial waveform data.
- Keep the UI simple. Avoid duplicate buttons for the same action.
- Theme control should be global, not duplicated inside the chart.

## Do Not Do

- Do not rewrite the whole app.
- Do not replace the chart engine.
- Do not add heavy features such as FFT, spectrograms, replay, IndexedDB storage, trigger controls, or Web Worker refactors unless explicitly requested.
- Do not touch unrelated dirty files.
- Do not revert user or previous-agent changes unless the user explicitly asks.
- Do not modify Android/native app files from this repo's parent workspace unless requested.

## Verification Before Push

Run:

```bash
npm run build
```

If the build fails because of unrelated local dirty work, explain that clearly and only fix it when it is necessary for the requested change.

Before committing, check:

```bash
git status --short --branch
git diff -- <files-you-changed>
```

Commit only the files relevant to the current request. Leave unrelated modified files alone.

## Current Important Behavior

- `createInitialFx2State()` must start chart arrays empty.
- Demo mode uses generated samples only until the user manually changes demo values; manual updates stop the mock feed.
- Live page connection controls are consolidated into the status line:
  - show the disconnect action only when hardware is requesting/connecting/connected
  - show the reconnect action only when hardware is idle/error
- The Live page top action area should not show a separate measurement-end button.
- `EEGChartV2` should not render its own light/dark toggle. Use global theme controls from layout.

## Common Commands

```bash
npm run dev
npm run build
npm run preview
```

## Handoff Style

In final replies, include:

- what changed
- build result
- commit hash
- push status
- any unrelated dirty files left untouched
