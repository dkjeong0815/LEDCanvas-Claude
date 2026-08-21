import { describe, expect, it } from "vitest";
import {
  MODULE_HEIGHT_CM,
  MODULE_WIDTH_CM,
  boxDownsample,
  defaultEmitterRatio,
  fillRatio,
  packageFor,
  previewGeometry,
  sourceRectFor,
} from "../pixelPreview";
import type { Pixels } from "../pixelPreview";

// The overlay gets the width of the window, not a sidebar column.
const canvas = { canvasWidthPx: 1200, canvasHeightPx: 600 };
const patch = { regionWidthCm: MODULE_WIDTH_CM, regionHeightCm: MODULE_HEIGHT_CM, ...canvas };

/** Share of an LED cell that ends up drawn dark, alpha included. */
function darkShare(pitchMm: number) {
  const g = previewGeometry({ pitchMm, ...patch });
  return (g.gapPx * g.gapAlpha) / g.ledPx;
}

describe("previewGeometry", () => {
  it("puts several screen pixels on each LED at a hand-sized patch", () => {
    // The whole point: at this magnification an LED is visible as an LED.
    for (const pitchMm of [1.2, 1.5, 1.8, 2.5, 3, 4]) {
      const g = previewGeometry({ pitchMm, ...patch });
      expect(g.ledPx).toBeGreaterThan(3);
      expect(g.gapPx).toBeGreaterThan(0);
    }
  });

  it("separates pitches the arrangement view cannot", () => {
    const fine = previewGeometry({ pitchMm: 1.5, ...patch });
    const coarse = previewGeometry({ pitchMm: 1.8, ...patch });
    // 1.5 and 1.8 mm differ by a fifth; the patch must show that, not round it away.
    expect(fine.cols).toBe(213);
    expect(coarse.cols).toBe(178);
    expect(coarse.ledPx / fine.ledPx).toBeCloseTo(213 / 178, 5);
  });

  it("drops the grid rather than draw moiré when LEDs get too small", () => {
    // A metre-wide patch at 1.2 mm is 833 LEDs across, well under a pixel each.
    const g = previewGeometry({ pitchMm: 1.2, regionWidthCm: 400, ...canvas });
    expect(g.ledPx).toBeLessThan(1);
    expect(g.gapPx).toBe(0);
  });

  it("reports the real size it actually shows, rounded to whole LEDs", () => {
    const g = previewGeometry({ pitchMm: 4, ...patch });
    // The figures a module's spec sheet carries.
    expect(g.cols).toBe(80);
    expect(g.rows).toBe(40);
    const p25 = previewGeometry({ pitchMm: 2.5, ...patch });
    expect(p25.cols).toBe(128);
    expect(p25.rows).toBe(64);
    expect(g.widthCm).toBeCloseTo(MODULE_WIDTH_CM, 6);
    expect(g.heightCm).toBeCloseTo(MODULE_HEIGHT_CM, 6);
    expect(g.heightCm).toBeCloseTo((g.rows * 4) / 10, 6);
  });
});

describe("the emitter model", () => {
  it("pairs each pitch with the package the trade actually puts on it", () => {
    const pairs: [number, string, number][] = [
      [1.2, "SMD1010", 1.0],
      [1.5, "SMD1212", 1.2],
      [1.8, "SMD1515", 1.5],
      [2.5, "SMD2020", 2.0],
      [3.0, "SMD2020", 2.0],
      [4.0, "SMD2020", 2.0],
    ];
    for (const [pitchMm, name, emitterMm] of pairs) {
      expect(packageFor(pitchMm)).toEqual({ name, emitterMm });
    }
  });

  it("keeps the lamp size while the pitch grows, so the dark gap widens", () => {
    // The same 2.0 mm package serves 2.5, 3 and 4 mm boards.
    expect(defaultEmitterRatio(2.5) * 2.5).toBeCloseTo(2.0, 6);
    expect(defaultEmitterRatio(3) * 3).toBeCloseTo(2.0, 6);
    expect(defaultEmitterRatio(4) * 4).toBeCloseTo(2.0, 6);
  });

  it("quotes fill as an area, the way the trade does", () => {
    // The published figure this is checked against: an SMD2121 on a 5 mm board
    // is sold as a 17% fill, and (2.1 / 5)² is 17.6%.
    expect(fillRatio(defaultEmitterRatio(5))).toBeCloseTo(0.176, 3);

    expect(fillRatio(defaultEmitterRatio(1.2))).toBeCloseTo(0.694, 3);
    expect(fillRatio(defaultEmitterRatio(1.5))).toBeCloseTo(0.64, 3);
    expect(fillRatio(defaultEmitterRatio(1.8))).toBeCloseTo(0.694, 3);
    expect(fillRatio(defaultEmitterRatio(2.5))).toBeCloseTo(0.64, 3);
    expect(fillRatio(defaultEmitterRatio(3))).toBeCloseTo(0.444, 3);
    expect(fillRatio(defaultEmitterRatio(4))).toBeCloseTo(0.25, 3);
  });

  it("is not monotonic, because package families step", () => {
    // 4 mm on an SMD2020 is darker than 5 mm on an SMD2121: stretching a family
    // to its coarsest pitch costs more fill than moving up a size.
    expect(fillRatio(defaultEmitterRatio(4))).toBeGreaterThan(
      fillRatio(defaultEmitterRatio(5))
    );
    expect(fillRatio(defaultEmitterRatio(1.8))).toBeGreaterThan(
      fillRatio(defaultEmitterRatio(1.5))
    );
  });

  it("draws a coarse pitch darker than a fine one, not the other way round", () => {
    // The bug this replaces: a floor of one whole pixel on the gap made 1.2 mm
    // come out 32% dark and 4 mm only 14% — the finest pitch looked the
    // gappiest, which is the opposite of every real wall.
    expect(darkShare(4)).toBeGreaterThan(darkShare(1.2) * 2);
    expect(darkShare(3)).toBeGreaterThan(darkShare(1.5));
    expect(darkShare(1.2)).toBeLessThan(0.25);
    expect(darkShare(4)).toBeCloseTo(0.5, 2);
  });

  it("fades a sub-pixel gap instead of forcing it to a whole pixel", () => {
    const g = previewGeometry({ pitchMm: 1.2, ...patch });
    // 0.2 mm of 1.2 mm, on a 4.5 px LED, is under a pixel wide.
    expect(g.gapPx).toBe(1);
    expect(g.gapAlpha).toBeGreaterThan(0);
    expect(g.gapAlpha).toBeLessThan(1);
  });

  it("takes an override, for a product whose package is not the usual one", () => {
    const g = previewGeometry({ pitchMm: 4, emitterRatio: 0.9, ...patch });
    expect(g.emitterRatio).toBe(0.9);
    expect(g.gapPx * g.gapAlpha).toBeCloseTo(g.ledPx * 0.1, 5);
  });
});

