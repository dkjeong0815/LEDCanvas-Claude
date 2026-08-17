import { describe, expect, it } from "vitest";
import { clampToBounds, findFreeSpot, fitsInBounds, overlapsAny, rectsOverlap } from "../geometry";
import type { RectCm } from "../../types";

const bounds: RectCm = { xCm: 0, yCm: 0, widthCm: 400, heightCm: 300 };

describe("rectsOverlap", () => {
  it("detects a genuine overlap", () => {
    expect(
      rectsOverlap({ xCm: 0, yCm: 0, widthCm: 10, heightCm: 10 }, { xCm: 5, yCm: 5, widthCm: 10, heightCm: 10 })
    ).toBe(true);
  });

  it("treats touching edges as not overlapping", () => {
    expect(
      rectsOverlap({ xCm: 0, yCm: 0, widthCm: 10, heightCm: 10 }, { xCm: 10, yCm: 0, widthCm: 10, heightCm: 10 })
    ).toBe(false);
  });
});

describe("clampToBounds", () => {
  it("slides a rect back inside without resizing", () => {
    const r = clampToBounds({ xCm: 380, yCm: -20, widthCm: 64, heightCm: 48 }, bounds);
    expect(r.widthCm).toBe(64);
    expect(r.heightCm).toBe(48);
    expect(r.xCm).toBeCloseTo(336);
    expect(r.yCm).toBeCloseTo(0);
    expect(fitsInBounds(r, bounds)).toBe(true);
  });
});

describe("findFreeSpot", () => {
  it("places the first layer at the wall's origin", () => {
    const spot = findFreeSpot(64, 48, bounds, []);
    expect(spot).not.toBeNull();
    expect(spot!.xCm).toBeCloseTo(bounds.xCm);
    expect(spot!.yCm).toBeCloseTo(bounds.yCm);
  });

  it("finds a non-overlapping spot when the first position is taken", () => {
    const first = findFreeSpot(64, 48, bounds, [])!;
    const second = findFreeSpot(64, 48, bounds, [first]);
    expect(second).not.toBeNull();
    expect(overlapsAny(second!, [first])).toBe(false);
    expect(fitsInBounds(second!, bounds)).toBe(true);
  });

  it("returns null when the layer cannot fit at all", () => {
    expect(findFreeSpot(500, 48, bounds, [])).toBeNull();
  });

  it("keeps packing layers onto the wall until it is genuinely full", () => {
    const placed: RectCm[] = [];
    for (let i = 0; i < 40; i++) {
      const spot = findFreeSpot(64, 48, bounds, placed);
      if (!spot) break;
      expect(fitsInBounds(spot, bounds)).toBe(true);
      expect(overlapsAny(spot, placed)).toBe(false);
      placed.push(spot);
    }
    // A 400x300 wall holds 6 cabinets of 64x48 across a 6x6 grid with room to
    // spare; anything close to 1 means the search is missing valid positions.
    expect(placed.length).toBeGreaterThanOrEqual(6);
  });

  it("finds a second spot on a wall only slightly larger than two cabinets", () => {
    const tight: RectCm = { xCm: -30, yCm: -20, widthCm: 160, heightCm: 120 };
    const first = findFreeSpot(64, 48, tight, [])!;
    const second = findFreeSpot(64, 48, tight, [first]);
    expect(second).not.toBeNull();
    expect(fitsInBounds(second!, tight)).toBe(true);
    expect(overlapsAny(second!, [first])).toBe(false);
  });
});
