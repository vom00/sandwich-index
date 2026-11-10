# Landing redo: research notes (2026-11-10)

Verification level: sources below were read through search summaries or single page fetches. Codrops pages returned 403 to fetch, so their techniques come from search snippets only. Items marked "unverified" were not confirmed.

## 1. What good scroll-driven 3D pages do, and why they fail on phones

Reference sites and the one technique to take from each:
- More Nutrition (Awwwards SOTD, 3 Nov 2025): 3D and motion carry the story, not decoration. Take: every scroll beat reveals one fact. (https://www.awwwards.com/more-nutrition-you-deserve-more.html)
- ToyFight / INK Games (Codrops, Nov 2025): a single shared WebGL canvas behind layered DOM. Take: one canvas, one renderer, for the whole page. (https://tympanus.net/codrops/2025/12/29/2025-a-very-special-year-in-review/)
- "More Than a Portfolio" (Codrops, Apr 2026): Blender-baked lighting and KTX2 textures, GSAP ScrollTrigger driving the camera. Take: bake lighting, do not compute it at runtime. (https://tympanus.net/codrops/2026/04/28/more-than-a-portfolio-building-a-scroll-driven-3d-world-with-something-to-say/)
- "Ten Years Away" (Codrops, Jul 2026): camera moves through panels in a fixed canvas, built with R3F. Take: camera path as authored keyframes indexed by scroll progress. (https://tympanus.net/codrops/2026/07/08/ten-years-away-designing-an-interactive-comic-for-studio375s-tenth-anniversary/)
- Trionn (Codrops, Jul 2026): coordinating GSAP, three.js, Lenis and audio. Take: one clock owns the frame, and every system reads from it. Note it uses Lenis, which we are not adopting. (https://tympanus.net/codrops/2026/07/15/the-architecture-behind-trionn-coordinating-gsap-three-js-lenis-and-web-audio/)
- The Spark (Codrops, Jan 2026): story-first loading. Take: content is readable before the experience boots. (https://tympanus.net/codrops/2026/01/09/the-spark-engineering-an-immersive-story-first-web-experience/)

Phone failure causes with sources:
- Fill rate is the main mobile bottleneck. Cap pixel ratio and avoid post-processing. (https://discourse.threejs.org/t/threejs-is-dropping-frame-when-scrolling-on-mobile/54444, https://salivity.github.io/three.js/article/three-js-mobile-performance-limit-device-pixel-ratio)
- An uncapped render loop hit 170 FPS on a phone in one thread: wasted battery. Same thread, first link above.
- `dvh` elements resize only after scrolling ends and the iOS address bar collapses, causing jank (WebKit bug 266835). A three.js canvas jumps when the address bar toggles. (https://bugs.webkit.org/show_bug.cgi?id=266835, https://discourse.threejs.org/t/three-js-canvas-jumps-on-mobile-when-address-bar-hides-shows-100vh-issue/87435)
- Sticky and pinned sections on iOS Safari: I found no authoritative source. Unverified. Test on a real iPhone.
- Memory growth while scrolling was reported in one old thread with a continuous loop; anecdotal. (https://discourse.threejs.org/t/insane-ram-usage-when-scrolling-around-the-page/24454.md)

Recommendation: one canvas, baked lighting, readable DOM first, size the canvas from `svh`/`lvh` and never from `dvh`, and test sticky behaviour on a physical iPhone.

## 2. Motion vs CSS scroll-driven vs GSAP

- Motion: its docs say scroll-linked animations default to native `ScrollTimeline` "when possible", falling back to JS. The page does not say whether `useScroll`/`useTransform` specifically qualify, nor whether `useSpring` keeps the native path. Assume spring-wrapped values run on the main thread (unverified). Only compositor properties (opacity, transform) are accelerated. (https://motion.dev/docs/react-scroll-animations, https://motion.dev/docs/scroll)
- CSS `animation-timeline: scroll()/view()`: web.dev (Oct 2026) says Chrome 115, Safari 26, Firefox 159 default-on, so Baseline Newly available. iOS Safari is not mentioned by that source, and a web-features page lists iOS as unsupported. Treat iOS as unverified. Safari 26.4 added threaded scroll-driven animations; 26.5 fixed range-name bugs. (https://web.dev/blog/web-platform-10-2026, https://webkit.org/blog/17333/webkit-features-in-safari-26-0/, https://developer.apple.com/documentation/safari-release-notes/safari-26_5-release-notes.md) Older guides saying Firefox lacks it are stale.
- GSAP: now free for commercial use including ScrollTrigger (README and Webflow announcement; exact date reported inconsistently). Size is about 27 KB core, about 50 KB with ScrollTrigger, gzipped, per a competitor's page that cites bundlephobia; confirm with your own build. (https://github.com/greensock/GSAP, https://svg-scroll-draw.vercel.app/vs-gsap)
- Feeding three.js: read scroll once per frame from `window.scrollY`, or a passive `scroll` listener, and normalise to a 0-1 number held in a plain mutable object. The render loop or an on-demand render reads it. No React state. Motion's `scroll(callback)` (vanilla) or `MotionValue.on("change")` also work, but Motion's docs only show `useMotionValueEvent` in React, so the vanilla route is unverified. A plain listener has no dependency and is enough.

Recommendation: CSS scroll-driven animations for DOM reveals, wrapped in `@supports (animation-timeline: view())` with visible content as the default, and Motion for what CSS cannot do. Drive three.js from a plain scroll-progress variable. Skip GSAP; it adds about 50 KB for nothing the stack lacks.

## 3. Vanilla three.js vs React Three Fiber

- R3F v9 pairs with React 19 (v8 with React 18). (https://r3f.docs.pmnd.rs/getting-started/installation, https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide)
- I found no explicit Next 16 test of R3F. Docs suggest `transpilePackages: ["three"]` for Next. Unverified for Next 16.
- A v10 alpha exists, so the API is still moving. (https://newreleases.io/project/npm/@react-three/fiber/release/10.0.0-alpha.6)
- Bundle cost of R3F plus its reconciler: not measured here. It is additive to three.js.
- R3F's `frameloop="demand"` is its on-demand mode. (https://website-h0nc5tb9m-pmndrs.vercel.app/react-three-fiber/advanced/scaling-performance)

Recommendation: stay on vanilla three.js. R3F gives nothing the 1,800 working lines lack, adds a reconciler and a compatibility risk, and the scene is imperative and scroll-driven.

## 4. Smooth-scroll libraries

- Lenis README says it wraps native scroll, so sticky and anchors keep working. Counter-evidence: issue #107 says scrollbar and keyboard scrolling are blocked while a Lenis animation runs; maintainers called it hard to fix. Thoughtworks Radar flags accessibility concerns. (https://github.com/darkroomengineering/lenis/issues/107, https://www.thoughtworks.com/radar/languages-and-frameworks/lenis)
- Motion's docs note a long main-thread task stalls Lenis scroll and every animation linked to it. (https://motion.dev/docs/lenis)
- Common guidance: disable on touch and under reduced motion. Community consensus, not a standard.

Recommendation: your lean is right. Do not use one; with scroll-linked output coming from a progress value, easing the camera inside the render loop gives the same feel without touching input.

## 5. Keeping WebGL out of LCP; pinning the canvas

- Render the LCP element (headline number) as HTML/CSS, then attach WebGL after. Load three through `next/dynamic` with `ssr: false`. That call must sit in a Client Component, not a Server Component. (https://nextjs.org/docs/api-reference/next/dynamic, https://www.hontran.dev/blog/core-web-vitals-for-animation-heavy-sites)
- Gate the import on `requestIdleCallback` (with a `setTimeout` fallback for Safari), plus an `IntersectionObserver` or first scroll/pointer event. No source found that documents this exact combination; it is standard practice. Show a poster image (an inline SVG or a small image) in the same box so layout does not shift.
- Pinning: `position: sticky; top: 0; height: 100svh` inside a tall wrapper is the safest on iOS, because it follows document flow and does not depend on `fixed` behaviour during address-bar changes. `fixed` plus `100lvh` is the alternative. Do not use `dvh` for the canvas (WebKit 266835). This is my judgement from the sources above, not a tested claim.
- Resize the drawing buffer on debounced `resize` only and ignore height changes smaller than the address bar (my suggestion).

Recommendation: HTML headline and poster first, idle-gated dynamic import in a client wrapper, canvas in a sticky `100svh` box.

## 6. GLB delivery

- Draco compresses smaller; Meshopt decodes faster and has a much smaller decoder. One Porsche case study: 1.8 MB Draco vs 1.9 MB Meshopt, with Draco load times varying on iPhone 12 from the large WASM decoder. Blog figures for decoder size ("about ten times larger") are secondary. (https://svilenkovic.com/3d/draco-vs-meshopt, https://jvinhit.github.io/blog/threejs-16-gltf-compression-draco-meshopt-ktx2/)
- No benchmark for models under 100 KB exists in what I found. At that size a decoder can cost more than it saves.
- KTX2 pays off for many or large textures. A flat-colour low-poly scene with vertex colours needs none.
- CSP: Draco and Meshopt decoders use WebAssembly, hence `'wasm-unsafe-eval'` in `script-src`. DRACOLoader builds a `blob:` worker, hence `worker-src 'self' blob:`. Forcing the JS decoder removes the wasm need but still hits blob workers. Self-host decoder files and allow them in `connect-src 'self'`. Source is a three.js forum thread plus PlayCanvas/Babylon forum posts, so verify in your target browsers. (https://discourse.threejs.org/t/how-to-set-content-security-policy-for-usegltfs/51398, https://forum.playcanvas.com/t/compile-error-unsafe-eval/40858, https://forum.babylonjs.com/t/csp-violation-during-ktx2-decoder-load/47937)
- Meshopt requires `await MeshoptDecoder.ready`. (three.js docs)

Recommendation: ship uncompressed (optionally quantised) GLBs, no decoder, no KTX2; if a model grows past about 150 KB, use Meshopt via gltfpack and self-host its decoder.

## 7. Render on demand, DPR, adaptive quality

- Render only when a dirty flag is set; R3F's `frameloop="demand"` is the same idea. (https://website-h0nc5tb9m-pmndrs.vercel.app/react-three-fiber/advanced/scaling-performance)
- Caveat: if the camera eases towards the scroll target, keep rendering until the difference is below epsilon, then stop. Also render during any ambient motion, and pause when the canvas is off screen (IntersectionObserver) or `document.hidden`.
- Cap DPR with `Math.min(devicePixelRatio, 2)`, reapplied on every resize. A lower cap (1.5) is common but I found no source justifying the number. (https://salivity.github.io/three.js/article/limit-three-js-pixel-ratio-for-retina-performance, https://discourse.threejs.org/t/hidpi-fractional-scaling-performance-pitfalls-and-best-practices/87114)
- Adaptive quality (drop DPR when frame time exceeds budget) is common practice but I found no citable source for scroll-specific tuning.

Recommendation: dirty-flag rendering with an easing-settled stop, DPR cap 2 (1.5 on small screens, measured), and a frame-time monitor that steps DPR down.

## Source list
All URLs are inline above.