describe("sourceRectFor", () => {
  const face = { faceWidthCm: 192, faceHeightCm: 96 };

  it("centres on the middle of the content when the patch is centred", () => {
    const r = sourceRectFor({
      contentWidth: 1920,
      contentHeight: 960,
      ...face,
      patchWidthCm: 12,
      patchHeightCm: 6,
      centre: { x: 0.5, y: 0.5 },
      fitMode: "cover",
    });
    expect(r.sx + r.sw / 2).toBeCloseTo(960, 6);
    expect(r.sy + r.sh / 2).toBeCloseTo(480, 6);
    // 1920 px over 192 cm is 10 px/cm, so a 12 cm patch is 120 px of content.
    expect(r.sw).toBeCloseTo(120, 6);
    expect(r.sh).toBeCloseTo(60, 6);
  });

  it("crops the overflowing axis under cover, as object-fit does", () => {
    // A square picture on a 2:1 face: cover fills the width and cuts the height.
    const r = sourceRectFor({
      contentWidth: 1000,
      contentHeight: 1000,
      ...face,
      patchWidthCm: 192,
      patchHeightCm: 96,
      centre: { x: 0.5, y: 0.5 },
      fitMode: "cover",
    });
    expect(r.sx).toBeCloseTo(0, 6);
    expect(r.sw).toBeCloseTo(1000, 6);
    expect(r.sh).toBeCloseTo(500, 6);
    expect(r.sy).toBeCloseTo(250, 6);
  });

  it("reaches past the picture under contain, where the face has bars", () => {
    // Same square picture, contained: it fits the height and leaves side bars,
    // so a patch at the far left falls outside the picture entirely.
    const r = sourceRectFor({
      contentWidth: 1000,
      contentHeight: 1000,
      ...face,
      patchWidthCm: 12,
      patchHeightCm: 6,
      centre: { x: 0, y: 0.5 },
      fitMode: "contain",
    });
    expect(r.sx).toBeLessThan(0);
  });

  it("follows the patch as it pans", () => {
    const at = (x: number) =>
      sourceRectFor({
        contentWidth: 1920,
        contentHeight: 960,
        ...face,
        patchWidthCm: 12,
        patchHeightCm: 6,
        centre: { x, y: 0.5 },
        fitMode: "cover",
      }).sx;
    expect(at(0.75) - at(0.25)).toBeCloseTo(960, 6);
  });
});

function field(width: number, height: number, value: (x: number, y: number) => number): Pixels {
  const img: Pixels = { data: new Uint8ClampedArray(width * height * 4), width, height };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = value(x, y);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  return img;
}

function contrast(img: Pixels) {
  const vals: number[] = [];
  for (let i = 0; i < img.data.length; i += 4) vals.push(img.data[i]);
  const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
  return Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
}

describe("boxDownsample", () => {
  it("averages the area an LED covers", () => {
    // 4x4 of alternating 0/200 columns, down to 2x2: every LED sees both.
    const src = field(4, 4, (x) => (x % 2 === 0 ? 0 : 200));
    const out = boxDownsample(src, 2, 2);
    for (let i = 0; i < out.data.length; i += 4) expect(out.data[i]).toBeCloseTo(100, 6);
  });

  it("leaves detail alone when there is one LED per source pixel", () => {
    const src = field(8, 8, (x, y) => ((x + y) % 2 === 0 ? 10 : 240));
    const out = boxDownsample(src, 8, 8);
    expect(contrast(out)).toBeCloseTo(contrast(src), 6);
  });

  it("loses contrast as the pitch coarsens, and never gains it", () => {
    // Detail two pixels wide, sampled by ever coarser grids. A canvas
    // downscale can hand back MORE contrast than the source here by
    // point-sampling; averaging cannot.
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const cell: number[][] = [];
    for (let y = 0; y < 60; y++) {
      cell[y] = [];
      for (let x = 0; x < 120; x++) cell[y][x] = rnd() < 0.5 ? 20 : 235;
    }
    const src = field(240, 120, (x, y) => cell[y >> 1][x >> 1]);
    const source = contrast(src);

    let previous = source;
    for (const cols of [120, 80, 60, 40, 30, 20]) {
      const out = boxDownsample(src, cols, Math.round((cols * 120) / 240));
      const got = contrast(out);
      expect(got).toBeLessThanOrEqual(source + 1e-6);
      expect(got).toBeLessThanOrEqual(previous + 1e-6);
      previous = got;
    }
  });
});
