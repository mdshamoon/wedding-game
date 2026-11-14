# Shamoon & Alina: The Road to Nikah

A playable 3D story of the wedding, set on the **real roads of Kichha and Baheri**. It runs in any modern browser on phones and laptops, styled to match the [wedding card](https://mdshamoon.github.io/wedding-card/wedding).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. Useful URL flags:
- `?all` unlocks every chapter in the Chapters menu
- `?ch=3` jumps straight into a chapter (0 = Prologue … 7 = Epilogue)

## Chapters

| # | Chapter | Date | Playable |
|---|---|---|---|
| 0 | Prologue: Lucknow to Kichha | 22 Mar | Cinematic: landing at Lucknow airport, Ammi's call, animated road-trip map, aerial swoop over Kichha |
| 1 | Ghar Wapsi | 22 Mar | Pick your car, drive from Kichha town to Darau Chauraha for mithai, then home via Azad Nagar; family welcome; terrace at night |
| 2 | Haldi | 23 Mar | **Haldi Rush**: face relatives to receive haldi, duck the cousins' water buckets |
| 3 | Sehra Bandi & the Baraat | 24 Mar | Choose the look, tie the sehra, then lead the baraat convoy 18.7 km to Blessing Garden (hold F to fast-forward) |
| 4 | Band, Baaja, Ghodi | 24 Mar | **Dhol Rhythm** on the ghodi to the gate; haggle with the bride's sisters |
| 5 | Nikah | 24 Mar | Qubool hai ×3, sign the nikahnama, chhuare shower, joota chupai, rukhsati |
| 6 | Walima | 25 Mar | Night drive with Alina to Grand Heritage; stage **Photo-op** game; fireworks |
| 7 | Epilogue | | An album made of snapshots from *your* playthrough, plus the verse from the card |

## Controls
- **Drive:** W A S D / arrow keys, Space to brake, Shift to boost, H for the horn, F to fast-forward (baraat drive)
- **Map:** M (or tap the minimap / MAP button) opens the full map: drag to pan, scroll or pinch to zoom, switch between Satellite and Map views
- **Garage:** choose Luxury SUV (130–180 km/h), Executive Sedan (137–187 km/h) or Sports Coupe (151–209 km/h), and the paint, before the first drive
- **Dialogue:** click or tap the box, or press Space/Enter
- **Phones:** on-screen joystick and buttons appear automatically

## Changing the story
- All dialogue, names and jokes are in `src/story/script.js`
- Names, dates and venues are in `src/config.js`
- Dialogue avatars are drawn in code (`src/story/avatars.js`). No photos are used anywhere.

## How the real map works
`tools/build_data.py` takes OpenStreetMap roads around the three pins (Home, Blessing Garden, Grand Heritage). It routes the three journeys on the real road graph, then reads satellite imagery to find built-up areas, so the generated houses and shops sit where the real town is. The output goes to `public/data/`. At runtime the ground streams real satellite imagery tiles under your wheels.

To rebuild the data (needs [uv](https://docs.astral.sh/uv/)):

```bash
npm run data
```

## Deploy (GitHub Pages, like the wedding card)

```bash
npm run build
```

Then publish the `dist/` folder, for example by pushing it to a `gh-pages` branch. The build uses relative paths, so it works from any sub-path.

## Credits
- Roads: © OpenStreetMap contributors (ODbL)
- Satellite imagery: © Esri, Maxar, Earthstar Geographics (used for a personal, non-commercial project; the source can be changed in `src/config.js`)
- All 3D models, textures, music and sound are generated in code
