import type { Matrix3x3, Point, Quad } from "../types";

/**
 * Gauss-Jordan elimination with partial pivoting on an augmented matrix
 * (each row = n coefficients + 1 RHS). Returns null if the system is singular.
 */
function solveLinearSystem(rows: number[][]): number[] | null {
  const n = rows.length;
  const m = rows.map((r) => r.slice());

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivotRow][col])) pivotRow = r;
    }
    [m[col], m[pivotRow]] = [m[pivotRow], m[col]];

    const pivot = m[col][col];
    if (Math.abs(pivot) < 1e-9) return null;

    for (let c = col; c <= n; c++) m[col][c] /= pivot;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }

  return m.map((row) => row[n]);
}

/**
 * The 3x3 projective homography mapping each src[i] onto dst[i]
 * (4-point DLT, equivalent to OpenCV's getPerspectiveTransform).
 * Row-major [h0..h8] with h8 = 1.
 */
export function computeHomography(src: Point[], dst: Point[]): Matrix3x3 | null {
  if (src.length !== 4 || dst.length !== 4) return null;

  const rows: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: X, y: Y } = dst[i];
    rows.push([x, y, 1, 0, 0, 0, -x * X, -y * X, X]);
    rows.push([0, 0, 0, x, y, 1, -x * Y, -y * Y, Y]);
  }

  const h = solveLinearSystem(rows);
  if (!h) return null;
  return [...h, 1];
}

/** Applies a homography to a point, including the perspective divide. */
export function applyHomography(H: Matrix3x3, p: Point): Point {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  if (Math.abs(w) < 1e-9) return { x: NaN, y: NaN };
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w,
  };
}

/** Row-major 3x3 product, A·B. */
export function multiply3x3(A: Matrix3x3, B: Matrix3x3): Matrix3x3 {
  const out = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += A[r * 3 + k] * B[k * 3 + c];
      out[r * 3 + c] = sum;
    }
  }
  return out;
}

/** In-plane rotation by `radians`, as a homogeneous 3x3. */
export function rotation3x3(radians: number): Matrix3x3 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [cos, -sin, 0, sin, cos, 0, 0, 0, 1];
}

/** Analytic inverse of a row-major 3x3. */
export function invertMatrix3x3(H: Matrix3x3): Matrix3x3 | null {
  const [a, b, c, d, e, f, g, h, i] = H;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  return [
    (e * i - f * h) * inv,
    (c * h - b * i) * inv,
    (b * f - c * e) * inv,
    (f * g - d * i) * inv,
    (a * i - c * g) * inv,
    (c * d - a * f) * inv,
    (d * h - e * g) * inv,
    (b * g - a * h) * inv,
    (a * e - b * d) * inv,
  ];
}

/** Area of a quadrilateral via the shoelace formula. */
export function quadArea(q: Quad): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Orders four arbitrary points into TL → TR → BR → BL.
 * Sorting by angle around the centroid gives a consistent winding; we then
 * rotate the cycle so it starts at the corner nearest the top-left.
 */
export function orderQuad(points: Point[]): Quad | null {
  if (points.length !== 4) return null;
  const cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
  const cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;

  const byAngle = points
    .map((p) => ({ p, a: Math.atan2(p.y - cy, p.x - cx) }))
    .sort((l, r) => l.a - r.a)
    .map((e) => e.p);

  let startIdx = 0;
  let bestScore = Infinity;
  for (let i = 0; i < 4; i++) {
    const score = byAngle[i].x + byAngle[i].y;
    if (score < bestScore) {
      bestScore = score;
      startIdx = i;
    }
  }

  return [
    byAngle[startIdx],
    byAngle[(startIdx + 1) % 4],
    byAngle[(startIdx + 2) % 4],
    byAngle[(startIdx + 3) % 4],
  ];
}

/**
 * Mean side lengths of a quad ordered TL/TR/BR/BL.
 * Used to decide whether a detected sheet is portrait or landscape.
 */
export function quadSideLengths(q: Quad): { width: number; height: number } {
  const d = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
  return {
    width: (d(q[0], q[1]) + d(q[3], q[2])) / 2,
    height: (d(q[0], q[3]) + d(q[1], q[2])) / 2,
  };
}

export interface RectifyResult {
  canvas: HTMLCanvasElement;
  widthPx: number;
  heightPx: number;
  pxPerCm: number;
  originCm: Point;
}

export interface RectifyOptions {
  /** hard cap on the rectified canvas's longest side */
  maxDimPx?: number;
  /** cap on total output pixels, so a wild homography can't allocate GBs */
  maxPixels?: number;
}

