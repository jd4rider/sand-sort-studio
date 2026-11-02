# Sand Sort Studio

Pour coloured sand between flasks until every one holds a single colour. Built with Phaser 4, Vite and Electron — playable in the browser and as a desktop app for macOS, Windows and Linux.

- Play in your browser: <https://jd4rider.github.io/sand-sort-studio/play/>
- Downloads: <https://github.com/jd4rider/sand-sort-studio/releases/latest>

## How to play

Tap a flask, then another, to pour its top colour across. You can pour onto an empty flask or the same colour. A flask full of one colour is sealed.

- **Journey** — 60 levels across 5 worlds. Twin flasks (two small chambers), padlocked flasks that open once enough flasks are sealed, and ✨ chameleon sand that changes colour each time it is poured.
- **Rush** — 120 seconds. Every solved puzzle adds time.

Use **Hint**, **Undo** and **Reset** freely.

## Develop

```sh
npm install
npm run dev      # web dev server
npm test         # puzzle logic tests
npm start        # build and open in Electron
npm run dist:mac # package an installer (also dist:win, dist:linux)
```

## Release

Push a tag like `v0.1.0` and the **Release apps** workflow builds the macOS, Windows and Linux installers. Every push to `main` deploys the web version to GitHub Pages.
