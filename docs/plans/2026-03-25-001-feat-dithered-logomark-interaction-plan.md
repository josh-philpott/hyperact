---
title: "feat: Dithered logomark with mouse repulsion interaction"
type: feat
status: active
date: 2026-03-25
deepened: 2026-03-25
---

# Dithered Logomark with Mouse Repulsion

## Overview

Replace the current CSS-grid Logo component with a canvas-based dithered dot reconstruction of the Hyperact "H" logomark. An invisible circle around the cursor pushes dots outward with cubic falloff — strong at center, gentle at edges. Inspired by Emil Kowalski's Linear dithered logo interaction.

## Problem Frame

The current logomark is a static 56px CSS grid. We want a visually striking, interactive hero element that reconstructs the "H" from thousands of tiny dots (dithered aesthetic) and responds to the cursor with a smooth repulsion effect.

## Requirements Trace

- R1. Render the Hyperact "H" logomark as a dense field of small dots on a canvas
- R2. Dots should have a dithered/stippled appearance (not a uniform grid)
- R3. Invisible circle around cursor displaces dots outward
- R4. Displacement uses cubic falloff: `(1 - dist/radius)^3` — zero force at edge, max at center
- R5. Dots smoothly return to origin when cursor moves away
- R6. Respect the existing color palette (gold `#c9a84c` dots on dark `#141210` background)
- R7. Performant at 60fps on modern hardware
- R8. Retina-aware (devicePixelRatio scaling)

## Scope Boundaries

- Not replacing or modifying SuminagashiBackground — this is a separate component
- Not adding new npm dependencies — vanilla Canvas 2D is sufficient
- Not implementing click waves or wake physics (that's the background's job)
- Dim squares from the "H" pattern (opacity 0.15) should render as sparser/lower-alpha dots, not be omitted

## Context & Research

### Relevant Code and Patterns

- **`src/components/SuminagashiBackground.tsx`** — Component pattern to follow: `useEffect` with cleanup, `useRef<HTMLCanvasElement>`, DPR handling via `Math.min(devicePixelRatio, 2)`, `ResizeObserver`, mouse tracking via `getBoundingClientRect() * dpr`, `requestAnimationFrame` loop with delta-time
- **`src/shaders/suminagashi.ts`** — WebGL utilities (won't reuse directly since we're using Canvas 2D, but the patterns are instructive)
- **`public/favicon.svg`** — The canonical "H" shape: 56x56 SVG with 7 rounded rects (5 solid gold, 2 dim gold)
- **`src/App.tsx:4-30`** — Current `Logo()` component to replace, rendered at line 63 between "Coming soon" label and the `<h1>`
- **`src/index.css`** — Design tokens: `--color-gold: #c9a84c`, `--color-bg: #141210`

### External References

- **Emil Kowalski's tweet** confirming technique: Canvas 2D, dense dots, invisible cursor circle, cubic falloff displacement
- **Ordered dithering with Bayer matrix** for authentic dithered dot placement (vs uniform grid)
- **Maxime Heckel's "Art of Dithering"** — comprehensive guide on dithering techniques for the web
- **Spring/lerp return-to-origin** patterns from particle interaction examples

## Key Technical Decisions

- **Canvas 2D over WebGL:** Emil validated this approach for the Linear logo. For ~2000-4000 dots in a bounded canvas (~300-400px), Canvas 2D with `fillRect` is simpler, sufficient at 60fps, and avoids shader complexity. WebGL would be overkill here.
- **SVG-to-offscreen-canvas sampling:** Load `favicon.svg` as an `Image`, draw to an offscreen canvas at target resolution, sample pixel brightness. This is more flexible than hardcoding rectangle regions and handles edge antialiasing naturally.
- **Bayer ordered dithering for dot placement:** Compare each sample point's brightness against a 4x4 Bayer threshold matrix. This produces the characteristic ordered-dither pattern seen in the reference images — more visually interesting than a uniform grid with opacity variation.
- **Lerp return-to-origin (not spring):** Simpler, no overshoot, matches the clean aesthetic. `pos += (origin - pos) * 0.1` each frame.
- **PointerEvent API over separate mouse/touch:** Use `onPointerMove`/`onPointerLeave` on the canvas element instead of separate mouse and touch handlers. This is the modern unified API covering mouse, touch, and pen. SuminagashiBackground uses legacy `mousemove` on `window`, but since DitheredLogo is a new component, there's no reason to replicate the older pattern.
- **Idle RAF when not interacting:** Unlike SuminagashiBackground (which runs continuously for ambient drift), DitheredLogo only needs to animate when the cursor is nearby or dots are returning to origin. Start the RAF on `pointerenter`, stop it once all dots have settled back to origin. This saves battery on mobile.
- **Event bubbling is desirable — never `stopPropagation`:** Pointer events on DitheredLogo bubble to `window` where SuminagashiBackground picks them up. Both canvases reacting to the same input creates a unified feel. Clicks on the logo will also trigger background wave rings — a nice bonus.

