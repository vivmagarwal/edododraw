# Style tokens reverse-engineered from visualization_demo-lab (working notes)

Implemented in `src/engine/style/presets.ts`. Source SVGs: `visualization_demo-lab/data/{styles,vennstyles,layoutstyles}`.

## Global conventions
- Title ~25px bold centered near top (bold-canvas 30px, lively-layers 22.5px). Headings 18-20px, body 13.5-15px, fine print 10.5-12px.
- No drop shadows/filters/blurs anywhere. Gradients only in pragmatic-shades.
- Icons: round-cap line icons, stroke-width 2 (1 in hairline styles), ink or series color.
- Dashes only on connectors/reference lines: `10,14` artistic-flair; `2.5,3.5` bold-canvas/elegant-outline/lively-layers/monochrome-pro/subtle-accent; `5,7` others.
- Two palette architectures: (a) multi-hue wheel; (b) single-accent opacity ramp (n series -> opacities evenly spaced ending 1.0, e.g. 0.47/0.73/1.0).
- Neutral "other" series color: #a3a3a3 almost everywhere.
- Seam styles: shape stroke == canvas background color (cut-out look): bold-canvas, carefree-mist, corporate-clean, lively-layers, minimal-contrast, monochrome-pro, radiant-blocks, subtle-accent.

## Tokens per style
- **vibrant-strokes** (light): bg #ffffff; wheel [#e0cb15 #de8431 #e55753 #de58a9 #ba5de5 #7f64ea #4e88e7 #1eabda #3cc583 #92bd39]; outline-only; structure #484848 @2px, accents in palette; Roboto; ink #484848.
- **glowful-breeze** (light): same wheel; fill = series color @ 0.2 opacity + same-hue 2px stroke; Roboto; ink #484848; pale chips #fff2e5/#e8f9ff/#ffebf7.
- **bold-canvas** (dark): bg #121d46; neon wheel [#e3ef3a #b6e233 #80e876 #50eebf #4edaed #76b7f5 #ae89f8 #da67f1 #f56099 #fdb461] + #f0faff; solid fills; 1px seam strokes; headings Fredoka 500 bold 20px (title 30px), body Roboto 13.5px; text on canvas #f0faff, inside shapes #121d46.
- **radiant-blocks** (dark): bg #2f333a; warm wheel [#e3c451 #ceb567 #e98a54 #e66b68 #d85582 #bc529a #9856b3 #8864ba #957aa9 #b09989]; solid; 2px seam; Libre Baskerville serif everywhere; on canvas #ffffff, inside blocks #2f333a; 0.1-opacity tints for zones.
- **pragmatic-shades** (light): bg #cfdfcb; vertical gradient fills lighter->darker: yellow #e4e495->#cbcb63, lime #bfd284->#adc26c, green #b0d1a6->#8cb57f, mint #aad5be->#84b99d, teal #85bfba->#84beb9, blue #adcae2->#83aac9, steel #b6c9d6->#8fa8b9, khaki #dfcda5->#c1a974, tan #d4cab2->#b4a687, gray #c8c8c8->#a3a3a3; constant ink stroke #2f3c3e @2px; body Roboto, title STIX Two Text.
- **carefree-mist** (light): bg #eeead7; dusty wheel [#f97b4f #ff964e #e08666 #bc9d8b #fcbc66 #e3c47c #beca9b #9ccbb5 #9bb6ae #8dc6bf]; solid; 2px seam; headings Shantell Sans bold, body Roboto; ink #584053.
- **lively-layers** (light): bg #fdfbf7; earthy wheel [#e16338 #cc6b49 #ab7b64 #db9941 #bfa258 #96aa79 #898f81 #71af96 #61aca2 #6da198]; pale companion tints (#ffddd2 #f8e2d8 #ffe7c7 #f7eac8 #dfe9d1 #e2e5de #d6efe5 #d4eae6 #cfede9, base #ede5d4); layered fill = pale tint container + solid accent; 4px seam strokes; Montserrat only; ink #584053; title 22.5px, headings 18px.
- **artistic-flair** (light): bg #f4eee4; muted wheel [#cd6952 #ba6b72 #db8c4c #cabe51 #a3c464 #7ec27c #7eb7ad #829cbd #8d7fba #a1739c]; fill 0.5 opacity painted brush-dab texture; ink #402019 @4px wobbly outlines (2px icons/lines); Shantell Sans; hand-drawn.
- **sketch-notes** (dark): bg #195e98 chalkboard; chalk #dfe7ee strokes @2px wobbly, mostly no fill (rare 0.5 chalk washes #f1f5f9); Shantell Sans; all text #dfe7ee.
- **elegant-outline** (light): bg #ffffff; black only #000000 @1px; gray #a3a3a3 secondary; rare spot accents #4f92ff/#ffe60a/#f99539; no fill; Roboto; headings bold 15px = body size (weight-only hierarchy).
- **subtle-accent** (light): bg #f3f7f5; single accent #c1d8d4 + ink #22403b; solid fills; 1px seam; everything BOLD 15px; headings Roboto Slab, body Roboto.
- **monochrome-pro** (dark): bg #564f64; single tone #f1e9e9 with opacity ramp (0.47/0.7/0.73/0.8/1.0); 1px seam; headings Aboreto, body Noto Serif JP 13.5px; inside cream shapes text #564f64.
- **corporate-clean** (light): bg #e7e8e6; accent #debe64 ramp (0.33..1.0); ink #494b45; 2px seam; body Roboto 13.5, headings Roboto Slab 18, title Source Code Pro 25 bold.
- **minimal-contrast** (dark): bg #1a1536; accent #7e56ff ramp (0.33..1.0, zones 0.03-0.1); #ffffff icons/lines @2px; 2px seam; Funnel Display (300 body / 600 headings); text #ffffff.
- **silver-beam** (light): bg #ffffff; grayscale #2f2f33 (+0.33/0.47/0.6 ramp) + silver #d5dcd7 + accent #dd7758 terracotta for the focal element; #ffffff 2px seams; headings STIX Two Text bold, body Roboto; text #2f2f33 / #d5dcd7 on dark / accent #dd7758.