/**
 * Warps the whole photo onto the wall's cm plane, removing perspective.
 * The calibration rectangle lies flat on the wall, so the same homography is
 * valid for every other point on that plane — the entire photo can be
 * rectified, not just the reference rectangle.
 *
 * Returns a canvas (not a data URL): the caller decides how to hand it to the
 * DOM, which avoids materialising a multi-MB base64 string in application state.
 */
export function rectifyImage(
  image: CanvasImageSource & { naturalWidth?: number; width?: number },
  toCm: Matrix3x3,
  toImage: Matrix3x3,
  opts: RectifyOptions = {}
): RectifyResult | null {
  const w = (image.naturalWidth ?? image.width) as number;
  const h = ((image as { naturalHeight?: number; height?: number }).naturalHeight ??
    (image as { height?: number }).height) as number;
  if (!w || !h) return null;

  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ].map((p) => applyHomography(toCm, p));

  if (corners.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;

  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanXCm = maxX - minX;
  const spanYCm = maxY - minY;
  if (!(spanXCm > 0) || !(spanYCm > 0)) return null;

  const maxDim = opts.maxDimPx ?? 1800;
  const maxPixels = opts.maxPixels ?? 4_000_000;

  let pxPerCm = maxDim / Math.max(spanXCm, spanYCm);
  if (spanXCm * spanYCm * pxPerCm * pxPerCm > maxPixels) {
    pxPerCm = Math.sqrt(maxPixels / (spanXCm * spanYCm));
  }

  const widthPx = Math.max(1, Math.round(spanXCm * pxPerCm));
  const heightPx = Math.max(1, Math.round(spanYCm * pxPerCm));

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = w;
  srcCanvas.height = h;
  const sctx = srcCanvas.getContext("2d", { willReadFrequently: true });
  if (!sctx) return null;
  sctx.drawImage(image, 0, 0, w, h);

  let srcData: Uint8ClampedArray;
  try {
    srcData = sctx.getImageData(0, 0, w, h).data;
  } catch {
    return null; // tainted canvas
  }

  const dstCanvas = document.createElement("canvas");
  dstCanvas.width = widthPx;
  dstCanvas.height = heightPx;
  const dctx = dstCanvas.getContext("2d");
  if (!dctx) return null;
  const dstImageData = dctx.createImageData(widthPx, heightPx);
  const dstData = dstImageData.data;

  // Incremental evaluation of the projective map: walking one pixel in x adds a
  // constant to each of the numerator/denominator accumulators, so the inner
  // loop needs no multiplications beyond the perspective divide.
  const [a, b, c, d, e, f, g, hh, i] = toImage;
  const stepX = 1 / pxPerCm;

  for (let py = 0; py < heightPx; py++) {
    const yCm = minY + py / pxPerCm;
    let numX = a * minX + b * yCm + c;
    let numY = d * minX + e * yCm + f;
    let den = g * minX + hh * yCm + i;
    const dNumX = a * stepX;
    const dNumY = d * stepX;
    const dDen = g * stepX;

    let di = py * widthPx * 4;
    for (let px = 0; px < widthPx; px++, di += 4) {
      const sx = numX / den;
      const sy = numY / den;
      numX += dNumX;
      numY += dNumY;
      den += dDen;

      if (!(sx >= 0) || !(sy >= 0) || sx >= w - 1 || sy >= h - 1) {
        dstData[di] = 0;
        dstData[di + 1] = 0;
        dstData[di + 2] = 0;
        dstData[di + 3] = 0; // transparent = outside the photo
        continue;
      }

      const x0 = sx | 0;
      const y0 = sy | 0;
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * w + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + w * 4;
      const i11 = i01 + 4;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      dstData[di] = srcData[i00] * w00 + srcData[i10] * w10 + srcData[i01] * w01 + srcData[i11] * w11;
      dstData[di + 1] =
        srcData[i00 + 1] * w00 + srcData[i10 + 1] * w10 + srcData[i01 + 1] * w01 + srcData[i11 + 1] * w11;
      dstData[di + 2] =
        srcData[i00 + 2] * w00 + srcData[i10 + 2] * w10 + srcData[i01 + 2] * w01 + srcData[i11 + 2] * w11;
      dstData[di + 3] = 255;
    }
  }

  dctx.putImageData(dstImageData, 0, 0);

  return {
    canvas: dstCanvas,
    widthPx,
    heightPx,
    pxPerCm,
    originCm: { x: minX, y: minY },
  };
}