## Open Questions

### Resolved During Planning

- **Canvas 2D vs WebGL?** Canvas 2D — validated by Emil, sufficient for dot count, simpler code.
- **How to generate dot positions?** SVG → offscreen canvas → pixel sampling with Bayer dithering.
- **How big should the logo canvas be?** ~300-400px CSS width, rendered at 2x for retina. This makes the dithered effect clearly visible while fitting the centered layout.
- **What about the dim squares?** The SVG's 0.15-opacity rects will sample as low brightness, so the Bayer threshold will naturally produce sparser dots there. We can also render those dots at lower alpha.

### Deferred to Implementation

- **Exact dot size and grid step:** Start with 3px dots, 4px grid step. Tune with DialKit.
- **Exact repulsion radius and max displacement:** Start with radius ~80px, max displacement ~40px. Tune with DialKit.
- **Lerp speed for return-to-origin:** Start with factor 0.1. Tune with DialKit.
- **Canvas dimensions vs layout:** Exact CSS sizing will depend on how it looks in context.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
INITIALIZATION:
  1. Load favicon.svg as Image
  2. Draw Image to offscreen canvas at sampling resolution (e.g. 100x100)
  3. Read pixel data with getImageData()
  4. For each grid point (step = gridStep):
     - Get brightness from pixel data
     - Compare against Bayer4x4[x%4][y%4] threshold
     - If brightness > threshold → create dot at {originX, originY, alpha}
     - Scale origin positions to match display canvas size
  5. Store dots as flat arrays: originX[], originY[], currentX[], currentY[], alpha[]

EACH FRAME:
  For each dot:
    dx = dot.currentX - mouseX
    dy = dot.currentY - mouseY
    distSq = dx*dx + dy*dy

    if distSq < radiusSq:
      dist = sqrt(distSq)
      t = 1 - dist/radius
      force = t * t * t              // cubic falloff
      angle = atan2(dy, dx)
      targetX = dot.originX + cos(angle) * force * maxDisplacement
      targetY = dot.originY + sin(angle) * force * maxDisplacement
    else:
      targetX = dot.originX
      targetY = dot.originY

    // Lerp toward target
    dot.currentX += (targetX - dot.currentX) * lerpFactor
    dot.currentY += (targetY - dot.currentY) * lerpFactor

  Clear canvas
  For each dot:
    fillRect(dot.currentX, dot.currentY, dotSize, dotSize)  // square dots for dithered look
