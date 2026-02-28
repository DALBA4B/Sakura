(() => {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    let W, H;

    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    // --- Stars (static offscreen canvas + few twinklers) ---
    let starsCanvas = null;
    const twinkleStars = [];

    function createStars() {
        starsCanvas = document.createElement('canvas');
        starsCanvas.width = W;
        starsCanvas.height = H;
        const sc = starsCanvas.getContext('2d');

        twinkleStars.length = 0;
        const count = Math.floor((W * H) / 6000);
        for (let i = 0; i < count; i++) {
            const x = Math.random() * W;
            const y = Math.random() * H * 0.7;
            const r = Math.random() * 1.5 + 0.3;
            const a = 0.5 + Math.random() * 0.5;
            if (Math.random() < 0.12) {
                twinkleStars.push({ x, y, r, a, spd: Math.random() * 0.003 + 0.001, off: Math.random() * 6.28 });
            } else {
                sc.beginPath();
                sc.arc(x, y, r, 0, 6.28);
                sc.fillStyle = `rgba(255,255,240,${a.toFixed(2)})`;
                sc.fill();
            }
        }
    }
    createStars();
    window.addEventListener('resize', createStars);

    function drawStars(time) {
        const na = getNightAlpha(dayPhase);
        if (na < 0.01) return;
        ctx.globalAlpha = na;
        ctx.drawImage(starsCanvas, 0, 0);
        for (const s of twinkleStars) {
            const w = Math.sin(time * s.spd + s.off);
            const dim = w > 0.7 ? (w - 0.7) / 0.3 : 0;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, 6.28);
            ctx.fillStyle = `rgba(255,255,240,${(s.a * (1 - dim * 0.6)).toFixed(2)})`;
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // --- Day/Night Cycle ---
    // Full cycle: 5 minutes (300 sec). Phases blend smoothly.
    const DAY_CYCLE_DURATION = 300000; // ms
    let dayPhase = Math.random(); // random start time of day

    // Sky color keyframes: [phase, topColor, bottomColor]
    // 0.0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk
    const skyKeys = [
        { p: 0.00, top: [5,5,26],     mid1: [10,10,46],  mid2: [16,16,53],  bot: [26,16,64]   }, // midnight
        { p: 0.15, top: [5,5,26],     mid1: [10,10,46],  mid2: [16,16,53],  bot: [26,16,64]   }, // late night
        { p: 0.22, top: [15,10,40],   mid1: [40,20,60],  mid2: [80,40,70],  bot: [120,60,70]  }, // pre-dawn
        { p: 0.30, top: [40,30,80],   mid1: [120,70,100], mid2: [200,120,100], bot: [220,150,100] }, // dawn
        { p: 0.38, top: [80,140,220], mid1: [120,180,240], mid2: [150,200,245], bot: [180,215,245] }, // morning
        { p: 0.50, top: [100,170,240], mid1: [140,200,250], mid2: [170,215,250], bot: [200,225,248] }, // noon
        { p: 0.62, top: [80,140,220], mid1: [120,180,240], mid2: [150,200,245], bot: [180,215,245] }, // afternoon
        { p: 0.70, top: [40,30,80],   mid1: [120,60,80],  mid2: [180,80,60],  bot: [200,100,60] }, // dusk
        { p: 0.78, top: [15,10,40],   mid1: [40,20,60],  mid2: [60,30,60],  bot: [80,40,60]   }, // twilight
        { p: 0.85, top: [5,5,26],     mid1: [10,10,46],  mid2: [16,16,53],  bot: [26,16,64]   }, // night
        { p: 1.00, top: [5,5,26],     mid1: [10,10,46],  mid2: [16,16,53],  bot: [26,16,64]   }, // midnight (wrap)
    ];

    function lerpColor(a, b, t) {
        return [
            Math.round(a[0] + (b[0] - a[0]) * t),
            Math.round(a[1] + (b[1] - a[1]) * t),
            Math.round(a[2] + (b[2] - a[2]) * t),
        ];
    }

    function getSkyColors(phase) {
        let i = 0;
        for (; i < skyKeys.length - 1; i++) {
            if (phase <= skyKeys[i + 1].p) break;
        }
        const a = skyKeys[i], b = skyKeys[i + 1];
        const t = (phase - a.p) / (b.p - a.p);
        return {
            top:  lerpColor(a.top,  b.top,  t),
            mid1: lerpColor(a.mid1, b.mid1, t),
            mid2: lerpColor(a.mid2, b.mid2, t),
            bot:  lerpColor(a.bot,  b.bot,  t),
        };
    }

    // How visible are night elements (stars, moon): 1 at night, 0 at day
    function getNightAlpha(phase) {
        // Fully visible 0.0-0.18 and 0.82-1.0 (night)
        // Fully hidden 0.35-0.65 (day)
        // Smooth transition in between
        if (phase < 0.18) return 1;
        if (phase < 0.35) return 1 - (phase - 0.18) / 0.17;
        if (phase < 0.65) return 0;
        if (phase < 0.82) return (phase - 0.65) / 0.17;
        return 1;
    }

    // --- Moon & Sun arc movement ---
    let arcSeed = Math.random();
    let lastCycleIndex = -1;

    // Shared position state (computed once per frame, used by sky + draw)
    let sunPos = null, sunFade = 0, sunT = 0;
    let moonPos = null, moonFade = 0, moonT = 0;

    function arcPosition(t, peakY) {
        const x = W * (-0.08 + t * 1.16);
        const arc = -4 * (t - 0.5) * (t - 0.5) + 1;
        const groundY = H * 0.92;
        const y = groundY - arc * (groundY - peakY);
        return { x, y };
    }

    function horizonFade(t) {
        if (t < 0.12) { const k = t / 0.12; return k * k * (3 - 2 * k); }
        if (t > 0.88) { const k = (1 - t) / 0.12; return k * k * (3 - 2 * k); }
        return 1;
    }

    function updateCelestialPositions() {
        // Sun: phase 0.22→0.78
        const sunStart = 0.22, sunEnd = 0.78;
        if (dayPhase >= sunStart && dayPhase <= sunEnd) {
            sunT = (dayPhase - sunStart) / (sunEnd - sunStart);
            sunFade = horizonFade(sunT);
            sunPos = arcPosition(sunT, H * (0.08 + (1 - arcSeed) * 0.07));
        } else {
            sunPos = null; sunFade = 0; sunT = 0;
        }

        // Moon: phase 0.82→1.0→0.18
        const na = getNightAlpha(dayPhase);
        if (na > 0.01) {
            let mt;
            if (dayPhase >= 0.82) mt = (dayPhase - 0.82) / 0.36;
            else if (dayPhase <= 0.18) mt = (dayPhase + 0.18) / 0.36;
            else { moonPos = null; moonFade = 0; moonT = 0; return; }
            moonT = Math.max(0, Math.min(1, mt));
            moonFade = na * horizonFade(moonT);
            moonPos = arcPosition(moonT, H * (0.06 + arcSeed * 0.08));
        } else {
            moonPos = null; moonFade = 0; moonT = 0;
        }
    }

    function drawSky() {
        const c = getSkyColors(dayPhase);
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0,   `rgb(${c.top[0]},${c.top[1]},${c.top[2]})`);
        g.addColorStop(0.4, `rgb(${c.mid1[0]},${c.mid1[1]},${c.mid1[2]})`);
        g.addColorStop(0.7, `rgb(${c.mid2[0]},${c.mid2[1]},${c.mid2[2]})`);
        g.addColorStop(1,   `rgb(${c.bot[0]},${c.bot[1]},${c.bot[2]})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }

    // Directional light that paints the sky FROM the sun/moon position
    function drawSkyLight() {
        // Sun glow on sky — localized around the sun
        if (sunPos && sunFade > 0.01) {
            const heightRatio = 1 - sunPos.y / (H * 0.92); // 0 at horizon, 1 at top
            const warmth = 1 - heightRatio; // 1=near horizon, 0=high

            // Layer 1: localized radial glow around sun
            const r = Math.max(W, H) * (0.35 + warmth * 0.25);
            const wash = ctx.createRadialGradient(sunPos.x, sunPos.y, 0, sunPos.x, sunPos.y, r);
            const wr = 255;
            const wg = Math.round(180 + heightRatio * 50);
            const wb = Math.round(100 + heightRatio * 80);
            wash.addColorStop(0, `rgba(${wr},${wg},${wb},${(0.25 * sunFade * (0.4 + warmth * 0.6)).toFixed(3)})`);
            wash.addColorStop(0.15, `rgba(${wr},${wg - 10},${wb - 15},${(0.15 * sunFade * (0.3 + warmth * 0.7)).toFixed(3)})`);
            wash.addColorStop(0.4, `rgba(255,${wg - 30},${wb - 40},${(0.04 * sunFade).toFixed(3)})`);
            wash.addColorStop(0.7, `rgba(255,${wg - 40},${wb - 50},${(0.008 * sunFade).toFixed(3)})`);
            wash.addColorStop(1, 'rgba(255,150,80,0)');
            ctx.beginPath(); ctx.arc(sunPos.x, sunPos.y, r, 0, 6.28);
            ctx.fillStyle = wash; ctx.fill();

            // Layer 2: pink horizon band near sunrise/sunset — smaller and tighter
            if (warmth > 0.3) {
                const bandY = H * 0.78;
                const bandR = W * 0.3;
                const band = ctx.createRadialGradient(sunPos.x, bandY, 0, sunPos.x, bandY, bandR);
                const ba = sunFade * warmth * 0.12;
                band.addColorStop(0, `rgba(255,140,120,${ba.toFixed(3)})`);
                band.addColorStop(0.35, `rgba(255,120,140,${(ba * 0.3).toFixed(3)})`);
                band.addColorStop(1, 'rgba(255,100,130,0)');
                ctx.beginPath(); ctx.arc(sunPos.x, bandY, bandR, 0, 6.28);
                ctx.fillStyle = band; ctx.fill();
            }
        }

        // Moon glow on sky — subtle, cold
        if (moonPos && moonFade > 0.01) {
            const r = Math.max(W, H) * 0.7;
            const wash = ctx.createRadialGradient(moonPos.x, moonPos.y, 0, moonPos.x, moonPos.y, r);
            wash.addColorStop(0, `rgba(140,170,220,${(0.07 * moonFade).toFixed(3)})`);
            wash.addColorStop(0.3, `rgba(120,150,200,${(0.03 * moonFade).toFixed(3)})`);
            wash.addColorStop(0.7, `rgba(100,130,180,${(0.01 * moonFade).toFixed(3)})`);
            wash.addColorStop(1, 'rgba(80,110,160,0)');
            ctx.beginPath(); ctx.arc(moonPos.x, moonPos.y, r, 0, 6.28);
            ctx.fillStyle = wash; ctx.fill();
        }
    }

    function drawMoon() {
        if (!moonPos || moonFade < 0.005) return;
        const mr = Math.min(W, H) * 0.045;
        const fade = moonFade;

        // Inner silver-blue glow
        const glow = ctx.createRadialGradient(moonPos.x, moonPos.y, mr * 0.5, moonPos.x, moonPos.y, mr * 5);
        glow.addColorStop(0, `rgba(200,215,245,${(0.18 * fade).toFixed(3)})`);
        glow.addColorStop(0.4, `rgba(170,195,235,${(0.06 * fade).toFixed(3)})`);
        glow.addColorStop(1, 'rgba(150,175,220,0)');
        ctx.beginPath(); ctx.arc(moonPos.x, moonPos.y, mr * 5, 0, 6.28);
        ctx.fillStyle = glow; ctx.fill();

        // Moon disc
        ctx.globalAlpha = fade;
        ctx.beginPath(); ctx.arc(moonPos.x, moonPos.y, mr, 0, 6.28);
        const mg = ctx.createRadialGradient(
            moonPos.x - mr * 0.35, moonPos.y - mr * 0.35, 0,
            moonPos.x + mr * 0.1, moonPos.y + mr * 0.1, mr
        );
        mg.addColorStop(0, '#eef3ff');
        mg.addColorStop(0.4, '#dde8f8');
        mg.addColorStop(0.7, '#c8d8f0');
        mg.addColorStop(1, '#a0b8d8');
        ctx.fillStyle = mg; ctx.fill();

        // Crater shadows
        const craters = [[0.2, -0.3, 0.12], [-0.25, 0.15, 0.09], [0.35, 0.2, 0.07], [-0.1, -0.15, 0.06]];
        for (const [cx, cy, cr] of craters) {
            ctx.beginPath();
            ctx.arc(moonPos.x + mr * cx, moonPos.y + mr * cy, mr * cr, 0, 6.28);
            ctx.fillStyle = `rgba(140,160,190,${(0.25 * fade).toFixed(3)})`;
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawSun() {
        if (!sunPos || sunFade < 0.005) return;
        const sr = Math.min(W, H) * 0.038;
        const fade = sunFade;

        // Corona
        const corona = sr * 6;
        const g1 = ctx.createRadialGradient(sunPos.x, sunPos.y, sr * 0.8, sunPos.x, sunPos.y, corona);
        g1.addColorStop(0, `rgba(255,240,200,${(0.22 * fade).toFixed(3)})`);
        g1.addColorStop(0.3, `rgba(255,220,150,${(0.08 * fade).toFixed(3)})`);
        g1.addColorStop(0.7, `rgba(255,200,100,${(0.025 * fade).toFixed(3)})`);
        g1.addColorStop(1, 'rgba(255,180,60,0)');
        ctx.beginPath(); ctx.arc(sunPos.x, sunPos.y, corona, 0, 6.28);
        ctx.fillStyle = g1; ctx.fill();

        // Sun disc
        ctx.globalAlpha = fade;
        ctx.beginPath(); ctx.arc(sunPos.x, sunPos.y, sr, 0, 6.28);
        const sg = ctx.createRadialGradient(sunPos.x, sunPos.y, 0, sunPos.x, sunPos.y, sr);
        sg.addColorStop(0, '#fffff0');
        sg.addColorStop(0.3, '#fff8d0');
        sg.addColorStop(0.6, '#ffe480');
        sg.addColorStop(0.85, '#ffcc40');
        sg.addColorStop(1, '#ffaa20');
        ctx.fillStyle = sg; ctx.fill();

        // White-hot center
        ctx.beginPath(); ctx.arc(sunPos.x, sunPos.y, sr * 0.35, 0, 6.28);
        ctx.fillStyle = `rgba(255,255,255,${(0.6 * fade).toFixed(3)})`;
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    function updateArcSeed() {
        const cycleIndex = Math.floor(performance.now() / DAY_CYCLE_DURATION);
        if (cycleIndex !== lastCycleIndex) {
            lastCycleIndex = cycleIndex;
            arcSeed = Math.random();
        }
    }

    // --- Tree ---
    const branches = [];
    let cachedMaxDelay = 0;
    let treeGrowth = 0;
    const TREE_GROW_DURATION = 30000;
    let treeStartTime = null;

    function generateTree() {
        branches.length = 0;
        const startX = W * 0.48;
        const startY = H;
        const trunkLen = H * 0.25;
        const trunkAngle = -Math.PI / 2 + (Math.random() - 0.5) * 0.06;
        buildBranch(startX, startY, trunkAngle, trunkLen, 0, 0, -1, 1);
        cachedMaxDelay = getMaxDelay();

        // Tag each branch with its original index before sorting
        for (let i = 0; i < branches.length; i++) branches[i]._origIdx = i;
        branches.sort((a, b) => a.delay - b.delay);
        // Build old→new index map, then remap parent references
        const remap = new Array(branches.length);
        for (let i = 0; i < branches.length; i++) remap[branches[i]._origIdx] = i;
        for (const b of branches) {
            b.parent = b.parent >= 0 ? remap[b.parent] : -1;
            delete b._origIdx;
        }

        // Precompute growStart for each branch:
        // the treeGrowth value at which this branch begins growing (always starts from p=0)
        const md = cachedMaxDelay || 1;
        const levelDur = 1.2 / (md + 1);
        for (const b of branches) {
            if (b.parent < 0) {
                b.growStart = 0; // trunk starts immediately
            } else {
                const par = branches[b.parent];
                // Parent started at par.growStart and takes levelDur to finish.
                // Child unlocks when parent reaches spawnT, i.e.:
                b.growStart = par.growStart + levelDur * b.spawnT;
            }
        }
    }

    // Padding from screen edges where branches should not end
    const SCREEN_PAD = 15;

    function buildBranch(x, y, angle, length, depth, delayLevel, parentIdx, spawnT) {
        if (depth > 10 || length < 4) return;

        // Clamp angle so branch doesn't aim sideways/down too much
        // Keep between -170deg and -10deg (pointing generally upward)
        angle = Math.max(-Math.PI * 0.94, Math.min(-Math.PI * 0.06, angle));

        const endX = x + Math.cos(angle) * length;
        const endY = y + Math.sin(angle) * length;

        // Hard bounds check — keep everything on screen
        if (endX < SCREEN_PAD || endX > W - SCREEN_PAD || endY < H * 0.03) return;

        const thickness = Math.max(1, (10 - depth) * 1.6);
        const midX = (x + endX) / 2, midY = (y + endY) / 2;
        const perpX = -Math.sin(angle), perpY = Math.cos(angle);
        const curv = (Math.random() - 0.5) * length * 0.3;
        const cpx = midX + perpX * curv, cpy = midY + perpY * curv;

        const idx = branches.length;
        // spawnT: where on the parent curve this branch starts (1 = tip)
        branches.push({ x1: x, y1: y, x2: endX, y2: endY, cpx, cpy, depth, thickness, delay: delayLevel, parent: parentIdx, spawnT: spawnT || 1 });

        const nextDelay = delayLevel + 1;
        const shrink = 0.55 + Math.random() * 0.2;

        // Random child count: 0 to 4 (weighted toward 2)
        let childCount;
        const r = Math.random();
        if (depth >= 9)      childCount = 0;
        else if (depth === 0) childCount = 2 + (Math.random() < 0.5 ? 1 : 0);
        else if (r < 0.05)   childCount = 0;
        else if (r < 0.15)   childCount = 1;
        else if (r < 0.60)   childCount = 2;
        else if (r < 0.85)   childCount = 3;
        else                  childCount = 4;

        // Some children branch from mid-points of this branch
        for (let i = 0; i < childCount; i++) {
            const baseSpread = (i / Math.max(1, childCount - 1) - 0.5) * 1.2;
            const jitter = (Math.random() - 0.5) * 0.4;
            const childAngle = angle + baseSpread + jitter;
            const childShrink = shrink * (0.85 + Math.random() * 0.3);

            // 30% chance to branch from a mid-point (0.4–0.85) instead of the tip
            let spawnT = 1;
            let bx = endX, by = endY;
            if (depth >= 1 && Math.random() < 0.3) {
                spawnT = 0.4 + Math.random() * 0.45;
                const sp = quadPt(spawnT, x, y, cpx, cpy, endX, endY);
                bx = sp.x; by = sp.y;
            }

            buildBranch(bx, by, childAngle, length * childShrink * (spawnT < 1 ? 0.8 : 1), depth + 1, nextDelay, idx, spawnT);
        }
    }

    function getMaxDelay() {
        let m = 0;
        for (const b of branches) if (b.delay > m) m = b.delay;
        return m;
    }

    function quadPt(t, x0, y0, cx, cy, x1, y1) {
        const u = 1 - t;
        return { x: u * u * x0 + 2 * u * t * cx + t * t * x1, y: u * u * y0 + 2 * u * t * cy + t * t * y1 };
    }

    let treeCache = null;

    function drawTreeTo(tgt) {
        const md = cachedMaxDelay || 1;
        const levelDur = 1.2 / (md + 1);

        for (const b of branches) {
            if (treeGrowth < b.growStart) continue;
            const p = Math.min(1, (treeGrowth - b.growStart) / levelDur);
            if (p < 0.001) continue;

            // Start point on parent's curve
            let sx = b.x1, sy = b.y1;
            if (b.parent >= 0) {
                const par = branches[b.parent];
                const sp = quadPt(b.spawnT, par.x1, par.y1, par.cpx, par.cpy, par.x2, par.y2);
                sx = sp.x; sy = sp.y;
            }

            const ex = b.x2, ey = b.y2;
            const cx = (sx + ex) / 2 + (b.cpx - (b.x1 + b.x2) / 2);
            const cy = (sy + ey) / 2 + (b.cpy - (b.y1 + b.y2) / 2);

            tgt.beginPath();
            tgt.moveTo(sx, sy);
            for (let j = 1; j <= 6; j++) {
                const pt = quadPt((j / 6) * p, sx, sy, cx, cy, ex, ey);
                tgt.lineTo(pt.x, pt.y);
            }
            tgt.strokeStyle = b.depth < 3 ? '#3d2b1f' : '#5a3a28';
            tgt.lineWidth = b.thickness * p + 0.5;
            tgt.lineCap = 'round';
            tgt.stroke();
        }
    }

    function drawTree() {
        if (treeCache) { ctx.drawImage(treeCache, 0, 0); return; }
        drawTreeTo(ctx);
        if (treeGrowth >= 1) {
            treeCache = document.createElement('canvas');
            treeCache.width = W; treeCache.height = H;
            drawTreeTo(treeCache.getContext('2d'));
        }
    }

    // --- Blossoms ---
    const blossoms = [];
    let blossomsCache = null;
    let blossomsCacheCtx = null;
    let blossomFirstUncached = 0; // index pointer — skip already cached

    function generateBlossoms() {
        blossoms.length = 0;
        const md = cachedMaxDelay || 1;
        for (const b of branches) {
            if (b.depth >= 7 && Math.random() < 0.6) {
                const h = 330 + Math.random() * 20;
                const l = 75 + Math.random() * 15;
                const a = 0.7 + Math.random() * 0.3;
                const done = (b.delay + 1) / (md + 1);
                blossoms.push({
                    x: b.x2, y: b.y2,
                    r: 2 + Math.random() * 4,
                    appear: done + Math.random() * 0.8, // wide spread
                    style: `hsla(${h},60%,${l}%,${a})`,
                    h, l, a,
                    cached: false,
                });
            }
        }
        blossoms.sort((a, b) => a.appear - b.appear);
        blossomFirstUncached = 0;
    }

    function initBlossomsCache() {
        blossomsCache = document.createElement('canvas');
        blossomsCache.width = W; blossomsCache.height = H;
        blossomsCacheCtx = blossomsCache.getContext('2d');
        blossomFirstUncached = 0;
    }

    function drawBlossoms() {
        if (!blossomsCache) initBlossomsCache();

        // Bake finished blossoms — max 15 per frame
        let baked = 0;
        for (let i = blossomFirstUncached; i < blossoms.length && baked < 15; i++) {
            const bl = blossoms[i];
            if (bl.cached) { if (i === blossomFirstUncached) blossomFirstUncached++; continue; }
            if (treeGrowth < bl.appear) break;
            const lp = (treeGrowth - bl.appear) / 0.12;
            if (lp < 1) continue;
            bl.cached = true;
            blossomsCacheCtx.beginPath();
            blossomsCacheCtx.arc(bl.x, bl.y, bl.r, 0, 6.28);
            blossomsCacheCtx.fillStyle = bl.style;
            blossomsCacheCtx.fill();
            if (i === blossomFirstUncached) blossomFirstUncached++;
            baked++;
        }

        ctx.drawImage(blossomsCache, 0, 0);

        // Draw only animating blossoms (not cached yet, visible)
        for (let i = blossomFirstUncached; i < blossoms.length; i++) {
            const bl = blossoms[i];
            if (bl.cached) continue;
            if (treeGrowth < bl.appear) break;
            const lp = Math.min(1, (treeGrowth - bl.appear) / 0.12);
            const r = bl.r * lp;
            ctx.beginPath();
            ctx.arc(bl.x, bl.y, r, 0, 6.28);
            ctx.fillStyle = `hsla(${bl.h},60%,${bl.l}%,${bl.a * lp})`;
            ctx.fill();
        }
    }

    // --- Falling petals ---
    const petals = [];

    function getVisibleBlossomCount() {
        let count = 0;
        for (const bl of blossoms) {
            if (bl.cached) count++;
        }
        return count;
    }

    function spawnPetal() {
        const visibleCount = getVisibleBlossomCount();
        if (visibleCount < 2) return;
        // Max petals scales smoothly: few blossoms = 1-2 petals, full bloom = up to 80
        const ratio = visibleCount / Math.max(1, blossoms.length);
        const maxPetals = Math.max(1, Math.floor(ratio * 80));
        if (petals.length >= maxPetals) return;
        // Only pick from fully visible (cached) blossoms
        const visible = [];
        for (const bl of blossoms) {
            if (bl.cached) visible.push(bl);
        }
        if (visible.length === 0) return;
        const src = visible[Math.floor(Math.random() * visible.length)];
        const h = 325 + Math.random() * 35, l = 72 + Math.random() * 20;
        const size = 1.5 + Math.random() * 5.5;
        const squeeze = 0.3 + Math.random() * 0.4;
        // gentle drift direction — slightly biased to one side like a breeze
        const windBias = (Math.random() - 0.3) * 0.25;
        petals.push({
            x: src.x + (Math.random() - 0.5) * 10, y: src.y,
            vx: windBias,
            vy: 0.15 + Math.random() * 0.3,
            r: size, squeeze,
            rot: Math.random() * 6.28,
            rs: (Math.random() - 0.5) * 0.012, // very gentle rotation
            // smooth pendulum sway
            sw: Math.random() * 6.28,
            ss: 0.006 + Math.random() * 0.01,
            sa: 0.3 + Math.random() * 0.6,
            h, l, alpha: 0.7 + Math.random() * 0.3,
            fill: `hsla(${h},55%,${l}%,${(0.7 + Math.random() * 0.3).toFixed(2)})`,
        });
    }

    function updatePetals(dt) {
        for (let i = petals.length - 1; i >= 0; i--) {
            const p = petals[i];
            p.sw += p.ss * dt;
            // gentle pendulum sway
            const sway = Math.sin(p.sw) * p.sa;
            p.x += (p.vx + sway * 0.06) * dt;
            p.y += p.vy * dt;
            // rotation follows sway direction — tilts the way it drifts
            p.rot += (p.rs + Math.cos(p.sw) * 0.008) * dt;
            if (p.y > H * 0.85) {
                p.alpha -= 0.005 * dt;
                p.fill = `hsla(${p.h},55%,${p.l}%,${Math.max(0, p.alpha).toFixed(2)})`;
            }
            if (p.y > H || p.alpha <= 0 || p.x < -20 || p.x > W + 20) {
                petals[i] = petals[petals.length - 1];
                petals.pop();
            }
        }
    }

    function drawPetals() {
        for (const p of petals) {
            const c = Math.cos(p.rot), s = Math.sin(p.rot);
            ctx.setTransform(c, s, -s, c, p.x, p.y);
            ctx.beginPath();
            ctx.ellipse(0, 0, p.r, p.r * p.squeeze, 0, 0, 6.28);
            ctx.fillStyle = p.fill;
            ctx.fill();
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // --- Ground ---
    function drawGround() {
        const na = getNightAlpha(dayPhase);
        const g = ctx.createLinearGradient(0, H * 0.92, 0, H);
        // Night: dark green, Day: lighter green
        const r = Math.round(10 + (1 - na) * 40);
        const gr = Math.round(20 + (1 - na) * 60);
        const b = Math.round(10 + (1 - na) * 20);
        g.addColorStop(0, `rgba(${r},${gr},${b},0)`);
        g.addColorStop(0.5, `rgba(${r},${gr},${b},${(0.3 + (1 - na) * 0.1).toFixed(2)})`);
        g.addColorStop(1, `rgba(${r},${gr},${b},${(0.5 + (1 - na) * 0.1).toFixed(2)})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, H * 0.92, W, H * 0.08);
    }

    // --- Shooting Stars ---
    const shootingStars = [];
    let nextShootingStar = 5000 + Math.random() * 10000; // first one after 5-15 sec
    let shootingStarTimer = 0;

    function spawnShootingStar() {
        const startX = Math.random() * W * 0.8;
        const startY = Math.random() * H * 0.3;
        const angle = Math.PI * 0.15 + Math.random() * Math.PI * 0.2; // downward-right
        const speed = 4 + Math.random() * 4;
        const length = 80 + Math.random() * 120;
        shootingStars.push({
            x: startX, y: startY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            length,
            life: 1,
            decay: 0.008 + Math.random() * 0.006,
            brightness: 0.8 + Math.random() * 0.2,
        });
    }

    function updateShootingStars(dt) {
        shootingStarTimer += 16.667 * dt;
        if (shootingStarTimer >= nextShootingStar) {
            if (getNightAlpha(dayPhase) > 0.3) spawnShootingStar();
            shootingStarTimer = 0;
            nextShootingStar = 15000 + Math.random() * 25000; // 15-40 sec
        }
        for (let i = shootingStars.length - 1; i >= 0; i--) {
            const s = shootingStars[i];
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.life -= s.decay * dt;
            if (s.life <= 0 || s.x > W + 50 || s.y > H) {
                shootingStars.splice(i, 1);
            }
        }
    }

    function drawShootingStars() {
        for (const s of shootingStars) {
            const tailX = s.x - s.vx * s.length / Math.hypot(s.vx, s.vy);
            const tailY = s.y - s.vy * s.length / Math.hypot(s.vx, s.vy);
            const grad = ctx.createLinearGradient(s.x, s.y, tailX, tailY);
            const a = s.life * s.brightness;
            grad.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`);
            grad.addColorStop(0.3, `rgba(200,220,255,${(a * 0.5).toFixed(3)})`);
            grad.addColorStop(1, `rgba(150,180,255,0)`);
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(tailX, tailY);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.5 * s.life + 0.5;
            ctx.lineCap = 'round';
            ctx.stroke();
            // Bright head glow
            ctx.beginPath();
            ctx.arc(s.x, s.y, 2 * s.life, 0, 6.28);
            ctx.fillStyle = `rgba(255,255,255,${(a * 0.8).toFixed(3)})`;
            ctx.fill();
        }
    }

    // --- Ambient Audio ---
    const tracks = ['1.mp3', '2.mp3', '3.mp3', '4.mp3'];
    let trackIndex = Math.floor(Math.random() * tracks.length);
    const audio = new Audio(tracks[trackIndex]);
    audio.volume = 0;
    audio.addEventListener('ended', () => {
        trackIndex = Math.floor(Math.random() * tracks.length);
        audio.src = tracks[trackIndex];
        audio.play();
    });
    let audioStarted = false, audioMuted = false;
    let fadeInterval = null;

    function fadeVolume(from, to, duration, callback) {
        if (fadeInterval) clearInterval(fadeInterval);
        const steps = Math.max(1, Math.round(duration / 50));
        const delta = (to - from) / steps;
        let step = 0;
        audio.volume = from;
        fadeInterval = setInterval(() => {
            step++;
            audio.volume = Math.min(1, Math.max(0, from + delta * step));
            if (step >= steps) {
                clearInterval(fadeInterval);
                fadeInterval = null;
                audio.volume = to;
                if (callback) callback();
            }
        }, 50);
    }

    function switchTrack(direction) {
        if (!audioStarted) return;
        const targetVol = audioMuted ? 0 : 0.5;
        fadeVolume(audio.volume, 0, 3000, () => {
            trackIndex = (trackIndex + direction + tracks.length) % tracks.length;
            audio.src = tracks[trackIndex];
            audio.play();
            if (!audioMuted) fadeVolume(0, targetVol, 3000);
        });
    }

    function initAudio() {
        if (audioStarted) return;
        audioStarted = true;
        audio.play().then(() => {
            fadeVolume(0, 0.5, 8000);
        }).catch(() => { audioStarted = false; });
    }

    // Shared button style
    const btnStyle = {
        width: '40px', height: '40px', borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.2)',
        background: 'rgba(20,10,30,0.45)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        color: '#fff', fontSize: '16px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'opacity 0.3s', opacity: '0.6', zIndex: '100',
        fontFamily: 'sans-serif', lineHeight: '1', padding: '0',
    };

    // Prev button
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '\u25C0';
    prevBtn.title = 'Previous track';
    Object.assign(prevBtn.style, btnStyle, { position: 'fixed', bottom: '16px', right: '108px' });
    prevBtn.addEventListener('mouseenter', () => { prevBtn.style.opacity = '1'; });
    prevBtn.addEventListener('mouseleave', () => { prevBtn.style.opacity = '0.6'; });
    prevBtn.addEventListener('click', (e) => { e.stopPropagation(); switchTrack(-1); });
    document.body.appendChild(prevBtn);

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '\u25B6';
    nextBtn.title = 'Next track';
    Object.assign(nextBtn.style, btnStyle, { position: 'fixed', bottom: '16px', right: '62px' });
    nextBtn.addEventListener('mouseenter', () => { nextBtn.style.opacity = '1'; });
    nextBtn.addEventListener('mouseleave', () => { nextBtn.style.opacity = '0.6'; });
    nextBtn.addEventListener('click', (e) => { e.stopPropagation(); switchTrack(1); });
    document.body.appendChild(nextBtn);

    // Mute button — music is ON by default, icon = ♫
    const muteBtn = document.createElement('button');
    muteBtn.textContent = '\u266B';
    muteBtn.title = 'Toggle music';
    Object.assign(muteBtn.style, btnStyle, {
        position: 'fixed', bottom: '16px', right: '16px',
        fontSize: '18px', fontFamily: 'serif',
    });
    muteBtn.addEventListener('mouseenter', () => { muteBtn.style.opacity = '1'; });
    muteBtn.addEventListener('mouseleave', () => { muteBtn.style.opacity = audioMuted ? '0.35' : '0.6'; });
    muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!audioStarted) { initAudio(); return; }
        audioMuted = !audioMuted;
        if (audioMuted) {
            fadeVolume(audio.volume, 0, 2000);
            muteBtn.textContent = '\u2669';
            muteBtn.style.opacity = '0.35';
        } else {
            fadeVolume(0, 0.5, 2000);
            muteBtn.textContent = '\u266B';
            muteBtn.style.opacity = '0.6';
        }
    });
    document.body.appendChild(muteBtn);

    // Try autoplay immediately
    initAudio();
    // Fallback: if browser blocked autoplay, start on first interaction
    document.addEventListener('click', () => { initAudio(); }, { once: true });
    document.addEventListener('keydown', () => { initAudio(); }, { once: true });
    document.addEventListener('touchstart', () => { initAudio(); }, { once: true });

    // --- Init ---
    generateTree();
    generateBlossoms();

    window.addEventListener('resize', () => {
        generateTree();
        generateBlossoms();
        // Show tree fully grown instantly after resize
        treeStartTime = performance.now() - TREE_GROW_DURATION * 2;
        treeCache = null;
        blossomsCache = null;
        blossomsCacheCtx = null;
    });


    // --- Clouds ---
    const clouds = [];

    function initClouds() {
        clouds.length = 0;
        const count = 5 + Math.floor(Math.random() * 6); // 5-10
        for (let i = 0; i < count; i++) {
            const w = 100 + Math.random() * 200;
            const h = 30 + Math.random() * 40;
            // Pre-generate blob layout: 5-8 circles forming a natural cloud shape
            const blobCount = 5 + Math.floor(Math.random() * 4);
            const blobs = [];
            for (let j = 0; j < blobCount; j++) {
                const t = j / (blobCount - 1); // 0..1 along width
                const bx = (t - 0.5) * w * 0.8;
                // Middle blobs are taller, edges shorter
                const heightMul = 1 - Math.pow(t * 2 - 1, 2) * 0.6;
                const by = (Math.random() - 0.55) * h * 0.3;
                const br = (h * 0.4 + Math.random() * h * 0.35) * heightMul;
                blobs.push({ bx, by, br });
            }
            clouds.push({
                x: Math.random() * (W + 400) - 200,
                y: 30 + Math.random() * H * 0.3,
                width: w, height: h,
                speed: 0.08 + Math.random() * 0.35,
                opacity: 0.12 + Math.random() * 0.2,
                blobs,
            });
        }
    }
    initClouds();
    window.addEventListener('resize', initClouds);

    function drawClouds(dt) {
        const na = getNightAlpha(dayPhase);
        const visMul = 0.3 + 0.7 * (1 - na);
        ctx.save();
        for (const c of clouds) {
            c.x += c.speed * dt * timeScale;
            if (c.x - c.width > W) c.x = -c.width * 1.5;
            const a = c.opacity * visMul;
            // Soft cloud: draw all blobs as one merged shape with radial gradients
            ctx.globalAlpha = a;
            for (const b of c.blobs) {
                const cx = c.x + b.bx, cy = c.y + b.by, r = b.br;
                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
                grad.addColorStop(0, 'rgba(255,255,255,0.8)');
                grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
                grad.addColorStop(0.75, 'rgba(255,255,255,0.12)');
                grad.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, 6.28);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    // --- Speed control ---
    let timeScale = 1;

    const speedBtn = document.createElement('button');
    speedBtn.textContent = '\u23E9';
    speedBtn.title = 'Speed x2';
    Object.assign(speedBtn.style, btnStyle, { position: 'fixed', bottom: '16px', left: '16px' });
    speedBtn.addEventListener('mouseenter', () => { speedBtn.style.opacity = '1'; });
    speedBtn.addEventListener('mouseleave', () => { speedBtn.style.opacity = timeScale === 2 ? '1' : '0.6'; });
    speedBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        timeScale = 2;
        speedBtn.style.opacity = '1';
        normalBtn.style.opacity = '0.6';
    });
    document.body.appendChild(speedBtn);

    const normalBtn = document.createElement('button');
    normalBtn.textContent = '\u23F5';
    normalBtn.title = 'Normal speed';
    Object.assign(normalBtn.style, btnStyle, { position: 'fixed', bottom: '16px', left: '62px' });
    normalBtn.addEventListener('mouseenter', () => { normalBtn.style.opacity = '1'; });
    normalBtn.addEventListener('mouseleave', () => { normalBtn.style.opacity = timeScale === 1 ? '1' : '0.6'; });
    normalBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        timeScale = 1;
        normalBtn.style.opacity = '1';
        speedBtn.style.opacity = '0.6';
    });
    document.body.appendChild(normalBtn);

    // --- Loop ---
    let petalTimer = 0, lastTime = 0;
    const dayPhaseOffset = dayPhase; // preserve random start
    let dayTimeAccum = dayPhaseOffset * DAY_CYCLE_DURATION;
    let treeTimeAccum = 0;

    function animate(time) {
        const rawDt = lastTime ? (time - lastTime) : 16.667;
        lastTime = time;
        const dt = (rawDt / 16.667) * timeScale;

        if (treeStartTime === null) treeStartTime = time;
        treeTimeAccum += rawDt * timeScale;
        treeGrowth = Math.min(1.6, treeTimeAccum / TREE_GROW_DURATION);

        dayTimeAccum += rawDt * timeScale;
        dayPhase = (dayTimeAccum / DAY_CYCLE_DURATION) % 1;

        updateArcSeed();
        updateCelestialPositions();

        drawSky();
        drawSkyLight();
        drawClouds(rawDt / 16.667);
        drawStars(time);
        updateShootingStars(dt);
        drawShootingStars();
        drawSun();
        drawMoon();
        drawGround();
        drawTree();
        drawBlossoms();

        // Petals: start as soon as a few blossoms exist, ramp up with more
        const visCount = getVisibleBlossomCount();
        if (visCount >= 2) {
            petalTimer++;
            // Few blossoms = spawn rarely (every ~30 frames), full bloom = every frame
            const ratio = visCount / Math.max(1, blossoms.length);
            const spawnInterval = Math.max(1, Math.floor(30 * (1 - ratio) + 1));
            if (petalTimer % spawnInterval === 0) spawnPetal();
        }
        updatePetals(dt);
        drawPetals();

        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
})();
