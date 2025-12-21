import {
    drawPolyline,
    drawPolylinePoints,
    laplacianSmoothing,
    normalizedCurvaturesFromAngle,
    stitchSegmentsToPolylines,
    visvalingamWhyatt
} from './polyline.js';


/// Laplacian of Gaussian kernel generation
function logKernel(sigma, radius = Math.ceil(3.0 * sigma)) {
    const size = radius * 2.0 + 1.0;
    const sigma2 = sigma * sigma;
    const sigma4 = sigma2 * sigma2;
    const kernel = new Float32Array(size * size);
    let sum = 0.0;
    for (let j = -radius; j <= radius; j++) {
        for (let i = -radius; i <= radius; i++) {
            const r2 = i * i + j * j;
            const val = ((r2 - 2.0 * sigma2) / sigma4) * Math.exp(-r2 / (2.0 * sigma2));
            kernel[(j + radius) * size + (i + radius)] = val;
            sum += val;
        }
    }
    // LoG kernel should sum to approx. 0
    const mean = sum / (size * size);
    for (let k = 0; k < kernel.length; k++) kernel[k] -= mean;
    return { kernel, size, radius };
}

function convolve2D(src, offset, stride, width, height, kernel, kSize, kRadius) {
    const dst = new Float32Array(width * height);
    // reflect helper
    const reflect = (idx, limit) => {
        if (idx < 0) return -idx - 1;
        if (idx >= limit) return 2 * limit - idx - 1;
        return idx;
    };

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0.0;
            for (let ky = -kRadius; ky <= kRadius; ky++) {
                const sy = reflect(y + ky, height);
                const kRow = (ky + kRadius) * kSize;
                const srcRow = sy * width;
                for (let kx = -kRadius; kx <= kRadius; kx++) {
                    const sx = reflect(x + kx, width);
                    const kval = kernel[kRow + (kx + kRadius)];
                    sum += src[(srcRow + sx) * stride + offset] * kval;
                }
            }
            dst[y * width + x] = sum;
        }
    }
    return dst;
}

function marchingSquaresZeroCrossing(lap, width, height, threshold = 1e-3) {
    function edgeHasZeroCrossing(v1, v2) {
        return v1 * v2 < 0.0 && Math.abs(v1 - v2) > threshold;
    }

    function interpolateZeroCrossing(v1, v2, x1, y1, x2, y2) {
        const t = v1 / (v1 - v2); // <=> -v1 / (v2 - v1)
        return [
            x1 + t * (x2 - x1),
            y1 + t * (y2 - y1)
        ];
    }

    const segments = [];

    for (let y = 0; y < height - 1; y++) {
        for (let x = 0; x < width - 1; x++) {
            const a = lap[y * width + x];               // top-left
            const b = lap[y * width + (x + 1)];         // top-right
            const c = lap[(y + 1) * width + x];         // bottom-left
            const d = lap[(y + 1) * width + (x + 1)];   // bottom-right

            const pts = [];
            // Edge order: top, right, bottom, left.

            // Top edge: a -> b
            if (edgeHasZeroCrossing(a, b)) {
                pts.push(interpolateZeroCrossing(a, b, x, y, x + 1, y));
            }

            // Right edge: b -> d
            if (edgeHasZeroCrossing(b, d)) {
                pts.push(interpolateZeroCrossing(b, d, x + 1, y, x + 1, y + 1));
            }

            // Bottom edge: c -> d
            if (edgeHasZeroCrossing(c, d)) {
                pts.push(interpolateZeroCrossing(c, d, x, y + 1, x + 1, y + 1));
            }

            // Left edge: a -> c
            if (edgeHasZeroCrossing(a, c)) {
                pts.push(interpolateZeroCrossing(a, c, x, y, x, y + 1));
            }

            if (pts.length === 2) {
                segments.push(pts);
            } else if (pts.length === 4) {
                // Asymptotic decider for ambiguous (saddle) cases.
                const s = a * d - b * c;
                if (s > 0) { // dominant a <-> d diagonal
                    // Connect top-right and bottom-left: [top,right], [bottom,left]
                    segments.push([pts[0], pts[1]]);
                    segments.push([pts[2], pts[3]]);
                } else { // consistently include s == 0 in this case
                    // Connect top-left and bottom-right: [top,left], [bottom,right]
                    segments.push([pts[0], pts[3]]);
                    segments.push([pts[2], pts[1]]);
                }
            }
        }
    }

    return segments;
}

export function outlinesFromLDZ(
    ldzData,
    width,
    height,
    {
        logSigma = 0.7,
        marchingSquaresThreshold = 0.6,
        minSegmentCount = 25,
        curvatureWindow = 10,
        minAngleDeg = 15.0,
        maxAngleDeg = 100.0,
        laplaceLambdaMax = 0.8,
        laplaceIterations = 3,
        laplaceWindow = 4,
        maxAreaDeviation = 0.25
    } = {}
) {
    const logk = logKernel(logSigma);
    const lap = convolve2D(ldzData, 3, 4, width, height, logk.kernel, logk.size, logk.radius);
    const segments = marchingSquaresZeroCrossing(lap, width, height, marchingSquaresThreshold);
    return stitchSegmentsToPolylines(segments)
        .filter(poly => poly.length >= minSegmentCount)
        .map(poly => {
            const curvatures = normalizedCurvaturesFromAngle(poly, curvatureWindow, minAngleDeg, maxAngleDeg);
            const smoothed = laplacianSmoothing(poly, curvatures, laplaceLambdaMax, laplaceIterations, laplaceWindow);
            if (maxAreaDeviation > 0.0) {
                return visvalingamWhyatt(smoothed, maxAreaDeviation);
            }
            return smoothed;
        });
}

export function renderFromLDZ(ctx2d, ldzData, width, height, dpi, seed) {
    const outlines = outlinesFromLDZ(ldzData, width, height);

    ctx2d.fillStyle = '#fff';
    ctx2d.fillRect(0, 0, width, height);
    ctx2d.strokeStyle = '#000';
    ctx2d.fillStyle = '#D00';
    ctx2d.lineWidth = 1.0;
    ctx2d.lineCap = 'round';
    ctx2d.lineJoin = 'round';

    outlines.forEach(outline => {
        drawPolyline(ctx2d, outline, [0.5, 0.5]);
        drawPolylinePoints(ctx2d, outline, 2.0, [0.5, 0.5]);
    });
}
