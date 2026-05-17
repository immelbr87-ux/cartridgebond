# Full Repo Rebuild — Deploy Guide

This is the corrected version. The bad SVG illustrations are GONE.

## What changed from what's currently live

### The cheap SVG illustrations are removed everywhere
- **Blog posts (25):** No illustrations. Premium typography-only layout - big bold headlines, generous whitespace, like Stripe/Linear/Vercel. 5 game-specific posts (Mario Kart, Zelda TOTK, Smash, Pokemon Scarlet, Animal Crossing) show real box art instead.
- **Blog index:** Typography-first. No thumbnail images on cards - clean text cards with category eyebrows.
- **Value pages (28):** Real Nintendo Switch box art beside the price card (you provide the images - see BOX_ART_MANIFEST.md). Clean fallback if image missing.
- **prices.html:** SVG hero removed. Clean typographic header.

### Bugs fixed
- **Empty grey rectangle** (the tall bar bleeding off-screen on mobile): was caused by a `margin:0 -1000px` full-bleed hack on all 28 value pages. Replaced with a proper non-overflowing full-bleed technique.
- **Dark CTA button contrast** (the barely-visible "Buy [Game] at $X" button against the dark green panel): bumped border + background opacity so it's clearly visible.

### Carried forward (unchanged from prior phases)
- index.html: Amazon-style mock + Chrome extension language (tested fine, kept as-is)
- 9 internal pages: Sign-in link removed, 4-column footer with Popular Game Values
- sitemap.xml: 62 URLs

## Deploy: one drag-and-drop

1. Download `cartridgebond_FULL_REPO.zip`
2. Unzip
3. **Source the 28 box art images** (see BOX_ART_MANIFEST.md) and drop them in the unzipped `images/games/` folder. ~15 min. Optional - site works without them, just less visual.
4. Go to your GitHub repo, Add file -> Upload files
5. Select ALL contents of the unzipped folder (including the `images/` folder) and drag in
6. Confirm overwrites
7. Commit: "Rebuild: remove SVGs, box art on value pages, typography blog, bug fixes"
8. Push, wait 2-3 min

## Test after deploy

1. **cartridgebond.com/blog/** - clean typographic blog, no cheap illustrations, big headlines
2. **cartridgebond.com/blog/what-is-precommerce.html** - typography-only post, no SVG, simplified bio
3. **cartridgebond.com/blog/mario-kart-8-resale-value.html** - has Mario Kart box art (if you added the image)
4. **cartridgebond.com/value/mario-kart-8-deluxe.html** - box art beside price card, no grey rectangle bleeding off-screen, "Buy" button clearly visible in the dark CTA panel
5. **cartridgebond.com/prices.html** - clean header, no SVG, no empty box
6. Scroll every value page to the bottom on mobile - the grey rectangle bug should be gone

## If box art images are missing

Pages still render fine. Where a box art would be, you'll see a soft green gradient panel with the game title in mono uppercase. Looks intentional, not broken. Add the images whenever; they'll appear on next deploy.

## Honest note

This is the third major revision of the imagery approach. The lesson learned: parametric SVG illustration looks amateur at this scale - real photography/box art or clean typography are the only two paths that read as premium. We're now on box-art-where-it-matters + typography-everywhere-else, which is the right call and matches how real gaming/price sites look.
