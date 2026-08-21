import type { DisplayOptions } from "../types";

/**
 * Drives the content like a lit panel instead of printed paper.
 *
 * Brightness alone just washes the picture out. What actually reads as
 * self-lit is the contrast: an LED's black stays black while its highlights
 * outrun anything reflective beside them. Saturation follows because a panel's
 * colour gamut is wider than a photograph of a wall.
 *
 * Shared by the editor, the PNG and the pixel preview, because a face judged
 * at one brightness and delivered at another is worse than no control at all.
 */
export function screenFilter(display: DisplayOptions): string | undefined {
  if (!(display.screen > 0)) return undefined;
  const a = display.screen;
  return `brightness(${(1 + a * 0.45).toFixed(3)}) contrast(${(1 + a * 0.35).toFixed(
    3
  )}) saturate(${(1 + a * 0.3).toFixed(3)})`;
}
