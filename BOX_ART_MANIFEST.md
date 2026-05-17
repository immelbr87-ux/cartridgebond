# Box Art Manifest — 28 Images You Need to Add

The value pages now display Nintendo Switch box art. I can't fetch these images myself (sandbox firewall blocks all image hosts), so you need to drop 28 image files into `/images/games/` before or after uploading.

**If you skip this:** pages still work fine. They show a clean text fallback (game title on a soft green gradient) instead of a broken image. So this is enhancement, not blocker — but box art looks much better.

## What to do

1. For each game below, find the official box art (Google "[game name] switch box art", or grab from Wikipedia, Amazon, Nintendo.com)
2. Save it as a **.jpg**, roughly portrait orientation (3:4 ratio ideal, ~600x800px)
3. Name it **exactly** as shown in the "Filename" column
4. Put all 28 in the `images/games/` folder in your repo

Filenames are lowercase, hyphenated, must match exactly (case-sensitive on GitHub Pages).

## The 28 files

| Game | Filename |
|---|---|
| Mario Kart 8 Deluxe | `mario-kart-8-deluxe.jpg` |
| Zelda: Tears of the Kingdom | `zelda-tears-of-the-kingdom.jpg` |
| Zelda: Breath of the Wild | `zelda-breath-of-the-wild.jpg` |
| Super Smash Bros. Ultimate | `super-smash-bros-ultimate.jpg` |
| Super Mario Odyssey | `super-mario-odyssey.jpg` |
| Super Mario Bros. Wonder | `super-mario-bros-wonder.jpg` |
| Super Mario 3D World + Bowser's Fury | `super-mario-3d-world-bowsers-fury.jpg` |
| Super Mario Party Jamboree | `super-mario-party-jamboree.jpg` |
| Mario Party Superstars | `mario-party-superstars.jpg` |
| Animal Crossing: New Horizons | `animal-crossing-new-horizons.jpg` |
| Pokemon Scarlet | `pokemon-scarlet.jpg` |
| Pokemon Violet | `pokemon-violet.jpg` |
| Pokemon Sword | `pokemon-sword.jpg` |
| Pokemon Shield | `pokemon-shield.jpg` |
| Pokemon Legends: Arceus | `pokemon-legends-arceus.jpg` |
| Pokemon Legends: Z-A | `pokemon-legends-z-a.jpg` |
| Pokemon Brilliant Diamond | `pokemon-brilliant-diamond.jpg` |
| Pokemon Shining Pearl | `pokemon-shining-pearl.jpg` |
| Splatoon 3 | `splatoon-3.jpg` |
| Splatoon 2 | `splatoon-2.jpg` |
| Luigi's Mansion 3 | `luigis-mansion-3.jpg` |
| Kirby and the Forgotten Land | `kirby-and-the-forgotten-land.jpg` |
| Metroid Dread | `metroid-dread.jpg` |
| Metroid Prime 4: Beyond | `metroid-prime-4-beyond.jpg` |
| Donkey Kong Country: Tropical Freeze | `donkey-kong-country-tropical-freeze.jpg` |
| Mario + Rabbids Sparks of Hope | `mario-rabbids-sparks-of-hope.jpg` |
| Fire Emblem Engage | `fire-emblem-engage.jpg` |
| Minecraft (Switch) | `minecraft-switch.jpg` |

## Where these images appear

- **Value pages (28):** Box art next to the price card. This is the main place.
- **5 blog posts** also use box art (reusing the same files):
  - mario-kart-8-resale-value.html → uses `mario-kart-8-deluxe.jpg`
  - zelda-totk-resale-value.html → uses `zelda-tears-of-the-kingdom.jpg`
  - smash-bros-ultimate-resale-value.html → uses `super-smash-bros-ultimate.jpg`
  - pokemon-scarlet-violet-resale-value.html → uses `pokemon-scarlet.jpg`
  - animal-crossing-resale-value.html → uses `animal-crossing-new-horizons.jpg`

So sourcing the 28 covers all the box-art slots site-wide.

## Fastest way to do this

1. Open a Google Image search tab
2. Search "mario kart 8 deluxe nintendo switch box art"
3. Click a clean front-cover image (the standard red Switch case art)
4. Right-click → Save Image As → name it `mario-kart-8-deluxe.jpg`
5. Repeat. ~30 seconds each, ~15 minutes total for all 28.

Box art for editorial/informational use (showing what game a page is about) is standard practice for every gaming/price site. Low risk. Just don't modify the art or use it in paid ads.

## Quality tips

- Front cover only, not spine/back
- Avoid watermarked images (PriceCharting, eBay watermarks)
- Roughly portrait. The CSS crops to 3:4 with object-fit:cover so slight ratio differences are fine
- ~600x800px is plenty. Don't use 4000px images — wastes load time
- Keep total folder under ~6MB (≈200KB per image)
