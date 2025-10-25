// SpatialGrid: grid-based structure for fast point proximity queries
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
