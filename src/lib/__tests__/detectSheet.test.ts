import { describe, expect, it } from "vitest";
import { A4_LONG_CM, A4_SHORT_CM, approxPolygon, convexHull, hullToQuad, largestAreaQuad, resolveA4Size } from "../detectSheet";
import { quadArea } from "../homography";
import type { Point, Quad } from "../../types";

/** Samples the outline of a polygon densely, the way a blob boundary looks. */
function outline(corners: Point[], samplesPerEdge = 40): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    for (let s = 0; s < samplesPerEdge; s++) {
      const t = s / samplesPerEdge;
      pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return pts;
}

function perimeterOf(poly: Point[]): number {
  let p = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    p += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return p;
}

function cornersMatch(got: Quad, want: Point[], tolerance: number) {
  for (const w of want) {
    const nearest = Math.min(...got.map((g) => Math.hypot(g.x - w.x, g.y - w.y)));
    expect(nearest).toBeLessThanOrEqual(tolerance);
  }
}

describe("convexHull", () => {
  it("keeps only the corners of a filled rectangle", () => {
    const pts: Point[] = [];
    for (let x = 0; x <= 20; x++) for (let y = 0; y <= 10; y++) pts.push({ x, y });
    const hull = convexHull(pts);
    expect(hull).toHaveLength(4);
  });
});

describe("hullToQuad", () => {
  it("recovers an axis-aligned rectangle", () => {
    const corners = [
      { x: 100, y: 200 },
      { x: 340, y: 200 },
      { x: 340, y: 540 },
      { x: 100, y: 540 },
    ];
    const hull = convexHull(outline(corners));
    const quad = hullToQuad(hull, perimeterOf(hull));
    expect(quad).not.toBeNull();
    cornersMatch(quad!, corners, 3);
  });

  it("recovers a sheet rotated 45 degrees", () => {
    // The reference implementation picked corners by extremes of x±y, which
    // degenerates exactly here: all four corners tie on one of the two axes.
    const corners = [
      { x: 300, y: 100 },
      { x: 500, y: 300 },
      { x: 300, y: 500 },
      { x: 100, y: 300 },
    ];
    const hull = convexHull(outline(corners));
    const quad = hullToQuad(hull, perimeterOf(hull));
    expect(quad).not.toBeNull();
    cornersMatch(quad!, corners, 6);
    expect(quadArea(quad!)).toBeCloseTo(80000, -3);
  });

  it("recovers a perspective-skewed sheet", () => {
    const corners = [
      { x: 120, y: 210 },
      { x: 402, y: 188 },
      { x: 418, y: 596 },
      { x: 108, y: 560 },
    ];
    const hull = convexHull(outline(corners));
    const quad = hullToQuad(hull, perimeterOf(hull));
    expect(quad).not.toBeNull();
    cornersMatch(quad!, corners, 6);
  });

  it("orders the result top-left, top-right, bottom-right, bottom-left", () => {
    const corners = [
      { x: 120, y: 210 },
      { x: 402, y: 188 },
      { x: 418, y: 596 },
      { x: 108, y: 560 },
    ];
    const hull = convexHull(outline(corners));
    const q = hullToQuad(hull, perimeterOf(hull))!;
    expect(q[0].x).toBeLessThan(q[1].x); // TL left of TR
    expect(q[3].x).toBeLessThan(q[2].x); // BL left of BR
    expect(q[0].y).toBeLessThan(q[3].y); // TL above BL
    expect(q[1].y).toBeLessThan(q[2].y); // TR above BR
  });
});

describe("approxPolygon", () => {
  it("collapses a densely sampled triangle back to three vertices", () => {
    const hull = convexHull(outline([
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 200, y: 300 },
    ]));
    const approx = approxPolygon(hull, 0.05 * perimeterOf(hull));
    expect(approx.length).toBe(3);
  });
});

describe("largestAreaQuad", () => {
  it("picks the four extreme vertices of a hexagon", () => {
    const hex: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: -2 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 100, y: 102 },
      { x: 0, y: 100 },
    ];
    const quad = largestAreaQuad(hex);
    expect(quad).not.toBeNull();
    expect(quadArea(quad!)).toBeGreaterThan(19000);
  });
});

describe("resolveA4Size", () => {
  it("returns portrait dimensions for an upright sheet", () => {
    const q: Quad = [
      { x: 0, y: 0 },
      { x: 210, y: 0 },
      { x: 210, y: 297 },
      { x: 0, y: 297 },
    ];
    const r = resolveA4Size(q);
    expect(r.landscape).toBe(false);
    expect(r.widthCm).toBe(A4_SHORT_CM);
    expect(r.heightCm).toBe(A4_LONG_CM);
  });

  it("returns landscape dimensions for a sideways sheet", () => {
    const q: Quad = [
      { x: 0, y: 0 },
      { x: 297, y: 0 },
      { x: 297, y: 210 },
      { x: 0, y: 210 },
    ];
    const r = resolveA4Size(q);
    expect(r.landscape).toBe(true);
    expect(r.widthCm).toBe(A4_LONG_CM);
    expect(r.heightCm).toBe(A4_SHORT_CM);
  });

  it("still resolves orientation under perspective skew", () => {
    // Landscape sheet seen at an angle: edges are no longer axis-aligned.
    const q: Quad = [
      { x: 100, y: 120 },
      { x: 392, y: 96 },
      { x: 404, y: 300 },
      { x: 92, y: 286 },
    ];
    expect(resolveA4Size(q).landscape).toBe(true);
  });
});
