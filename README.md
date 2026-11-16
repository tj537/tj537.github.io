# tj537.github.io

My personal website – not a classic page, but a flight through space.
You sit behind a spaceship and fly from station to station.

**▶︎ [tj537.github.io](https://tj537.github.io/)**

## Stations

1. **Hangar** – who I am: pick a field (Design, Marketing, Web, Code) and its keywords light up in the word cloud orbiting the scene
2. **Projects** – Solarum, Mindful, Toms Tools, Wiggle3DS
3. **About me** – where I come from and what matters to me
4. **Workshop** – Tessera, NotSure, Filmriss
5. **Transmission** – contact & feedback

## Controls

- Scroll, swipe, arrow keys or tap the spaceship → next station
- Dropdown at the bottom left, keys `1`–`5` or the dots on the right → warp straight to a station
- Every station has its own URL (`#projects`, `#about`, …)

## Tech

Plain HTML, CSS and JavaScript with [Three.js](https://threejs.org/) – no build step.
`main.js` runs the flight, `hangar.js` the field picker and word cloud; the keyword lists live in `index.html`.
Without WebGL or JavaScript the page shows all content as a simple list.
Respects "reduce motion". No tracking, no cookies.

Run locally:

```bash
python3 -m http.server 5173
```