```

## Implementation Units

- [ ] **Unit 1: DitheredLogo component — dot generation from SVG**

  **Goal:** Create the component shell, load the SVG, sample it into dot positions using Bayer ordered dithering.

  **Requirements:** R1, R2, R6, R8

  **Dependencies:** None

  **Files:**
  - Create: `src/components/DitheredLogo.tsx`

  **Approach:**
  - React component with `useRef<HTMLCanvasElement>` and `useEffect`
  - On mount: create an `Image`, set `src` to `/favicon.svg`, on load draw to offscreen canvas
  - **StrictMode resilience:** App uses `<StrictMode>` (`main.tsx` line 7), which double-mounts in dev. Use a `let cancelled = false` flag in the effect, checked inside the `onload` callback, with cleanup setting `cancelled = true`. This prevents dot generation from running after unmount.
  - Sample at a resolution like 100x100 (the SVG scales cleanly)
  - Apply 4x4 Bayer matrix thresholding against pixel brightness
  - Store dot origins as typed arrays, scaled to display canvas dimensions
  - **Fixed canvas dimensions:** Use fixed pixel size (e.g. 300x300 CSS, 600x600 backing at 2x DPR). No `ResizeObserver` needed — diverges from SuminagashiBackground's pattern intentionally since this is a fixed-size element, not a viewport-filling one.
  - Handle DPR with `Math.min(devicePixelRatio, 2)` following existing pattern
  - Render dots as small filled rectangles (square dots match dithered aesthetic better than circles)
  - Gold color for solid regions, lower-alpha gold for dim regions
  - **Allocate all typed arrays once.** Never allocate per frame — reuse `currentX[]`, `currentY[]` arrays across frames.
  - Add `aria-hidden="true"` to the canvas (matches SuminagashiBackground and current Logo patterns)

  **Patterns to follow:**
  - `SuminagashiBackground.tsx` component structure, DPR handling, cleanup pattern

  **Test scenarios:**
  - SVG loads and dots are generated (visual verification)
  - Dot count is reasonable (~1500-4000 depending on grid step)
  - Retina screens show crisp dots
  - Dots form a recognizable "H" shape
  - Component survives StrictMode double-mount without errors or duplicate dot generation

  **Verification:**
  - Component renders a visible dithered "H" on the canvas with gold dots on dark background

- [ ] **Unit 2: Pointer interaction with cubic falloff and idle RAF**

  **Goal:** Track pointer position (mouse + touch unified) and displace dots within the cursor's invisible circle using cubic falloff. Idle the animation loop when not interacting.

  **Requirements:** R3, R4, R5, R7

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `src/components/DitheredLogo.tsx`

  **Approach:**
  - **Use PointerEvent API** — `onPointerMove`, `onPointerLeave` on the canvas element (not window). This handles mouse, touch, and pen input with a single set of handlers. No need for separate `touchmove` listeners.
  - Convert client coords to canvas coords with `getBoundingClientRect() * dpr`
  - On `onPointerLeave`, set pointer to sentinel position (-9999) so no dots are displaced
  - In the animation loop, for each dot:
    - Check squared distance first (avoid `Math.sqrt` when outside radius)
    - If within radius: compute cubic falloff `t^3`, push radially outward
    - Calculate target position (origin + displacement vector)
    - Lerp current position toward target
  - When pointer is outside or gone, dots lerp back to their origins
  - **Idle RAF optimization:** Start the RAF loop on `onPointerEnter`. On each frame after pointer leaves, check if all dots have settled (max displacement < 0.5px). Once settled, cancel the RAF and render one final static frame. This avoids burning cycles when no one is interacting.
  - **Do NOT call `stopPropagation()`** on any events — let them bubble to `window` so SuminagashiBackground's background particles also react to the same input. This creates a unified interactive feel.
  - **Cleanup:** Cancel RAF, no need to remove event listeners if using JSX props (React handles removal automatically)

  **Patterns to follow:**
  - Sentinel value pattern from `SuminagashiBackground.tsx` (DPR scaling, `-9999` sentinel)
  - Structure-of-arrays layout for positions (parallel Float32Arrays)

  **Test scenarios:**
  - Dots near cursor push outward smoothly
  - Displacement is strongest at cursor center, zero at circle edge
  - Dots return smoothly when cursor moves away
  - No jitter or snapping at the radius boundary
  - Moving cursor quickly doesn't leave artifacts
  - Touch interaction works on mobile (drag finger over logo)
  - Background particles also react when hovering over the logo (event bubbling)
  - RAF loop stops when pointer leaves and dots settle (verify via dev tools Performance tab)

  **Verification:**
  - Interactive: moving cursor/finger over the logo creates a smooth "hole" in the dot field that follows input, with dots flowing back when pointer leaves

- [ ] **Unit 3: Integration into App.tsx and polish**

  **Goal:** Replace the current Logo component with DitheredLogo, adjust layout, and tune interaction parameters.

  **Requirements:** R1-R8

  **Dependencies:** Unit 2

  **Files:**
  - Modify: `src/App.tsx`
  - Modify: `src/components/DitheredLogo.tsx`

  **Approach:**
  - Import `DitheredLogo` in App.tsx, replace `<Logo />` at line 63
  - Size the canvas appropriately in the flex layout (~300-400px wide, square aspect)
  - May need to adjust surrounding spacing/margins
  - Ensure canvas blends with the dark background (transparent or matching `#141210`)
  - Remove the old `Logo()` function from App.tsx if fully replaced
  - Use DialKit (`/interface-craft` skill) to tune: dot size, grid step, repulsion radius, max displacement, lerp speed
  - Visual review via dev server and screenshots

  **Patterns to follow:**
  - Existing layout structure in App.tsx (centered flex column, Tailwind classes)

  **Test scenarios:**
  - Logo is centered and properly sized in the page layout
  - Interaction works over the logo area without interfering with SuminagashiBackground
  - No z-index conflicts between the two canvases
  - Responsive: looks good at different viewport sizes
  - The "H" is clearly recognizable as the Hyperact logomark

  **Verification:**
  - Full page renders correctly with dithered interactive logo replacing the static grid
  - Mouse interaction is smooth and visually polished
  - No regressions to existing page content (form, links, background particles)

