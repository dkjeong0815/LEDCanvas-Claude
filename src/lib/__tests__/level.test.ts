import { describe, expect, it } from "vitest";
import {
  applyHomography,
  computeHomography,
  multiply3x3,
  rotation3x3,
} from "../homography";
import type { Matrix3x3, Point, Quad } from "../../types";

/**
 * Mirrors calibrate.ts's levelToPhoto(). Kept here rather than exported from
 * the module because calibrate.ts pulls in canvas code that node cannot load.
 */
function levelToPhoto(toCm: Matrix3x3, photoWidth: number, photoHeight: number): Matrix3x3 {
  const left = applyHomography(toCm, { x: 0, y: photoHeight / 2 });
  const right = applyHomography(toCm, { x: photoWidth, y: photoHeight / 2 });
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  if (Math.hypot(dx, dy) < 1e-9) return toCm;
  return multiply3x3(rotation3x3(-Math.atan2(dy, dx)), toCm);
}

const PHOTO_W = 4000;
const PHOTO_H = 1868;

/** Angle of the photo's horizontal centre line once mapped into cm space. */
function horizonAngleDeg(H: Matrix3x3): number {
  const a = applyHomography(H, { x: 0, y: PHOTO_H / 2 });
  const b = applyHomography(H, { x: PHOTO_W, y: PHOTO_H / 2 });
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * An A4 measured off a real site photo, taped about 1.6 degrees crooked —
 * the case that used to rotate the whole rectified wall.
 */
const CROOKED_A4: Quad = [
  { x: 2126.1, y: 742.3 },
  { x: 2261.0, y: 738.6 },
  { x: 2261.0, y: 927.7 },
  { x: 2128.6, y: 930.9 },
];

const A4_PORTRAIT: Point[] = [
  { x: 0, y: 0 },
  { x: 21, y: 0 },
  { x: 21, y: 29.7 },
  { x: 0, y: 29.7 },
];

describe("levelToPhoto", () => {
  it("reproduces the tilt when levelling is off", () => {
    const raw = computeHomography(CROOKED_A4, A4_PORTRAIT)!;
    // The reported bug. 1.39° along the centre line; the photo's top edge tilts
    // 1.88° because shear adds to the rotation as you move away from the sheet.
    expect(Math.abs(horizonAngleDeg(raw))).toBeGreaterThan(1.2);
  });

  it("puts the photo's horizon back to level", () => {
    const raw = computeHomography(CROOKED_A4, A4_PORTRAIT)!;
    const levelled = levelToPhoto(raw, PHOTO_W, PHOTO_H);
    expect(Math.abs(horizonAngleDeg(levelled))).toBeLessThan(1e-6);
  });

  it("does not change any measured distance", () => {
    const raw = computeHomography(CROOKED_A4, A4_PORTRAIT)!;
    const levelled = levelToPhoto(raw, PHOTO_W, PHOTO_H);

    const probes: Point[] = [
      { x: 0, y: 0 },
      { x: PHOTO_W, y: 0 },
      { x: PHOTO_W, y: PHOTO_H },
      { x: 0, y: PHOTO_H },
      { x: 2126, y: 742 },
      { x: 2261, y: 928 },
    ];

    for (let i = 0; i < probes.length; i++) {
      for (let j = i + 1; j < probes.length; j++) {
        const before = distance(applyHomography(raw, probes[i]), applyHomography(raw, probes[j]));
        const after = distance(applyHomography(levelled, probes[i]), applyHomography(levelled, probes[j]));
        expect(after).toBeCloseTo(before, 6);
      }
    }
  });

  it("keeps the reference rectangle's real size intact", () => {
    const raw = computeHomography(CROOKED_A4, A4_PORTRAIT)!;
    const levelled = levelToPhoto(raw, PHOTO_W, PHOTO_H);
    const corners = CROOKED_A4.map((p) => applyHomography(levelled, p));
    expect(distance(corners[0], corners[1])).toBeCloseTo(21, 6);
    expect(distance(corners[0], corners[3])).toBeCloseTo(29.7, 6);
  });

  it("leaves the perspective row untouched", () => {
    const raw = computeHomography(CROOKED_A4, A4_PORTRAIT)!;
    const levelled = levelToPhoto(raw, PHOTO_W, PHOTO_H);
    expect(levelled[6]).toBeCloseTo(raw[6], 12);
    expect(levelled[7]).toBeCloseTo(raw[7], 12);
    expect(levelled[8]).toBeCloseTo(raw[8], 12);
  });

  it("is a no-op for a sheet that is already square to the photo", () => {
    const straight: Quad = [
      { x: 700, y: 450 },
      { x: 910, y: 450 },
      { x: 910, y: 747 },
      { x: 700, y: 747 },
    ];
    const raw = computeHomography(straight, A4_PORTRAIT)!;
    const levelled = levelToPhoto(raw, PHOTO_W, PHOTO_H);
    for (let i = 0; i < 9; i++) expect(levelled[i]).toBeCloseTo(raw[i], 9);
  });
});
