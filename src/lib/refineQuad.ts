import type { Point, Quad } from "../types";
import { orderQuad } from "./homography";

export interface Line {
  /** unit normal */
  nx: number;
  ny: number;
  /** nx*x + ny*y = c */
  c: number;
}

/**
 * Total-least-squares line fit (principal axis through the centroid).
 * Unlike y = ax + b it handles vertical edges, which is essential here.
 */
export function fitLine(points: Point[]): Line | null {
  const n = points.length;
  if (n < 2) return null;

  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  // Smallest-eigenvalue eigenvector of the covariance matrix is the normal.
  const diff = sxx - syy;
  const theta = 0.5 * Math.atan2(2 * sxy, diff);
  // Principal direction (largest spread) is (cos, sin); the normal is perpendicular.
  const nx = -Math.sin(theta);
  const ny = Math.cos(theta);
  const len = Math.hypot(nx, ny);
  if (len < 1e-12) return null;

  return { nx: nx / len, ny: ny / len, c: (nx * mx + ny * my) / len };
}

/** Intersection of two lines, or null if they are (near) parallel. */
export function intersectLines(a: Line, b: Line): Point | null {
  const det = a.nx * b.ny - a.ny * b.nx;
  if (Math.abs(det) < 1e-9) return null;
  return {
    x: (a.c * b.ny - a.ny * b.c) / det,
    y: (a.nx * b.c - a.c * b.nx) / det,
  };
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Replaces four corner *estimates* with the intersections of four fitted edge
 * lines.
 *
 * Corner points are the noisiest thing on a blob — each is a single pixel
 * decision. Every edge, by contrast, is supported by hundreds of boundary
 * pixels, so fitting lines and intersecting them pushes the corners to
 * sub-pixel accuracy. That matters disproportionately here: the reference
 * rectangle is small relative to the photo, so any corner error is amplified
 * as the homography is extrapolated across the whole wall.
 */
export function refineQuadFromBoundary(coarse: Quad, boundary: Point[], tolerance: number): Quad | null {
  const buckets: Point[][] = [[], [], [], []];

  for (const p of boundary) {
    let bestEdge = -1;
    let bestDist = Infinity;
    let secondDist = Infinity;
    for (let e = 0; e < 4; e++) {
      const d = distanceToSegment(p, coarse[e], coarse[(e + 1) % 4]);
      if (d < bestDist) {
        secondDist = bestDist;
        bestDist = d;
        bestEdge = e;
      } else if (d < secondDist) {
        secondDist = d;
      }
    }
    // Skip points near a corner: they belong to two edges and would bend both.
    if (bestDist > tolerance) continue;
    if (secondDist < tolerance * 2.5) continue;
    buckets[bestEdge].push(p);
  }

  const lines: Line[] = [];
  for (let e = 0; e < 4; e++) {
    if (buckets[e].length < 8) return null;
    const line = fitLine(buckets[e]);
    if (!line) return null;
    lines.push(line);
  }

  const corners: Point[] = [];
  for (let e = 0; e < 4; e++) {
    // Corner e is where edge (e-1) meets edge e.
    const p = intersectLines(lines[(e + 3) % 4], lines[e]);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    corners.push(p);
  }

  // A refined corner that ran away from its estimate means the fit went wrong.
  for (let e = 0; e < 4; e++) {
    if (Math.hypot(corners[e].x - coarse[e].x, corners[e].y - coarse[e].y) > tolerance * 4) return null;
  }

  return orderQuad(corners);
}
