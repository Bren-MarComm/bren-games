# Bren games

Small, browser-playable games built on Bren School research. Each game is a
folder of static files (HTML, CSS, JavaScript, no build step), so it runs from a
`file://` URL, from any static web server, and from GitHub Pages.

| Game | Folder | Status | One line |
|------|--------|--------|----------|
| The Aquifer | [`aquifer/`](aquifer/) | Playable prototype (2026-10-09) | Keep a valley alive for 20 years without exhausting its groundwater. |

Design notes for the whole series, including the three concepts considered and
the combined architecture, are in [DESIGN.md](DESIGN.md).

## Playing locally

Open `games/aquifer/index.html` in a browser. Nothing to install.

## Hosting on GitHub Pages

This repository is private, and GitHub Pages on a private repository needs a
paid GitHub plan. The clean route is a separate **public** repository that
holds only the `games/` folder. `publish_to_github.sh` does that in one go:

```bash
bash games/publish_to_github.sh Bren-MarComm/bren-games
```

It creates the public repository (if missing), copies `games/` into it, enables
Pages from the `main` branch, and prints the public URL. Re-run it after any
change here to push the new version. Nothing in `games/` contains credentials
or data, so publishing it is safe.

## Checking the simulation without a browser

```bash
node games/aquifer/test_sim.js
```

prints three 20-year playthroughs (do nothing, deepen the farm well, conserve)
so the balance can be eyeballed after any change to `sim.js`.
