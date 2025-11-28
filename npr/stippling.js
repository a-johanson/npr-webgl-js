import { prng_xor4096 } from '../lib/esm-seedrandom/xor4096.js';
import { SpatialGrid } from './grid.js';

export function renderFromLDZ(ctx2d, ldzData, width, height, dpi, seed) {
    const pixelsPerMm = dpi / 25.4;

    const rDot = 0.25 * pixelsPerMm;
    const rMin = 1.1 * rDot;
    const rMax = 5.1 * rDot;
    const gamma = 2.2;
    const cellSize = rMax;
    const maxAttempts = 30;
    let rng = prng_xor4096(seed);

    // Helper to get luminance and z at (x, y)
    function luminanceAndZ(x, y) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const idx = (iy * width + ix) * 4;
        return [ldzData[idx], ldzData[idx + 3]];
    }

    // Helper to get disk radius for luminance
    function radius(luminance) {
        return rMin + (rMax - rMin) * Math.pow(luminance, gamma);
    }

    // Stochastic stippling using Poisson-disk sampling and a spatial grid structure to accelerate proximity queries
    const grid = new SpatialGrid(cellSize);
    const queue = [];

    // First pass: jittered grid initialization
    for (let y = 0; y < height; y += cellSize) {
        for (let x = 0; x < width; x += cellSize) {
            const px = x + rng() * cellSize;
            const py = y + rng() * cellSize;
            if (px >= width  || py >= height) continue;
            const [luminance, z] = luminanceAndZ(px, py);
            if (z < 0) continue;
            const r = radius(luminance);
            if (!grid.hasNearby(px, py, r)) {
                grid.addPoint(px, py);
                queue.push([px, py, z]);
            }
        }
    }

    // Second pass: grow from queue
    let qi = 0;
    while (qi < queue.length) {
        const [qx, qy] = queue[qi++];
        const [luminance, _] = luminanceAndZ(qx, qy);
        const r = radius(luminance);
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Random angle and distance
            const angle = rng() * 2 * Math.PI;
            const dist = r * (1 + rng());
            const px = qx + Math.cos(angle) * dist;
            const py = qy + Math.sin(angle) * dist;
            if (px < 0 || px >= width || py < 0 || py >= height) continue;
            const [luminance2, z2] = luminanceAndZ(px, py);
            if (z2 < 0) continue;
            const r2 = radius(luminance2);
            if (!grid.hasNearby(px, py, r2)) {
                grid.addPoint(px, py);
                queue.push([px, py, z2]);
            }
        }
    }

    ctx2d.fillStyle = '#fff';
    ctx2d.fillRect(0, 0, width, height);

    // Draw points
    ctx2d.save();
    ctx2d.fillStyle = '#222';
    for (const [x, y, z] of queue) {
        ctx2d.beginPath();
        ctx2d.arc(x, y, rDot, 0, 2 * Math.PI);
        ctx2d.fill();
    }
    ctx2d.restore();
}
