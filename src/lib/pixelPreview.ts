import type { FitMode } from "../types";

/**
 * Magnified view of a small patch of an LED face, drawn at a scale where one
 * LED covers several screen pixels.
 *
 * The arrangement view cannot show pitch. A 1.5 mm LED on a wall shown 576 px
 * wide is under half a screen pixel across, so drawing its grid there produces
 * moiré rather than structure, and 1.2 / 1.5 / 1.8 mm all look identical
 * because the screen has no room to tell them apart. Blowing up a hand-sized
 * patch is what makes the difference visible — and honest.
 */

/** Below this, an LED is too small to draw a gap around without moiré. */
const MIN_LED_PX_FOR_GRID = 3;

export interface PreviewGeometry {
  /** LEDs across and down the patch */
  cols: number;
  rows: number;
  /** screen px per LED */
  ledPx: number;
  /** dark gap drawn between LEDs, in screen px; 0 when they are too small */
  gapPx: number;
  /** the real size actually shown, after rounding to whole LEDs */
  widthCm: number;
  heightCm: number;
}

export function previewGeometry(opts: {
  pitchMm: number;
  /** how much wall the patch should span */
  regionWidthCm: number;
  canvasWidthPx: number;
  canvasHeightPx: number;
}): PreviewGeometry {
  const { pitchMm, regionWidthCm, canvasWidthPx, canvasHeightPx } = opts;

  const cols = Math.max(1, Math.round((regionWidthCm * 10) / pitchMm));
  const ledPx = canvasWidthPx / cols;
  const rows = Math.max(1, Math.floor(canvasHeightPx / ledPx));

  return {
    cols,
    rows,
    ledPx,
    // The gap is a fraction of the LED, so the black matrix keeps its
    // proportion whether the patch holds 20 LEDs or 200.
    gapPx: ledPx >= MIN_LED_PX_FOR_GRID ? Math.max(1, ledPx * 0.14) : 0,
    widthCm: (cols * pitchMm) / 10,
    heightCm: (rows * pitchMm) / 10,
  };
}

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface SourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Where a patch of the face lands in the content.
 *
 * `centre` is the patch's middle as a fraction of the face, 0..1 on each axis,
 * so panning does not have to know anything about pixels or centimetres. The
 * fit maths mirrors CSS object-fit, because the face on screen is drawn by
 * object-fit and the two must agree.
 */
export function sourceRectFor(opts: {
  contentWidth: number;
  contentHeight: number;
  faceWidthCm: number;
  faceHeightCm: number;
  patchWidthCm: number;
  patchHeightCm: number;
  centre: { x: number; y: number };
  fitMode: FitMode;
}): SourceRect {
  const {
    contentWidth,
    contentHeight,
    faceWidthCm,
    faceHeightCm,
    patchWidthCm,
    patchHeightCm,
    centre,
    fitMode,
  } = opts;

  // Content pixels per cm of face, once the picture is fitted into it.
  const byWidth = contentWidth / faceWidthCm;
  const byHeight = contentHeight / faceHeightCm;
  const scale = fitMode === "cover" ? Math.min(byWidth, byHeight) : Math.max(byWidth, byHeight);

  // Where the fitted picture starts, in content pixels, relative to the face's
  // top-left. Negative for the axis that overflows under "cover".
  const originX = (contentWidth - faceWidthCm * scale) / 2;
  const originY = (contentHeight - faceHeightCm * scale) / 2;

  const sw = patchWidthCm * scale;
  const sh = patchHeightCm * scale;

  return {
    sx: originX + centre.x * faceWidthCm * scale - sw / 2,
    sy: originY + centre.y * faceHeightCm * scale - sh / 2,
    sw,
    sh,
  };
}

/**
 * Averages a patch down to one sample per LED.
 *
 * Not drawImage. A canvas downscale runs whatever filter the browser feels
 * like: measured on a 2 mm noise field, a 3 mm grid came back with *more*
 * contrast than the source, because the filter had point-sampled instead of
 * averaged. That is aliasing dressed up as detail, and it makes a coarse pitch
 * look sharper than a fine one — the exact opposite of what this view is for.
 *
 * Each LED here takes the mean of the source area it covers, which is what a
 * panel actually shows, and it makes the result the same in every browser.
 *
 * Takes and returns plain buffers rather than ImageData so the maths can be
 * tested without a DOM. An ImageData satisfies Pixels as it stands.
 */
export function boxDownsample(src: Pixels, cols: number, rows: number): Pixels {
  const out: Pixels = { data: new Uint8ClampedArray(cols * rows * 4), width: cols, height: rows };
  const xEdge = src.width / cols;
  const yEdge = src.height / rows;

  for (let row = 0; row < rows; row++) {
    const y0 = Math.floor(row * yEdge);
    const y1 = Math.max(y0 + 1, Math.floor((row + 1) * yEdge));
    for (let col = 0; col < cols; col++) {
      const x0 = Math.floor(col * xEdge);
      const x1 = Math.max(x0 + 1, Math.floor((col + 1) * xEdge));

      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = y0; y < y1 && y < src.height; y++) {
        let i = (y * src.width + x0) * 4;
        for (let x = x0; x < x1 && x < src.width; x++, i += 4) {
          r += src.data[i];
          g += src.data[i + 1];
          b += src.data[i + 2];
          n++;
        }
      }
      if (n === 0) continue;

      const o = (row * cols + col) * 4;
      out.data[o] = r / n;
      out.data[o + 1] = g / n;
      out.data[o + 2] = b / n;
      out.data[o + 3] = 255;
    }
  }
  return out;
}
