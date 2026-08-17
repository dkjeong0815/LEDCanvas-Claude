import { describe, expect, it } from "vitest";
import {
  applyHomography,
  computeHomography,
  invertMatrix3x3,
  orderQuad,
  quadArea,
  quadSideLengths,
} from "../homography";
import type { Point, Quad } from "../../types";

/** Projects wall-cm coordinates into photo pixels for a synthetic camera. */
function makeCamera(H: number[]) {
  return (p: Point) => applyHomography(H, p);
}

/** A mild oblique view: 1 cm ≈ 5 px, with real perspective foreshortening. */
const CAMERA: number[] = [5, 0.35, 120, 0.2, 5, 90, 0.00035, 0.00012, 1];

describe("computeHomography", () => {
  it("maps each source point onto its destination", () => {
    const src: Point[] = [
      { x: 10, y: 12 },
      { x: 210, y: 20 },
      { x: 220, y: 320 },
      { x: 5, y: 300 },
    ];
    const dst: Point[] = [
      { x: 0, y: 0 },
      { x: 21, y: 0 },
      { x: 21, y: 29.7 },
      { x: 0, y: 29.7 },
    ];
    const H = computeHomography(src, dst)!;
    expect(H).not.toBeNull();
    src.forEach((p, i) => {
      const out = applyHomography(H, p);
      expect(out.x).toBeCloseTo(dst[i].x, 6);
      expect(out.y).toBeCloseTo(dst[i].y, 6);
    });
  });

  it("returns null for degenerate (collinear) input", () => {
    const line: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    const dst: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    expect(computeHomography(line, dst)).toBeNull();
  });

  it("inverts back to the original points", () => {
    const src: Point[] = [
      { x: 10, y: 12 },
      { x: 210, y: 20 },
      { x: 220, y: 320 },
      { x: 5, y: 300 },
    ];
    const dst: Point[] = [
      { x: 0, y: 0 },
      { x: 21, y: 0 },
      { x: 21, y: 29.7 },
      { x: 0, y: 29.7 },
    ];
    const H = computeHomography(src, dst)!;
    const Hinv = invertMatrix3x3(H)!;
    src.forEach((p) => {
      const round = applyHomography(Hinv, applyHomography(H, p));
      expect(round.x).toBeCloseTo(p.x, 4);
      expect(round.y).toBeCloseTo(p.y, 4);
    });
  });
});

describe("orderQuad", () => {
  const canonical: Quad = [
    { x: 10, y: 10 },
    { x: 110, y: 14 },
    { x: 108, y: 90 },
    { x: 8, y: 86 },
  ];

  it("is a no-op on already-ordered input", () => {
    expect(orderQuad(canonical)).toEqual(canonical);
  });

  it("recovers the order from a shuffled quad", () => {
    const shuffled = [canonical[2], canonical[0], canonical[3], canonical[1]];
    expect(orderQuad(shuffled)).toEqual(canonical);
  });

  it("keeps a consistent winding for a diamond", () => {
    const diamond = [
      { x: 50, y: 0 },
      { x: 100, y: 50 },
      { x: 50, y: 100 },
      { x: 0, y: 50 },
    ];
    const ordered = orderQuad(diamond)!;
    expect(ordered).toHaveLength(4);
    expect(quadArea(ordered)).toBeCloseTo(5000, 6);
  });
});

describe("quadSideLengths", () => {
  it("reports width and height of a straight-on rectangle", () => {
    const q: Quad = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 200 },
      { x: 0, y: 200 },
    ];
    const { width, height } = quadSideLengths(q);
    expect(width).toBeCloseTo(300);
    expect(height).toBeCloseTo(200);
  });
});

describe("end-to-end scale recovery", () => {
  /**
   * Places a reference sheet of a known real size on a synthetic wall, projects
   * it through a camera, then recovers the wall size from the projection alone.
   */
  function recoverWallSize(sheetWCm: number, sheetHCm: number, refWCm: number, refHCm: number) {
    const project = makeCamera(CAMERA);
    const originCm = { x: 40, y: 30 };
    const sheetCm: Point[] = [
      { x: originCm.x, y: originCm.y },
      { x: originCm.x + sheetWCm, y: originCm.y },
      { x: originCm.x + sheetWCm, y: originCm.y + sheetHCm },
      { x: originCm.x, y: originCm.y + sheetHCm },
    ];
    const sheetPx = sheetCm.map(project);

    const toCm = computeHomography(sheetPx, [
      { x: 0, y: 0 },
      { x: refWCm, y: 0 },
      { x: refWCm, y: refHCm },
      { x: 0, y: refHCm },
    ])!;

    // Photo frame chosen to comfortably contain the projected wall.
    const frame = [
      { x: 0, y: 0 },
      { x: 1600, y: 0 },
      { x: 1600, y: 1200 },
      { x: 0, y: 1200 },
    ];
    const cm = frame.map((p) => applyHomography(toCm, p));
    const xs = cm.map((p) => p.x);
    const ys = cm.map((p) => p.y);
    return {
      widthCm: Math.max(...xs) - Math.min(...xs),
      heightCm: Math.max(...ys) - Math.min(...ys),
    };
  }

  it("recovers the same wall from a portrait sheet", () => {
    const truth = recoverWallSize(21, 29.7, 21, 29.7);
    expect(truth.widthCm).toBeGreaterThan(0);
    expect(truth.heightCm).toBeGreaterThan(0);
  });

  it("recovers the SAME wall from a landscape sheet when orientation is honoured", () => {
    const portrait = recoverWallSize(21, 29.7, 21, 29.7);
    const landscape = recoverWallSize(29.7, 21, 29.7, 21);
    // Same physical wall, same camera — the recovered size must agree.
    expect(landscape.widthCm).toBeCloseTo(portrait.widthCm, 4);
    expect(landscape.heightCm).toBeCloseTo(portrait.heightCm, 4);
  });

  it("gets the wall wrong when a landscape sheet is assumed portrait (the bug this guards)", () => {
    const correct = recoverWallSize(29.7, 21, 29.7, 21);
    const assumedPortrait = recoverWallSize(29.7, 21, 21, 29.7);
    const errX = Math.abs(assumedPortrait.widthCm - correct.widthCm) / correct.widthCm;
    const errY = Math.abs(assumedPortrait.heightCm - correct.heightCm) / correct.heightCm;
    expect(Math.max(errX, errY)).toBeGreaterThan(0.2);
  });
});
