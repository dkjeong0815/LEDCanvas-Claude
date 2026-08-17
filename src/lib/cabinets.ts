import type { CabinetSpec, CabinetType, Layer } from "../types";

export const CABINETS: Record<CabinetType, CabinetSpec> = {
  gob: { label: "GOB", widthCm: 64, heightCm: 48 },
  cob: { label: "COB", widthCm: 60, heightCm: 33.75 },
};

export const CABINET_TYPES = Object.keys(CABINETS) as CabinetType[];

export const PIXEL_PITCH_PRESETS = [1.2, 1.5, 1.8, 2.5, 3.0, 4.0] as const;
export const DEFAULT_PIXEL_PITCH = 1.5;

export function layerSizeCm(layer: Layer): { widthCm: number; heightCm: number } {
  const spec = CABINETS[layer.cabinetType];
  return { widthCm: spec.widthCm * layer.cols, heightCm: spec.heightCm * layer.rows };
}

export function effectivePitchMm(layer: Layer, globalPitchMm: number): number {
  return layer.pixelPitchMm ?? globalPitchMm;
}

/**
 * Resolution of the whole layer — one cabinet's pixel count times the array.
 * Pixels per cabinet floor first: a cabinet cannot hold a fraction of a pixel,
 * so rounding after multiplying would overstate a large wall.
 */
export function layerResolutionPx(layer: Layer, globalPitchMm: number): { widthPx: number; heightPx: number } {
  const spec = CABINETS[layer.cabinetType];
  const pitch = effectivePitchMm(layer, globalPitchMm);
  return {
    widthPx: Math.floor((spec.widthCm * 10) / pitch) * layer.cols,
    heightPx: Math.floor((spec.heightCm * 10) / pitch) * layer.rows,
  };
}

export function cabinetCount(layer: Layer): number {
  return layer.cols * layer.rows;
}
