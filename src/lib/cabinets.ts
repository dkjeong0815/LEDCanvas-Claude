import type { CabinetSpec, CabinetType, Layer } from "../types";

export const CABINETS: Record<CabinetType, CabinetSpec> = {
  gob: { label: "GOB", widthCm: 64, heightCm: 48 },
  cob: { label: "COB", widthCm: 60, heightCm: 33.75 },
};

export const CABINET_TYPES = Object.keys(CABINETS) as CabinetType[];

export const PIXEL_PITCH_PRESETS = [1.2, 1.5, 1.8, 2.5, 3.0, 4.0] as const;
/** What the very first layer of a project starts on. */
export const DEFAULT_PIXEL_PITCH = 1.5;
export const DEFAULT_CABINET_TYPE: CabinetType = "gob";

export function layerSizeCm(layer: Layer): { widthCm: number; heightCm: number } {
  const spec = CABINETS[layer.cabinetType];
  return { widthCm: spec.widthCm * layer.cols, heightCm: spec.heightCm * layer.rows };
}

/**
 * Resolution of the whole layer — one cabinet's pixel count times the array.
 * Pixels per cabinet floor first: a cabinet cannot hold a fraction of a pixel,
 * so rounding after multiplying would overstate a large wall.
 */
export function layerResolutionPx(layer: Layer): { widthPx: number; heightPx: number } {
  const spec = CABINETS[layer.cabinetType];
  return {
    widthPx: Math.floor((spec.widthCm * 10) / layer.pixelPitchMm) * layer.cols,
    heightPx: Math.floor((spec.heightCm * 10) / layer.pixelPitchMm) * layer.rows,
  };
}

export function cabinetCount(layer: Layer): number {
  return layer.cols * layer.rows;
}
