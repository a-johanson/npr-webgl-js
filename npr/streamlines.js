import { prng_xor4096 } from '../lib/esm-seedrandom/xor4096.js';
import { SpatialGrid } from './grid.js';
import { outlinesFromLDZ } from './outlines.js';
import { drawPolyline, visvalingamWhyatt } from './polyline.js';
import { linearToOklab, oklabToLinear, srgbToLinear, linearToSrgb } from './color.js';


function dSepFromLuminance(dSepMax, dSepShadowFactor, gammaLuminance, luminance) {
    const dSepMin = dSepMax * dSepShadowFactor;
    return dSepMin + (dSepMax - dSepMin) * Math.pow(luminance, gammaLuminance);
}

function getLdzValue(ldzData, width, height, x, y, orientationOffset = 0.0) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= width || iy < 0 || iy >= height) return undefined;
    const idx = (iy * width + ix) * 4;
    const luminance = ldzData[idx];
    const direction = [ldzData[idx + 1], ldzData[idx + 2]];
    if (orientationOffset !== 0.0) {
        const cosOo = Math.cos(orientationOffset);
        const sinOo = Math.sin(orientationOffset);
        const dirX = direction[0] * cosOo - direction[1] * sinOo;
        const dirY = direction[0] * sinOo + direction[1] * cosOo;
        direction[0] = dirX;
        direction[1] = dirY;
    }
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
        minSteps = 10,
        orientationOffset = 0.0
    } = config;

    const ldzStart = getLdzValue(ldzData, width, height, pStart[0], pStart[1], orientationOffset);
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
            const ldz = getLdzValue(ldzData, width, height, pNew[0], pNew[1], orientationOffset);
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
        gammaLuminance = 1.5,
        orientationOffset = 0.0,
        maxAreaDeviation = 0.25
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
                streamlines.push(visvalingamWhyatt(sl, maxAreaDeviation));
            }
        }
    }

    // Grow from queue
    while (queue.length > 0) {
        const { sid, line } = queue.shift();
        for (const lp of line) {
            const ldz = getLdzValue(ldzData, width, height, lp[0], lp[1], orientationOffset);
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
                    streamlines.push(visvalingamWhyatt(newSl, maxAreaDeviation));
                }
            }
        }
    }

    return streamlines;
}

export function renderFromLDZ(ctx2d, ldzData, width, height, dpi, seed) {
    const pixelsPerMm = dpi / 25.4;

    const config = {
        dSepMax: 0.9 * pixelsPerMm,
        dSepShadowFactor: 0.2,
        gammaLuminance: 2.0,
        dTestFactor: 1.1,
        dStep: 0.1 * pixelsPerMm,
        maxDepthStep: 0.02,
        maxAccumAngle: Math.PI * 0.6,
        maxHatchedLuminance: 1.9,
        maxSteps: 750,
        minSteps: 10,
        orientationOffset: 0.0,
        maxAreaDeviation: 0.25
    };

    const streamlines = flowFieldStreamlines(ldzData, width, height, seed, config);
    config.orientationOffset = Math.PI / 180.0 * 30.0;
    config.maxHatchedLuminance = 0.25;
    const crosslines = flowFieldStreamlines(ldzData, width, height, seed + 'cross', config);
    const outlines = outlinesFromLDZ(ldzData, width, height, { maxAreaDeviation: config.maxAreaDeviation });

    // ctx2d.fillStyle = '#fff';
    // ctx2d.fillRect(0, 0, width, height);
    ctx2d.strokeStyle = '#111';
    ctx2d.lineWidth = 0.06 * pixelsPerMm;
    ctx2d.lineCap = 'round';
    ctx2d.lineJoin = 'round';

    function mix(a, b, t) {
        t = Math.min(Math.max(t, 0.0), 1.0);
        return a.map((av, i) => av * (1.0 - t) + b[i] * t);
    }
    const labBg1 = linearToOklab(srgbToLinear([0.2, 0.65, 0.9]));
    const labBg2 = linearToOklab(srgbToLinear([0.0, 0.0, 0.25]));
    const imgData = ctx2d.getImageData(0, 0, width, height);
    const data = imgData.data;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idxBase = ((height - 1 - y) * width + x) * 4;
            const z = ldzData[(y * width + x) * 4 + 3];
            if (z < 0.0) {
                const labBg = mix(labBg1, labBg2, Math.pow(0.15 * x / (width-1) + 0.85 * y / (height-1), 1.5));
                const rgbBg = linearToSrgb(oklabToLinear(labBg));
                data[idxBase] = Math.round(rgbBg[0] * 255);
                data[idxBase + 1] = Math.round(rgbBg[1] * 255);
                data[idxBase + 2] = Math.round(rgbBg[2] * 255);
            } else {
                data[idxBase] = Math.round(0.98 * 255);
                data[idxBase + 1] = Math.round(0.95 * 255);
                data[idxBase + 2] = Math.round(0.85 * 255);
            }
            data[idxBase + 3] = 255;
        }
    }
    ctx2d.putImageData(imgData, 0, 0);

    for (const line of crosslines) {
        drawPolyline(ctx2d, line);
    }
    for (const line of streamlines) {
        drawPolyline(ctx2d, line);
    }
    for (const line of outlines) {
        drawPolyline(ctx2d, line);
    }
}
