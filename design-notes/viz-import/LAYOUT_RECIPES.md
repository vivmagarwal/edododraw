# Geometric recipes for the 62 layouts (working notes, from designer SVG analysis)

Source: visualization_demo-lab/data/layouts/*.svg + contentvars + venn counts. Default reference style is outline line-art: stroke-width 2, fill none, region color = stroke color, ink #484848, item label fs20 in item color, description fs15 ink, captions fs12, number badges fs30-36, icons ~46x46. Title fs25 bold top-center (y~38). Palette wheel10: #4e88e7 #1eabda #3cc583 #92bd39 #e0cb15 #de8431 #e55753 #de58a9 #ba5de5 #7f64ea, gray #a3a3a3.

## Mindmap
- **mindmap / -left / -right** (~790-890x570): root rect (~128x48 fs12 gray) center (left/right = root offset, all branches on one side). Branches (rects 56-133x44 fs12 colored) stacked vertically each side (3+2 split default), each with ~3 children (rects ~58-141x35 fs10 same color) at 36px pitch further out. Connectors: cubic S-curves fanning from one exit point (ink from root; branch color to children). Branch column ~150px from root; child column ~90px beyond; ~146px between branch clusters.
- **mindmap-horizontal** (483x861): root mid-left, 5 branches one column right (x~230), children third column (x~312-337); one big vertical fan connector.
- **mindmap-vertical** (846x666): org-chart. Root center (fs30, rect ~286x94); 3 branches row ABOVE, 2 below; orthogonal T-bus elbow trunks. Each branch = wide card (~260x112-136): colored title fs20 with flanking horizontal rules + ink desc fs15.

## Process
- **flowchart** (339x540): N=4 rounded-rects (h52, w by text) vertical chain, icon 24 + label fs12 inside, single accent color; straight vertical ink arrows (len 70, chevron head). Pitch 114.
- **sequence** (840x612): N=6 boustrophedon (3x2, row 2 reversed). Each step: bracket header ([ ] glyphs 28x106 + top/bottom rules, colored, title fs20 inside) above desc panel (~242x124-142, fs15 ink). Flow arrows between panels: right,right / down / left,left. Pitch 280x234.
- **stairs** (732x414): N=4 ascending steps: open stair outline (tread + left riser, curled tread end), 190 wide, rise 48 (heights 58/106/154/202), colored; icon 46 above tread; label fs20 under tread. Step width net 168.
- **journey** (385x523 portrait): vertical serpentine ribbon road: N=5 U-shaped tube segments (~94 wide, 130-180 tall, stroke-only, color per stage) alternating opening up/down, interlocking. Titles fs12 + desc fs10 alternate above (1,3,5) / below (2,4).
- **cycle** (773x621): N=4 circles (r~66 colored) on ring r~170 + thick swept banana-arrow arcs between (same color), icon 58 inside circles; labels OUTSIDE at diagonal corners (fs20 color + fs15 ink desc; right-aligned left side, left-aligned right side). N=3 triangle same recipe; N>=5 nodes become ink dots r~3 with curved chevron arrows, labels radial.
- **gantt** (884x430): 6 date labels fs15 top; 7 vertical gray gridlines (chart h210); N=4 bars (h35, rounded 8) cascade rows (pitch 45), finish-to-start, colored; task names fs18 left column; dark deadline vline at right + label fs15.

## Data charts
- **bar** (675x474): L axes with arrowheads + axis titles fs20; N=4 bars (w106 gap14) palette colors; value fs15 (bar color) above bar; category fs15 ink below; title fs25 BOTTOM-center.
- **bar-horizontal**: mirror of bar; category = colored circle badge (D60) with icon 34 + fs20 ink label.
- **stacked-bar** (633x789): vertical axes, title fs20+subtitle fs15 top, legend dots top; K series stacked per category.
- **stacked-bar-horizontal** (940x656): 3 rows (h97 pitch 116); 3 abutting segments per row (last rounded right rx8) colored by series; segment values fs15 ink centered; 10 gray v-gridlines + tick labels; row labels fs15 left; axis titles bottom/left; legend dots (D16) + names top.
- **line** (1331x474): axes w/ arrowheads; ink polyline 12 pts (pitch 96); white-filled markers D6 blue-stroked; values fs15 above; months fs15 below; axis captions fs20; title fs25 bottom.
- **area** (725x504): same as line, 6 pts + translucent fill polygon under polyline.
- **waterfall** (750x844): y-axis + 12 gray h-gridlines, ticks 0-550; bars w86 rounded 8: total up (orange), floating decrements (pink), final net (cyan); ink connector polyline across bar tops w/ dot markers; signed values fs15 bold beside bars.
- **gauge** (375x360): thick open annular band (outer r~92, band ~30, sweep ~270deg, gap at bottom) stroke-only accent; highlighted band segment at value; lozenge needle len~50 from center; value fs25 bold center; caption fs20 below.
- **pie** (665x434): pie D~260, N=4 wedge paths (own colors); callouts "NN% Label" fs20 ink + icon 34 (wedge color) outside mid-angle; title fs36 bold top-left.
- **drop-off** (670x389): 3 nested cascade swooshes stepping down-right (curved bands 130x176 -> 106x134 -> 82x92, double outline), each down 42 right 48; labels fs20 + icon 46 around.
- **dumbbell-vertical** (875x648): N=4 rows pitch 120, capsules alternate right/left: stadium outline 326x126 containing dumbbell glyph (2 circles + thick bar), icon 46, delta badge fs20; ink connector (120 + chevron) to text block opposite: label fs20 color + desc fs15 ink.
- **dumbbell-horizontal** (565x753): N=5 rows pitch 120: gray track (stadium 526x36 r18) + colored value bar from left + value bubble tag (98x28 with notch) under right end (fs12 row color); row label fs20 ink above.
- **sankey** (775x827): left K=3 source bars (18x~140 colored) label fs15 bold + value; right M=3 target bars; ribbons = mirrored-cubic closed paths (thickness ~ value, source color, mid = horiz midpoint); pct labels fs15 near right; column captions fs15.

## Timelines
- **timeline** (756x508): horizontal dashed baseline mid-canvas w/ stub ticks; N=4 map-pin pennant flags (~90x123 rounded pennant on stem + end circle) alternating up/down; year fs20 (color) + desc fs15 ink; icon 46 opposite side. Pitch 180.

## Comparison
- **pros-and-cons** (660x426): 2 panels (~298x262, gap 24) green Pros / red Cons: header fs20 + icon 46 top-right, rule (len 202), bullets (ink dot D12 + fs15, pitch 42).
- **table** (809x414): 4x6 grid of individually drawn cell boxes (header row 82 tall, body 58); col 0 ink; each other column all-cells stroked in its own palette color; header fs20, body fs15 ink centered. Col widths fit 105-158.
- **versus** (1034x834): per side: header bar (395x82) name fs30 (side color) + tall inner spine bar (72x586). Center gutter per 3 criteria: icon 46 + name fs20 ink. Each side cell: colored claim fs20 + fs15 ink note. Row pitch 192.
- **balance** (564x469): scale: triangle pedestal (~84x79) on hatched plinth, knob D24 at fulcrum, yoke arms curving out+down, 2 dish pans (72x18) level, left green / right blue. Above each pan 2 item rows (icon 46 + fs20 ink). Pan captions fs20 below. Optional tilt.
- **relationship** (737x493): dashed guide circle D296 gray; dark hub D102 w/ icon; N=8 satellites D49 (palette) ON ring w/ icons 24; labels fs20 radially outside.
- **podium** (576x366): 3 open-outline podium blocks 2-1-3: center 202x154 (yellow), left 190x106 (gray), right 190x58 (red); stair-glyph outlines with curled lip; icon 46 above; rank label fs20 inside top.
- **decision** (742x393): person icon 70 left; stem 120 to question fs20 bold top; 3 rounded elbow branch curves fan to option rows: icon 34 (own color) + title fs20 ink + desc fs15. Pitch 78.
- **spectrum** (597x552): horizontal 3-zone bar (~420x96): left zone left-arrow tail, right zone right-arrow tail, middle rounded box; colored; icon 46 in each; pole captions fs15 above L/R; middle label+desc ABOVE bar, pole blocks BELOW.
- **quadrant** (797x813): two double-headed arrow axes crossing center (no boxes); axis-end captions fs12; per quadrant icon 46 + title fs20 (color), then <=3 bullets fs15 ink pitch 48.
- **venn** (802x678): every region its own closed path: 3 circle-minus-overlap paths (D~240: blue/green/orange), pairwise lens paths (purple/yellow/cyan), center trefoil (ink); icons 46 inside regions; labels fs20 (region color) + desc fs15 ink OUTSIDE perimeter. N=2: two circles + lens. N=4-6: rotated-ellipse flower (~250x190 ellipses at 360/N deg), per-set labels only. N=7: unsupported (cap 6).

## Business frameworks
- **swot** (588x1212): 4 stacked full-width panels (~550x268 pitch 264) green/red/blue/orange: big display letter S/W/O/T (~fs120, panel color) left third; title fs20 + <=4 bullets (dot D12 + fs15, pitch 48) right.
- **pestel** (1116x606): 6 vertical cards (178x442, gap 12) palette colors: big letter top, title fs20, summary fs15 ink, 3 bullets (dot D6 + fs15, pitch 60-78).
- **porters** (895x636): N=6 circles (D96-106, colors) on ring r~115; inward arrow/letter glyph inside; short spokes inward; label fs20 + desc fs15 OUTSIDE at angle.
- **pyramid** (778x624): N=5 trapezoid bands (top = triangle), base 533 -> tip 145, heights 84 (tip 126), colors; big number fs36 inside; labels fs20 right of band staggered. Variant "3d-leaders" (N>=4): front trapezoid + bottom bevel lip; label+desc blocks LEFT with leader lines + end dot; icon 46 on face.
- **bullseye** (636x462): concentric target right-of-center: rings (sample outer D298 annulus orange, inner disc D154 red); flag icons 46 ON rings; label fs20 + desc fs15 stacked LEFT margin w/ leader lines + end dot.
- **funnel** (659x606): N=5 trapezoids narrowing down (312 -> 120 wide, 72 pitch, 82 tall), colored outline; labels fs20 RIGHT with horizontal ink chevron arrows (longer as funnel narrows); input caption fs20 above, output below tip. Variant: curved sides + icon inside.

## Brainstorming / parts of whole
- **key-ideas** (521x414): N=3 lightbulb glyphs (130x130: circle bulb + banded collar + filament fins) in a row, pitch 168, colored; label fs20 centered below + desc fs15 wrapped.
- **list** (233x492): N<=5: vertical: colored circle D60 w/ icon 34 + label fs20 ink right, pitch 84. N>=6: horizontal strip: icon 34 top, label fs20 below, pitch 156.
- **diverge** (871x414): center point under question fs25; 4 thick outlined elbow arrows radiate (2 horizontal w/ tri heads ~113x107, 2 hooks bending down ~102x192), one color each -> option blocks (icon 34 + label fs20 color + desc fs15) at four corners.
- **converge** (737x702): N=4 left inputs (icon 46 + label fs20 color + desc fs15, pitch ~114) -> ink rounded S-elbows converging -> vertical 3-facet convex lens (~106x514 gray) -> right output (icon + label fs20 blue + desc).
- **iceberg** (720x614): right: peak polygon (~243x119 ink) above + underwater body (~262x311 blue, jagged) below a full-width wavy waterline (y~265); left: 3 items (label fs20 colored: above=blue, below=gray/red; desc fs15; icon 46) w/ horizontal leader lines (~140-180) to their depth.

## Problems & solutions
- **problem-solution** (793x450): center circle D178 ink w/ solution fs20; left tile (82x82 yellow, red trend-down icon) + problem fs20 red + desc; right tile (green trend-up) + outcome fs20 green + desc; T-connector below circle to two support captions fs15.
- **transformation** (911x393): central band (~598x157): comb of vertical strokes ragged left smoothing to even right (chaos->order), framed by deck + posts; before label fs20 orange left, after fs20 red right; below: two boxes (262x72 orange/red) w/ small arrow glyph between.
- **challenges** (936x678): two gray cliff platforms bottom L/R (~286x154, ragged inner edge) + gap; N=3 tall rounded arch/hurdle shapes spanning (~298x320, colors, middle taller): number fs30 top, label fs20, desc fs15 inside; platform labels (from/to) + center-bottom action fs30.
- **bridge** (936x612): same skeleton, N=4 plank/pylon shapes arcing (outer 226x276, inner 220x333); same data + action. Implement challenges/bridge as one generator (variant hurdles|planks).

## Visual metaphors
- **vision** (722x576): stairs-to-door: door frame 140x202 + open yellow leaf (perspective) + knob + red figure; 5-6 step perspective staircase ascending to door (step indent 36); ground line left; current fs20 orange + caption left, vision fs20 yellow + caption upper right.
- **impact** (774x641): cause circle D178 yellow bottom-center (label inside); N=3 effect circles (D84-98 w/ number fs30 + satellite dot) in arc above; curved ink stems; labels fs20 + desc fs15 beside each.
- **performance** (672x558): N=3 panels (202x322): title fs20 color, desc fs15, donut gauge (D~150 colored arc sweep ~ value + gray remainder, icon 68 in hole), value fs25 bold below; summary fs20 under all.
- **bottleneck** (579x282): horizontal bottle outline (538x130): wide chamber narrowing to right neck; ~20 small circles D10 cyan crowding inside, few escaping; 3 in-arrows left, 1 out-arrow right.
- **hole** (672x489): ground cross-section (~607x270): surface w/ rectangular pit (ragged), grass tufts (green), orange ladder (2 rails + rungs 26x113) descending; title only.
- **trend** (620x786): tall ascending staircase (4 flights of step-teeth) bottom-left -> top-right; per level horizontal leader + end dot (level color) to text block alternating sides: icon 46 above label fs20 + desc fs15.
- **race** (494x331): horizontal track line w/ right arrowhead; finish gate right (2 posts + FINISH banner fs20); 2 hand-drawn karts (~89x48, colors; leader at line, rival behind) w/ wheel circles; labels fs20 below cars.
- **dialogue** (562x658): chat transcript: alternating bubbles A (yellow, left x~108, ~225-282 x 58-70) / B (orange, indented x~146, ~280-300 x 88), 3 pairs, pitch ~145; fs15 ink text; two bust portraits (~70x90, hair in speaker color) bottom corners.
- **lens** (745x540): converge with N=3 inputs, same lens glyph (106x376) -> output. One generator w/ converge.
- **prism** (794x486): triangular prism (front triangle 216x190 + parallelogram side, gray) center-left; input node (72x72 rounded sq + icon) + label left, beam line in; N=4 out beams w/ arrowheads fanning to rounded-sq nodes (70x70, colors, icons) stacked right (pitch 84) + labels fs20.
- **pillar** (792x534): N=4 classical columns (178x370: capital + fluted shaft + base), colors, pitch 192; inside shaft stacked: icon 46, label fs20 ink, desc fs15 wrapped.
- **root-causes** (814x742): tree: lumpy cloud canopy (~300x250 ink) + trunk w/ root flare (~245x332); problem = title; N=3 causes around base (L/R/bottom): label fs20 (color) + desc fs15, ink elbow leaders to trunk/roots.

## Cross-cutting
1. Illustrative-needing-glyphs: iceberg, hole, race, vision, trend, bridge/challenges, balance, bottleneck, transformation, root-causes, journey. Each <=3 bespoke path glyphs.
2. Count adaptation: cycle big-nodes N<=4 else dots-on-ring; list vertical<=5 else horizontal; pyramid flat vs 3d-leaders; venn 2-3 true venn, 4-6 ellipse flower, cap 6.
3. Reference style is outline-stroke; other presets change fill/stroke via roleStyle.
4. Shared primitives: chevron-arrow line, elbow connector, leader line + end dot, trapezoid band, annular arc, sankey ribbon, stadium bar, bracket glyph, stair-step glyph, label+desc text block.
