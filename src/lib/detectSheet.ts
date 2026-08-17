import type { Point, Quad } from "../types";
import { orderQuad, quadArea, quadSideLengths } from "./homography";
import { refineQuadFromBoundary } from "./refineQuad";

const WORK_MAX_DIM = 720;
const REFINE_MAX_DIM = 1400;
const MIN_AREA_RATIO = 0.004;
const MAX_AREA_RATIO = 0.8;

export interface SheetDetection {
  /** corners on the ORIGINAL photo, natural px, ordered TL/TR/BR/BL */
  quad: Quad;
  /** fraction of the frame the sheet covers */
  areaRatio: number;
  /** how rectangular the detected shape is, 0..1 (1 = perfect rectangle) */
  rectangularity: number;
  /** true when the full-resolution edge-fitting pass succeeded */
  refined: boolean;
}

export type DetectFailure =
  | "no-bright-region"
  | "region-too-small"
  | "region-too-large"
  | "covers-frame"
  | "not-quadrilateral"
  | "not-rectangular"
  | "canvas-unavailable";

export type DetectOutcome =
  | { ok: true; detection: SheetDetection }
  | { ok: false; reason: DetectFailure };

function otsuThreshold(hist: number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varBetween > maxVar) {
      maxVar = varBetween;
      threshold = t;
    }
  }
  return threshold;
}

interface BlobResult {
  /** pixels on the outline of the largest bright component, canvas coords */
  boundary: Point[];
  pixelCount: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Otsu-thresholds a canvas, then returns the outline of the largest bright
 * 4-connected component. Shared by the coarse locate pass and the full-
 * resolution refinement pass.
 */
function largestBrightBlob(data: Uint8ClampedArray, w: number, h: number, minLevel: number): BlobResult | null {
  const gray = new Uint8ClampedArray(w * h);
  const hist = new Array(256).fill(0);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
    gray[p] = g;
    hist[g]++;
  }

  const threshold = Math.max(otsuThreshold(hist, w * h), minLevel);
  const bright = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) bright[i] = gray[i] >= threshold ? 1 : 0;

  const visited = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);

  let bestPixels: Int32Array | null = null;
  let bestCount = 0;
  let bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  for (let start = 0; start < w * h; start++) {
    if (!bright[start] || visited[start]) continue;

    let sp = 0;
    stack[sp++] = start;
    visited[start] = 1;
    const pixels: number[] = [];
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;

    while (sp > 0) {
      const idx = stack[--sp];
      const cx = idx % w;
      const cy = (idx - cx) / w;
      pixels.push(idx);
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      if (cx > 0 && bright[idx - 1] && !visited[idx - 1]) {
        visited[idx - 1] = 1;
        stack[sp++] = idx - 1;
      }
      if (cx < w - 1 && bright[idx + 1] && !visited[idx + 1]) {
        visited[idx + 1] = 1;
        stack[sp++] = idx + 1;
      }
      if (cy > 0 && bright[idx - w] && !visited[idx - w]) {
        visited[idx - w] = 1;
        stack[sp++] = idx - w;
      }
      if (cy < h - 1 && bright[idx + w] && !visited[idx + w]) {
        visited[idx + w] = 1;
        stack[sp++] = idx + w;
      }
    }

    if (pixels.length > bestCount) {
      bestCount = pixels.length;
      bestPixels = Int32Array.from(pixels);
      bounds = { minX, maxX, minY, maxY };
    }
  }

  if (!bestPixels) return null;

  const boundary: Point[] = [];
  for (let i = 0; i < bestPixels.length; i++) {
    const idx = bestPixels[i];
    const x = idx % w;
    const y = (idx - x) / w;
    const interior =
      x > 0 &&
      x < w - 1 &&
      y > 0 &&
      y < h - 1 &&
      bright[idx - 1] &&
      bright[idx + 1] &&
      bright[idx - w] &&
      bright[idx + w];
    if (!interior) boundary.push({ x, y });
  }

  return { boundary, pixelCount: bestCount, ...bounds };
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Andrew's monotone chain convex hull, counter-clockwise, no repeated endpoint. */
export function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/** Ramer-Douglas-Peucker on an open polyline. */
function simplifyOpen(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points.slice();
  let maxDist = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist <= epsilon) return [first, last];
  const left = simplifyOpen(points.slice(0, index + 1), epsilon);
  const right = simplifyOpen(points.slice(index), epsilon);
  return left.slice(0, -1).concat(right);
}

