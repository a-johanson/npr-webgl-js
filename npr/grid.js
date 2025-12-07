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

    addPoint(x, y, tag = null) {
        const ix = Math.floor(x * this.invCellSize);
        const iy = Math.floor(y * this.invCellSize);
        const key = this._cellKey(ix, iy);
        const cell = this.grid.get(key);
        if (cell) { 
            cell.push([x, y, tag]);
        } else {
            this.grid.set(key, [[x, y, tag]]);
        }
    }

    // Check if there are any points within 'radius' of (x, y)
    // An optional filter function can be provided to exclude certain points.
    // filter: (pointTag) => boolean. Return true to include point, false to exclude.
    hasNearby(x, y, radius, filter = null) {
        const r = Math.ceil(radius * this.invCellSize);
        const ix = Math.floor(x * this.invCellSize);
        const iy = Math.floor(y * this.invCellSize);
        const radiusSq = radius * radius;

        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                const key = this._cellKey(ix + dx, iy + dy);
                const cell = this.grid.get(key);
                if (cell) {
                    for (const pt of cell) {
                        const dx = pt[0] - x;
                        const dy = pt[1] - y;
                        const distSq = dx * dx + dy * dy;

                        if (distSq < radiusSq && (!filter || filter(pt[2]))) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }
}
