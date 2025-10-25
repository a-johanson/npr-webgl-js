import { prng_xor4096 } from './lib/esm-seedrandom/xor4096.js';

export function renderFromLDZ(ctx2d, ldzData, width, height, dpi) {
    const pixels_per_mm = dpi / 25.4;

    const rDot = 0.1 * pixels_per_mm;
    const rMin = 1.2 * rDot;
    const rMax = 5.0 * rDot;
    const gamma = 3.5;
    const cellSize = rMax;
    const maxAttempts = 30;
    let rng = prng_xor4096('52769ff2367023');

    // Helper to get luminance and z at (x, y)
    function luminanceAndZ(x, y) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const idx = (iy * width + ix) * 4;
        return [ldzData[idx], ldzData[idx + 3]];
    }

    // Helper to get disk radius for luminance
    function radius(luminance) {
        return rMin + (rMax - rMin) * Math.pow(luminance, 0.5 * gamma);
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

// SpatialGrid: efficient grid-based structure for fast point proximity queries
export class SpatialGrid {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.invCellSize = 1 / cellSize;
        this.grid = new Map(); // key: "ix,iy", value: array of [x, y]
    }

    _cellKey(ix, iy) {
        return `${ix},${iy}`;
    }

    addPoint(x, y) {
        const ix = Math.floor(x * this.invCellSize);
        const iy = Math.floor(y * this.invCellSize);
        const key = this._cellKey(ix, iy);
        const cell = this.grid.get(key);
        if (cell) { 
            cell.push([x, y]);
        } else {
            this.grid.set(key, [[x, y]]);
        }
    }

    // Check if there are any points within 'radius' of (x, y)
    hasNearby(x, y, radius) {
        const r = Math.ceil(radius * this.invCellSize);
        const ix = Math.floor(x * this.invCellSize);
        const iy = Math.floor(y * this.invCellSize);
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                const key = this._cellKey(ix + dx, iy + dy);
                const cell = this.grid.get(key);
                if (cell) {
                    for (const pt of cell) {
                        const dx = pt[0] - x;
                        const dy = pt[1] - y;
                        if (dx * dx + dy * dy < radius * radius) return true;
                    }
                }
            }
        }
        return false;
    }
}
