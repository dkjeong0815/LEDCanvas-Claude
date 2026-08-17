/**
 * Layer accent colours.
 *
 * Shared by the editor canvas and the composite renderers on purpose: a printed
 * sheet that colours L2 differently from the screen the user arranged it on is
 * a sheet they have to re-read from scratch.
 */
export const LAYER_PALETTE = ["#4f8cff", "#f2a03d", "#9b6cf0", "#31c48d", "#f2568c", "#2fc4c4"];

export function layerColor(index: number): string {
  return LAYER_PALETTE[index % LAYER_PALETTE.length];
}