/** Closed-polygon simplification, mirroring OpenCV's approxPolyDP(closed=true). */
export function approxPolygon(hull: Point[], epsilon: number): Point[] {
  if (hull.length <= 3) return hull.slice();
  // Split the closed loop at the two mutually farthest vertices so RDP sees
  // two open chains — otherwise the first/last vertex can never be dropped.
  let iA = 0;
  let iB = 0;
  let best = -1;
  for (let i = 0; i < hull.length; i++) {
    for (let j = i + 1; j < hull.length; j++) {
      const d = Math.hypot(hull[j].x - hull[i].x, hull[j].y - hull[i].y);
      if (d > best) {
        best = d;
        iA = i;
        iB = j;
      }
    }
  }
  const chain1 = hull.slice(iA, iB + 1);
  const chain2 = hull.slice(iB).concat(hull.slice(0, iA + 1));
  const s1 = simplifyOpen(chain1, epsilon);
  const s2 = simplifyOpen(chain2, epsilon);
  return s1.slice(0, -1).concat(s2.slice(0, -1));
}

/**
 * Reduces a convex hull to exactly four corners by binary-searching the RDP
 * tolerance. This is orientation-agnostic, unlike picking extremes of x±y,
 * which collapses when the sheet sits at ~45°.
 */
export function hullToQuad(hull: Point[], perimeter: number): Quad | null {
  if (hull.length < 4) return null;
  if (hull.length === 4) return orderQuad(hull);

  let lo = 0.001 * perimeter;
  let hi = 0.25 * perimeter;
  let fallback: Point[] | null = null;

  for (let iter = 0; iter < 24; iter++) {
    const mid = (lo + hi) / 2;
    const approx = approxPolygon(hull, mid);
    if (approx.length === 4) return orderQuad(approx);
    if (approx.length > 4) {
      lo = mid;
      fallback = approx;
    } else {
      hi = mid;
    }
  }

  // Never landed exactly on 4: take the best over-shoot and keep the four
  // vertices that enclose the most area.
  if (fallback && fallback.length > 4) return largestAreaQuad(fallback);
  return null;
}

/** Brute-force the 4 vertices of a small convex polygon that maximise area. */
export function largestAreaQuad(poly: Point[]): Quad | null {
  const n = poly.length;
  if (n < 4) return null;
  if (n > 40) return null; // guard: this is O(n^4)
  let best: Quad | null = null;
  let bestArea = -1;
  for (let a = 0; a < n - 3; a++) {
    for (let b = a + 1; b < n - 2; b++) {
      for (let c = b + 1; c < n - 1; c++) {
        for (let d = c + 1; d < n; d++) {
          const q: Quad = [poly[a], poly[b], poly[c], poly[d]];
          const area = quadArea(q);
          if (area > bestArea) {
            bestArea = area;
            best = q;
          }
        }
      }
    }
  }
  return best ? orderQuad(best) : null;
}

/**
 * Finds the brightest rectangular region in the photo — the reference sheet.
 *
 * 1) downscale, grayscale, Otsu threshold to isolate "bright"
 * 2) largest 4-connected bright component (iterative flood fill)
 * 3) convex hull → 4 corners via tolerance-searched polygon approximation
 * 4) reject results that are not plausibly a sheet
 * 5) refine those corners against the full-resolution edges
 *
 * Runs entirely on-device: the photo never leaves the browser.
 */
export function detectSheet(image: CanvasImageSource & { naturalWidth: number; naturalHeight: number }): DetectOutcome {
  const naturalW = image.naturalWidth;
  const naturalH = image.naturalHeight;
  if (!naturalW || !naturalH) return { ok: false, reason: "canvas-unavailable" };

  const scale = Math.min(1, WORK_MAX_DIM / Math.max(naturalW, naturalH));
  const w = Math.max(1, Math.round(naturalW * scale));
  const h = Math.max(1, Math.round(naturalH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { ok: false, reason: "canvas-unavailable" };
  ctx.drawImage(image, 0, 0, w, h);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return { ok: false, reason: "canvas-unavailable" };
  }

  const coarse = largestBrightBlob(data, w, h, 110);
  if (!coarse) return { ok: false, reason: "no-bright-region" };

  const areaRatio = coarse.pixelCount / (w * h);
  if (areaRatio < MIN_AREA_RATIO) return { ok: false, reason: "region-too-small" };
  if (areaRatio > MAX_AREA_RATIO) return { ok: false, reason: "region-too-large" };

  // A blob touching every edge is the wall or the sky, not a sheet on it.
  if (coarse.minX <= 1 && coarse.maxX >= w - 2 && coarse.minY <= 1 && coarse.maxY >= h - 2) {
    return { ok: false, reason: "covers-frame" };
  }

  const hull = convexHull(coarse.boundary);
  let perimeter = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    perimeter += Math.hypot(b.x - a.x, b.y - a.y);
  }

  const quadSmall = hullToQuad(hull, perimeter);
  if (!quadSmall) return { ok: false, reason: "not-quadrilateral" };

  // A real sheet fills nearly all of its own quad; an L-shaped highlight does not.
  const qArea = quadArea(quadSmall);
  const rectangularity = qArea > 0 ? Math.min(1, coarse.pixelCount / qArea) : 0;
  if (rectangularity < 0.75) return { ok: false, reason: "not-rectangular" };

  const inv = 1 / scale;
  const coarseNatural = quadSmall.map((p) => ({ x: p.x * inv, y: p.y * inv })) as Quad;

  const refined = refineAtFullResolution(image, naturalW, naturalH, coarseNatural);
  const quad = refined ?? coarseNatural;

  return { ok: true, detection: { quad, areaRatio, rectangularity, refined: refined !== null } };
}