## System-Wide Impact

- **Interaction graph:** DitheredLogo captures pointer events on its canvas element via JSX props. SuminagashiBackground listens on `window` via `addEventListener`. Events on DitheredLogo bubble from canvas → `<main>` → `window`, where SuminagashiBackground picks them up. Both components react to the same input — this is intentional and creates a unified feel (hovering the logo also ripples background particles). Clicks on the logo will trigger background wave rings. Never use `stopPropagation()`.
- **Dual RAF loops:** Two independent `requestAnimationFrame` loops are architecturally correct — the browser coalesces all RAF callbacks into the same vsync. Combined per-frame budget: ~3-5ms desktop (12k background particles + ~3k logo dots). DitheredLogo idles its RAF when not interacting, so only one loop runs during most of the page's lifetime.
- **State lifecycle risks:** None — component is self-contained. StrictMode double-mount is handled via cancelled flag on async SVG load. Typed arrays allocated once and reused.
- **Stacking context:** SuminagashiBackground is at `z-index: -10` with `position: fixed`. DitheredLogo sits in normal document flow inside `<main>` at default `z-index: auto`. No conflicts. DitheredLogo should NOT use fixed or absolute positioning.
- **Memory:** Two canvas contexts (one WebGL full-screen, one Canvas 2D ~600x600) plus typed arrays for both systems totals ~550KB — trivial.
- **Accessibility:** DitheredLogo canvas gets `aria-hidden="true"` (decorative), matching the existing Logo's `aria-hidden` and SuminagashiBackground's pattern.

## Risks & Dependencies

- **SVG loading timing:** The offscreen canvas sampling happens in `useEffect` after image load. Mitigation: `let cancelled = false` flag checked in `onload` callback, set to `true` in cleanup. The SVG is local and tiny so loading is near-instant, but StrictMode double-mount requires this guard.
- **Performance with high dot count:** At ~3000 dots with `fillRect` per frame, Canvas 2D handles this easily. Combined with SuminagashiBackground's 12k WebGL particles, total frame budget is ~3-5ms desktop. DitheredLogo idles its RAF when not interacting, so it contributes zero ongoing cost. If dot count grows beyond 10k, consider switching to `ImageData` pixel manipulation or WebGL.
- **Mobile interaction asymmetry:** DitheredLogo uses PointerEvent (works with touch), but SuminagashiBackground only listens for mouse events. On mobile, the logo will respond to touch but background particles won't. This is acceptable — the logo interaction is the focal point. Adding touch to the background is out of scope.
- **Hz-dependent lerp:** Lerp factor of 0.1 per frame behaves slightly differently on 60Hz vs 120Hz displays (faster convergence on 120Hz). At this scale the difference is imperceptible, but if needed later, multiply by `dt * 60` to normalize.

## Refinement Tools

- **DialKit** (`/interface-craft` skill) — Use after initial implementation to expose sliders for: `dotSize`, `gridStep`, `repulsionRadius`, `maxDisplacement`, `lerpSpeed`, `canvasSize`. This allows rapid visual tuning without code changes.
- **Emil Kowalski's animation patterns** — Reference for easing and timing if we want to add entrance animations or hover transitions later.

## Sources & References

- Emil Kowalski tweet: https://x.com/emilkowalski/status/2036778116748542220
- Hamza Ehsan tweet: https://x.com/hxmzaehsan/status/2036027789393166635
- Maxime Heckel — Art of Dithering: https://blog.maximeheckel.com/posts/the-art-of-dithering-and-retro-shading-web/
- Codrops — Interactive Bayer Dithering: https://tympanus.net/codrops/2025/07/30/interactive-webgl-backgrounds-a-quick-guide-to-bayer-dithering/
- Related code: `src/components/SuminagashiBackground.tsx`, `public/favicon.svg`
