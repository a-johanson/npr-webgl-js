/// Binary min-heap implemented over an array.
export class MinHeap {
    constructor(comparator) {
        this._cmp = comparator || ((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        this._data = [];
    }

    size() {
        return this._data.length;
    }

    isEmpty() {
        return this._data.length === 0;
    }

    peek() {
        return this._data.length ? this._data[0] : undefined;
    }

    push(item) {
        const d = this._data;
        d.push(item);
        this._siftUp(d.length - 1);
    }

    pop() {
        const d = this._data;
        const n = d.length;
        if (n === 0) return undefined;
        const min = d[0];
        const last = d.pop();
        if (n > 1) {
            d[0] = last;
            this._siftDown(0);
        }
        return min;
    }

    clear() {
        this._data.length = 0;
    }

    // Internal helpers
    _parent(i) { return ((i - 1) >>> 1); }
    _left(i) { return (i << 1) + 1; }
    _right(i) { return (i << 1) + 2; }

    _siftUp(i) {
        const d = this._data;
        let idx = i;
        while (idx > 0) {
            const p = this._parent(idx);
            if (this._cmp(d[idx], d[p]) < 0) {
                const tmp = d[idx]; d[idx] = d[p]; d[p] = tmp; // swap d[idx] and d[p]
                idx = p;
            } else {
                break;
            }
        }
    }

    _siftDown(i) {
        const d = this._data;
        const n = d.length;
        let idx = i;
        while (true) {
            const l = this._left(idx);
            const r = this._right(idx);
            let smallest = idx;
            if (l < n && this._cmp(d[l], d[smallest]) < 0) smallest = l;
            if (r < n && this._cmp(d[r], d[smallest]) < 0) smallest = r;
            if (smallest !== idx) {
                const tmp = d[idx]; d[idx] = d[smallest]; d[smallest] = tmp; // swap d[idx] and d[smallest]
                idx = smallest;
            } else {
                break;
            }
        }
    }
}
