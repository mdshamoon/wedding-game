# Dulhe Raja: Road to Shaadi (Kichha Edition)

A 3D browser game set on the real roads of Kichha and Baheri. You play the groom, travelling from
Lucknow Airport to home and through Haldi, Sehra Bandi and Baraat, then the Reception.
It is shareable as a link and plays on phones (touch) and laptops (keyboard).

## Real locations (from the pins)
| Place | Lat, Lon | Role |
|---|---|---|
| Home, Kichha | 28.904844, 79.473051 | Arrival, Haldi (23 Mar), Sehra Bandi (24 Mar) |
| Blessing Garden, Baheri | 28.783289, 79.499353 | Baraat venue (24 Mar), about 14 km south |
| Grand Heritage Resort, Kichha | 28.919324, 79.498894 | Reception (25 Mar), about 3 km NE |
| Kichha town centre (OSM) | 28.910316, 79.518940 | Chapter 1 start point |
| Lucknow Airport → Kichha | ~280 km via Sitapur, Shahjahanpur, Bareilly, Baheri | Prologue (animated map, not driven) |

## How it looks "real"
1. **Ground = live satellite imagery** streamed as tiles around the player (high-res near, low-res far),
   so the actual fields, rooftops, ponds and canals are under your wheels.
2. **Roads = OpenStreetMap geometry** (2,400+ real streets incl. NH9, Nainital Rd, Bareilly Rd, Kichha Bypass),
   rendered as 3D asphalt ribbons with procedural textures, lane markings, kerbs and widths by road class.
3. **Buildings**: OSM has almost none here, so buildings are generated **only where the satellite shows built-up
   area** (a pre-computed built-up mask), lining real streets. They're styled like North-Indian towns:
   painted plaster, flat roofs, water tanks, balconies, shop shutters and signboards.
4. **Life**: poplar and eucalyptus rows along fields, neem and mango trees, electric poles and wires on main roads,
   traffic (trucks, e-rickshaws, bikes), physically based sky, sun and shadows, time of day per chapter, fog and ACES tone mapping.
5. Characters are stylized 3D (built in code): the groom has glasses, a beard and short dark hair, and wears the ivory
   Pathani + yellow dupatta for Haldi. **No photos or external images are used anywhere in the game**; dialogue avatars
   are drawn in code.

## Theme
A Muslim wedding with an **elegant, modern** look: emerald, ivory, gold and blush palette, Mughal-arch frames, subtle
jaali (lattice) patterns, refined serif titles. Dialogue uses Ammi/Abbu and light Urdu-Hindi touches
("Mashallah", "Mubarak ho"). Respectful, no caricature.

## Story and chapter flow (story → play → story)
| # | Date (2027) | Story beats | Playable |
|---|---|---|---|
| Prologue | 22 Mar | Landing at Lucknow Airport (3D cinematic), phone call from Mummy, animated 280 km road-trip map with dhaba chai stop, dusk arrival in Kichha with aerial swoop over the real town | – |
| 1. Ghar Wapsi | 22 Mar, dusk | Mummy calls: "bring mithai!" | **Drive** Kichha centre → mithai shop → Home on real roads, with GPS line, minimap and timer. Arrival cutscene: family at the gate |
| Interlude | 22 Mar, night | Cousins plot Haldi mischief; nervous-groom chat | – |
| 2. Haldi | 23 Mar, morning | Courtyard decorated like the reference (yellow drapes, marigolds, sunflowers, white tassels) | **Haldi Rush**: relatives come from all sides. Face them to receive haldi, duck the cousins' water attacks. The groom slowly turns yellow |
| Interlude | 23 Mar, night | Quiet moment: friend's pep talk | – |
| 3a. Sehra Bandi | 24 Mar, afternoon | Elders tie the sehra, sister applies kala tika | **Get Ready**: pick sherwani, safa and sehra, then a quick-time sehra tying |
| 3b. Baraat drive | 24 Mar, evening | Flower-decked car leads the convoy | **Drive** Home → Baheri (real 14 km route, with a hold-to-fast-forward option) |
| 3c. Ghodi procession | 24 Mar, night | Band baaja, dancing baraatis, fireworks, welcome at the gate | **Dhol Rhythm**: hit the beats to keep the baraat dancing toward the gate |
| 3d. Nikah | 24 Mar, night | Qazi sahab, the families, a quiet graceful moment | **Qubool Hai**: answer three times with gentle timing, then sign the nikahnama by tracing a flourish. **Chhuare shower**: catch the dried dates. **Joota Chupai**: haggle with the bride's sisters to get your shoes back. Doodh pilai |
| Interlude | 24 Mar, late | Rukhsati: emotional send-off; the bride comes home | – |
| 4. Walima / Reception | 25 Mar, night | "Just Married" car, then stage, guests and photographer | **Drive** with the bride to Grand Heritage Resort, then the **Photo-op** timing game with a queue of guests |
| Epilogue | – | Photo album built from snapshots taken during your playthrough, plus thank-you card and credits | – |

All dialogue lives in one editable script file (`src/story/script.js`), so names, jokes and family members are easy to change.

## Tech
- **Three.js + Vite**, vanilla JS modules, no physics engine (arcade car model, 2D collision against buildings).
- **Data pipeline** (`tools/build_data.py`): OSM → local metres (origin = Home, +x east, +z south) →
  `public/data/roads.json` (roads + names + widths), `routes.json` (routed paths via Dijkstra on the road graph),
  `buildings.json` (footprints placed from the built-up mask), `trees.json`.
- **Satellite tiles**: Esri World Imagery (public tile endpoint, attribution shown). Swappable in `src/config.js`
  for Google Map Tiles API or Mapbox if you want to use your own key.
- **Audio**: WebAudio synthesized dhol, shehnai-like lead and ambience (no copyrighted music). Real tracks can
  be dropped in later.
- **Controls**: WASD/arrows + Space/Shift on desktop; on-screen joystick and buttons on mobile.

## Module map
```
src/main.js            renderer, loop, chapter state machine
src/config.js          names, dates, tile source, quality presets
src/geo.js             lat/lon <-> local metres
src/world/             ground tiles, roads, buildings, vegetation, props, sky
src/entities/          Car, Character (groom/relatives), Horse
src/story/             Story engine (dialogue, date cards, fades), script.js (all text)
src/chapters/          prologue, drive, haldi, sehra, baraat, reception, epilogue
src/ui/                HUD, minimap, touch controls
src/audio/             procedural music and SFX
```

## Build order
1. Data pipeline (roads, routes, built-up mask, buildings)
2. Engine core + world rendering (satellite ground, roads, buildings, trees, sky)
3. Car and Chapter 1 drive (first playable)
4. Story engine and prologue
5. Characters, Haldi, Sehra, Baraat (drive, rhythm, varmala), Reception
6. Mobile controls, audio, epilogue album, polish and performance

## Open inputs from you
- Groom's and bride's names (placeholders: "Dulhe Raja" and "Dulhan"), plus family names for dialogue
- Family wording preferences (Mummy/Papa vs Ammi/Abbu, etc.) and any ceremony details to include or avoid
- Optional: bride photo for a portrait avatar, plus inside jokes
