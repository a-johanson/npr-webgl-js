import { prng_xor4096 } from '../lib/esm-seedrandom/xor4096.js';
import { SpatialGrid } from './grid.js';
import { outlinesFromLDZ } from './outlines.js';
import { drawPolyline } from './polyline.js';


function dSepFromLuminance(dSepMax, dSepShadowFactor, gammaLuminance, luminance) {
    const dSepMin = dSepMax * dSepShadowFactor;
    return dSepMin + (dSepMax - dSepMin) * Math.pow(luminance, gammaLuminance);
}

function getLdzValue(ldzData, width, height, x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= width || iy < 0 || iy >= height) return undefined;
    const idx = (iy * width + ix) * 4;
    const luminance = ldzData[idx];
    const direction = [ldzData[idx + 1], ldzData[idx + 2]];
    const depth = ldzData[idx + 3];
    return { luminance, direction, depth };
}

function flowFieldStreamline(
    ldzData,
    width,
    height,
    grid,
    pStart,
    startFromStreamlineId,
    config
) {
    const {
        dSepMax = 1.0,
        dSepShadowFactor = 0.5,
        gammaLuminance = 1.5,
        dTestFactor = 1.1,
        dStep = 1.0,
        maxDepthStep = 0.1,
        maxAccumAngle = Math.PI * 0.6,
        maxHatchedLuminance = 1.0,
        maxSteps = 200,
        minSteps = 10
    } = config;

    const ldzStart = getLdzValue(ldzData, width, height, pStart[0], pStart[1]);
    if (!ldzStart || ldzStart.depth < 0.0 || ldzStart.luminance > maxHatchedLuminance) {
        return null;
    }

    const dSepStart = dSepFromLuminance(dSepMax, dSepShadowFactor, gammaLuminance, ldzStart.luminance);
    if (grid.hasNearby(pStart[0], pStart[1], dTestFactor * dSepStart, (tag) => tag !== startFromStreamlineId)) {
        return null;
    }

    function continueLine(lp0, direction0, depth0, step, accumLimit, stepCount) {
        const line = [];
        let lpLast = lp0;
        let nextDir = direction0;
        let lastDepth = depth0;
        let accumAngle = 0.0;

        for (let i = 0; i < stepCount; i++) {
            const pNew = [
                lpLast[0] + nextDir[0] * step,
                lpLast[1] + nextDir[1] * step
            ];
            const ldz = getLdzValue(ldzData, width, height, pNew[0], pNew[1]);
            if (!ldz) break;

            const newDir = ldz.direction;
            const dot = Math.max(-1.0, Math.min(1.0, nextDir[0] * newDir[0] + nextDir[1] * newDir[1]));
            accumAngle += Math.acos(dot);
            const dSep = dSepFromLuminance(dSepMax, dSepShadowFactor, gammaLuminance, ldz.luminance);
            const r = dTestFactor * dSep;

            if (ldz.depth < 0.0 ||
                accumAngle > accumLimit ||
                Math.abs(ldz.depth - lastDepth) > maxDepthStep ||
                ldz.luminance > maxHatchedLuminance ||
                grid.hasNearby(pNew[0], pNew[1], r)) {
                break;
            }

            line.push(pNew);
            lpLast = pNew;
            nextDir = ldz.direction;
            lastDepth = ldz.depth;
        }
        return line;
    }

    const fwd = continueLine(pStart, ldzStart.direction, ldzStart.depth, dStep, 0.5 * maxAccumAngle, Math.floor(maxSteps / 2));
    const bwd = continueLine(pStart, ldzStart.direction, ldzStart.depth, -dStep, 0.5 * maxAccumAngle, Math.floor(maxSteps / 2));

    const line = bwd.reverse().concat([pStart]).concat(fwd);
    return line.length > (minSteps + 1) ? line : null;
}

export function flowFieldStreamlines(
    ldzData,
    width,
    height,
    rngSeed,
    config
) {
    const {
        dSepMax = 1.0,
        dSepShadowFactor = 0.5,
        gammaLuminance = 1.5
    } = config;

    let rng = prng_xor4096(rngSeed);
    const grid = new SpatialGrid(dSepMax);
    const queue = [];
    const streamlines = [];
    let streamlineIdCounter = 1;

    // Seed points on a jittered grid
    const seedBoxSize = Math.ceil(dSepMax);
    const cellCountX = Math.floor(width / seedBoxSize);
    const cellCountY = Math.floor(height / seedBoxSize);
    const cellWidth = width / cellCountX;
    const cellHeight = height / cellCountY;

    for (let iy = 0; iy < cellCountY; iy++) {
        for (let ix = 0; ix < cellCountX; ix++) {
            const sx = cellWidth * (ix + rng());
            const sy = cellHeight * (iy + rng());
            const sl = flowFieldStreamline(ldzData, width, height, grid, [sx, sy], 0, config);
            if (sl) {
                const sid = streamlineIdCounter;
                streamlineIdCounter += 1;
                sl.forEach(p => grid.addPoint(p[0], p[1], sid));
                queue.push({ sid, line: sl });
                streamlines.push(sl);
            }
        }
    }

    // Grow from queue
    while (queue.length > 0) {
        const { sid, line } = queue.shift();
        for (const lp of line) {
            const ldz = getLdzValue(ldzData, width, height, lp[0], lp[1]);
            const dSep = dSepFromLuminance(dSepMax, dSepShadowFactor, gammaLuminance, ldz.luminance);
            for (const sign of [-1.0, 1.0]) {
                const newSeed = [
                    lp[0] - ldz.direction[1] * sign * dSep,
                    lp[1] + ldz.direction[0] * sign * dSep
                ];
                const newSl = flowFieldStreamline(ldzData, width, height, grid, newSeed, sid, config);
                if (newSl) {
                    const newSid = streamlineIdCounter;
                    streamlineIdCounter += 1;
                    newSl.forEach(p => grid.addPoint(p[0], p[1], newSid));
                    queue.push({ sid: newSid, line: newSl });
                    streamlines.push(newSl);
                }
            }
        }
    }

    return streamlines;
}

export function renderFromLDZ(ctx2d, ldzData, width, height, dpi, seed) {
    const pixelsPerMm = dpi / 25.4;

    const config = {
        dSepMax: 0.8 * pixelsPerMm,
        dSepShadowFactor: 0.5,
        gammaLuminance: 1.5,
        dTestFactor: 1.1,
        dStep: 0.4 * pixelsPerMm,
        maxDepthStep: 0.02,
        maxAccumAngle: Math.PI * 0.6,
        maxHatchedLuminance: 2.0,
        maxSteps: 150,
        minSteps: 10
    };

    const streamlines = flowFieldStreamlines(ldzData, width, height, seed, config);
    const outlines = outlinesFromLDZ(ldzData, width, height, 0.7, 0.3, 25, 0.25);

    ctx2d.fillStyle = '#fff';
    ctx2d.fillRect(0, 0, width, height);
    ctx2d.strokeStyle = '#222';
    ctx2d.lineWidth = 0.2 * pixelsPerMm;
    ctx2d.lineCap = 'round';
    ctx2d.lineJoin = 'round';

    for (const line of streamlines) {
        drawPolyline(ctx2d, line);
    }
    for (const line of outlines) {
        drawPolyline(ctx2d, line);
    }
}