/**
 * Second pass: re-find the sheet's outline in the original pixels and replace
 * the corner estimates with intersections of least-squares edge lines.
 *
 * The locate pass runs on a downscaled copy, so its corners carry a couple of
 * source pixels of error. That sounds negligible until you remember the
 * homography is extrapolated from a small rectangle across the whole photo:
 * a 2 px skew on an A4 turned into a 3% error on the wall in testing. Fitting
 * lines over hundreds of full-resolution edge pixels removes most of it.
 */
function refineAtFullResolution(
  image: CanvasImageSource,
  naturalW: number,
  naturalH: number,
  coarse: Quad
): Quad | null {
  const xs = coarse.map((p) => p.x);
  const ys = coarse.map((p) => p.y);
  const pad = 0.12 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));

  const sx = Math.max(0, Math.floor(Math.min(...xs) - pad));
  const sy = Math.max(0, Math.floor(Math.min(...ys) - pad));
  const sw = Math.min(naturalW - sx, Math.ceil(Math.max(...xs) + pad) - sx);
  const sh = Math.min(naturalH - sy, Math.ceil(Math.max(...ys) + pad) - sy);
  if (sw < 8 || sh < 8) return null;

  // Bound the work: a sheet filling a 48MP photo does not need every pixel.
  const cropScale = Math.min(1, REFINE_MAX_DIM / Math.max(sw, sh));
  const cw = Math.max(1, Math.round(sw * cropScale));
  const ch = Math.max(1, Math.round(sh * cropScale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, cw, ch);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, cw, ch).data;
  } catch {
    return null;
  }

  const blob = largestBrightBlob(data, cw, ch, 110);
  if (!blob) return null;

  const toCrop = (p: Point): Point => ({ x: (p.x - sx) * cropScale, y: (p.y - sy) * cropScale });
  const coarseInCrop = coarse.map(toCrop) as Quad;

  const { width, height } = quadSideLengths(coarseInCrop);
  const tolerance = Math.max(3, Math.min(width, height) * 0.12);

  const refinedCrop = refineQuadFromBoundary(coarseInCrop, blob.boundary, tolerance);
  if (!refinedCrop) return null;

  const back = (p: Point): Point => ({ x: p.x / cropScale + sx, y: p.y / cropScale + sy });
  return refinedCrop.map(back) as Quad;
}

export const A4_SHORT_CM = 21;
export const A4_LONG_CM = 29.7;

/**
 * Picks the A4 orientation that matches the detected quad.
 *
 * The reference version hard-coded 21 × 29.7, so a sheet taped sideways was
 * silently calibrated against the wrong edges — every downstream measurement
 * came out wrong (and still passed the plausibility checks). Comparing the
 * quad's own mean side lengths recovers the orientation.
 */
export function resolveA4Size(quad: Quad): { widthCm: number; heightCm: number; landscape: boolean } {
  const { width, height } = quadSideLengths(quad);
  const landscape = width > height;
  return landscape
    ? { widthCm: A4_LONG_CM, heightCm: A4_SHORT_CM, landscape }
    : { widthCm: A4_SHORT_CM, heightCm: A4_LONG_CM, landscape };
}

export const FAILURE_MESSAGES: Record<DetectFailure, string> = {
  "no-bright-region": "사진에서 밝은 영역을 찾지 못했습니다.",
  "region-too-small": "기준 용지로 보기에 너무 작은 영역만 찾았습니다. 용지가 더 크게 나오도록 가까이서 찍어보세요.",
  "region-too-large": "밝은 영역이 사진 대부분을 차지합니다. 용지와 벽의 밝기 차이가 큰 사진이 필요합니다.",
  "covers-frame": "밝은 영역이 화면 전체에 걸쳐 있어 기준 용지를 구분할 수 없습니다.",
  "not-quadrilateral": "찾은 영역이 사각형 모양이 아닙니다. 용지 전체가 가려지지 않게 촬영해보세요.",
  "not-rectangular": "찾은 영역의 모양이 용지와 다릅니다. 그림자나 반사가 적은 사진일수록 잘 인식됩니다.",
  "canvas-unavailable": "이미지를 분석할 수 없습니다.",
};
