# Shamoon & Alina: The Road to Nikah

A playable 3D story of the wedding, set on the **real roads of Kichha and Baheri**. It runs in any modern browser on phones and laptops, styled to match the [wedding card](https://mdshamoon.github.io/wedding-card/wedding).

**Play it:** https://mdshamoon.github.io/wedding-game/

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
- **Phones:** while driving, slide your left thumb anywhere on the left side to steer (the slider appears where you touch). Hold GAS or BRAKE with your right thumb, and slide between them without lifting. Holding BRAKE when stopped reverses. HORN and BOOST sit above the pedals, and TILT turns on steering by tilting the phone (tap again to re-centre). With no thumb on the slider, a light assist keeps the car lined up with the road. Landscape is best. Add `?touch` to the URL to try these controls on a laptop.

## Changing the story
- All dialogue, names and jokes are in `src/story/script.js`
- Names, dates and venues are in `src/config.js`
- Dialogue avatars are drawn in code (`src/story/avatars.js`). No photos are used anywhere.

## How the real map works
`tools/build_data.py` builds everything in `public/data/` from real data around the three pins (Home, Blessing Garden, Grand Heritage):
- **Roads** come from OpenStreetMap. The three journeys are routed on the real road graph. Divided highways such as NH9 at Darau are detected (two one-way carriageways side by side) and drawn with their real width and a planted median with painted kerbs.
- **Buildings** are the real footprints from [Overture Maps](https://overturemaps.org), which merges Google Open Buildings, Microsoft's ML footprints and OSM, all traced from satellite imagery. About 41,000 houses and shops stand where they really are. Each roof is tinted with the colour sampled from the satellite photo of that roof. Floors are estimated from the neighbourhood (bazaar, town or village), and shopfronts face the street. Gaps in the bazaar frontage where the imagery shows roofs but no outline was traced are filled with row buildings.
- **Street life** (handcarts, parked bikes, kiosks, people, cows, charpais, haystacks) is scattered along the kerbs: dense in Kichha bazaar, sparse in the villages.
- At runtime the ground streams real satellite imagery tiles under your wheels, and buildings are built in 400 m chunks around you.

To rebuild the data (needs [uv](https://docs.astral.sh/uv/); the first run downloads the footprints and roof-colour tiles):

```bash
npm run data
```

## Deploy (GitHub Pages, like the wedding card)

Every push to `main` builds the game and publishes it to https://mdshamoon.github.io/wedding-game/ through `.github/workflows/deploy.yml`. Check `npm run build` locally first if you like. The build uses relative paths, so it works from any sub-path.

## Credits
- Roads: © OpenStreetMap contributors (ODbL)
- Building footprints: Overture Maps Foundation (ODbL), including Google Open Buildings (CC BY 4.0) and Microsoft Global ML Building Footprints (ODbL)
- Satellite imagery: © Esri, Maxar, Earthstar Geographics (used for a personal, non-commercial project; the source can be changed in `src/config.js`)
- All 3D models, textures, music and sound are generated in code
