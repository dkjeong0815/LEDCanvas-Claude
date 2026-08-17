import type { RectCm } from "../types";

const EPS = 1e-6;

/** True if two cm rectangles overlap. Touching edges do not count. */
export function rectsOverlap(a: RectCm, b: RectCm): boolean {
  return (
    a.xCm < b.xCm + b.widthCm - EPS &&
    a.xCm + a.widthCm > b.xCm + EPS &&
    a.yCm < b.yCm + b.heightCm - EPS &&
    a.yCm + a.heightCm > b.yCm + EPS
  );
}

export function overlapsAny(candidate: RectCm, others: RectCm[]): boolean {
  return others.some((o) => rectsOverlap(candidate, o));
}

/** Slides a rect back inside `bounds` without resizing it. */
export function clampToBounds(rect: RectCm, bounds: RectCm): RectCm {
  const maxX = bounds.xCm + bounds.widthCm - rect.widthCm;
  const maxY = bounds.yCm + bounds.heightCm - rect.heightCm;
  return {
    ...rect,
    xCm: Math.min(Math.max(rect.xCm, bounds.xCm), Math.max(bounds.xCm, maxX)),
    yCm: Math.min(Math.max(rect.yCm, bounds.yCm), Math.max(bounds.yCm, maxY)),
  };
}

export function fitsInBounds(rect: RectCm, bounds: RectCm): boolean {
  return (
    rect.xCm >= bounds.xCm - EPS &&
    rect.yCm >= bounds.yCm - EPS &&
    rect.xCm + rect.widthCm <= bounds.xCm + bounds.widthCm + EPS &&
    rect.yCm + rect.heightCm <= bounds.yCm + bounds.heightCm + EPS
  );
}

/**
 * Finds a free spot for a new rect by packing from the top-left.
 *
 * Centring the first layer reads nicer but wastes the wall: a centred 64 cm
 * cabinet splits a 160 cm wall into two 48 cm strips, and the second layer
 * then has nowhere to go. Packing row by row keeps the wall's full capacity
 * usable, and every position is reachable now that the workspace shows the
 * whole rectified wall instead of a 16:9 crop of it.
 */
export function findFreeSpot(
  widthCm: number,
  heightCm: number,
  bounds: RectCm,
  others: RectCm[],
  stepCm = 5
): RectCm | null {
  if (widthCm > bounds.widthCm + EPS || heightCm > bounds.heightCm + EPS) return null;

  const maxX = bounds.xCm + bounds.widthCm - widthCm;
  const maxY = bounds.yCm + bounds.heightCm - heightCm;

  const axis = (from: number, to: number): number[] => {
    const values: number[] = [];
    for (let v = from; v < to - EPS; v += stepCm) values.push(v);
    values.push(to); // flush against the far edge, for tight fits
    return values;
  };

  for (const y of axis(bounds.yCm, maxY)) {
    for (const x of axis(bounds.xCm, maxX)) {
      const candidate: RectCm = { xCm: x, yCm: y, widthCm, heightCm };
      if (fitsInBounds(candidate, bounds) && !overlapsAny(candidate, others)) return candidate;
    }
  }
  return null;
}
