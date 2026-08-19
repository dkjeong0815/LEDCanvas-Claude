import { create } from "zustand";
import type {
  BackgroundImage,
  CabinetType,
  Calibration,
  DisplayOptions,
  FitMode,
  Layer,
  Quad,
  RectCm,
  ReferenceKind,
} from "../types";
import { CABINETS, DEFAULT_PIXEL_PITCH, layerSizeCm } from "../lib/cabinets";
import { clampToBounds, findFreeSpot, fitsInBounds, overlapsAny } from "../lib/geometry";
import { calibrate, calibrateFailureMessage } from "../lib/calibrate";
import { A4_LONG_CM, A4_SHORT_CM, resolveA4Size } from "../lib/detectSheet";

export type Step = "upload" | "calibrate" | "edit";

function layerRect(layer: Layer): RectCm {
  const { widthCm, heightCm } = layerSizeCm(layer);
  return { xCm: layer.xCm, yCm: layer.yCm, widthCm, heightCm };
}

export function wallBounds(cal: Calibration): RectCm {
  return {
    xCm: cal.originCm.x,
    yCm: cal.originCm.y,
    widthCm: cal.rectWidthPx / cal.pxPerCm,
    heightCm: cal.rectHeightPx / cal.pxPerCm,
  };
}

/** Object URLs are owned by the store; releasing them is not optional. */
function revoke(url: string | undefined | null) {
  if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
}

/** A layer's content owns two blobs: the video and the still captured from it. */
function revokeContent(layer: Layer) {
  revoke(layer.content?.url);
  revoke(layer.content?.posterUrl);
}

interface State {
  step: Step;
  background: BackgroundImage | null;

  referenceKind: ReferenceKind;
  /** used only when referenceKind === "custom" */
  customWidthCm: number;
  customHeightCm: number;
  /** corners picked on the original photo, TL/TR/BR/BL once complete */
  corners: { x: number; y: number }[];
  /** true when the corners came from automatic detection */
  cornersAuto: boolean;
  calibrationError: string | null;
  calibration: Calibration | null;

  layers: Layer[];
  selectedLayerId: string | null;
  defaultCabinetType: CabinetType;
  defaultPitchMm: number;
  nextLayerNumber: number;

  /** shown in the title block of printed sheets */
  projectName: string;
  setProjectName: (name: string) => void;

  display: DisplayOptions;
  setDisplay: (patch: Partial<DisplayOptions>) => void;
  /** strip every annotation and light the faces — the view a client sees */
  presentationMode: () => void;

  reset: () => void;
  setBackground: (img: BackgroundImage) => void;
  setReferenceKind: (kind: ReferenceKind) => void;
  setCustomSize: (widthCm: number, heightCm: number) => void;
  addCorner: (p: { x: number; y: number }) => void;
  setCorners: (quad: Quad, auto: boolean) => void;
  clearCorners: () => void;
  setCalibrationError: (message: string | null) => void;
  /** Runs the calibration with the current corners. Returns true on success. */
  runCalibration: (image: HTMLImageElement) => boolean;
  recalibrate: () => void;

  addLayer: () => void;
  removeLayer: (id: string) => void;
  selectLayer: (id: string | null) => void;
  moveLayer: (id: string, xCm: number, yCm: number) => boolean;
  setLayerGrid: (id: string, cols: number, rows: number) => boolean;
  nudgeCols: (id: string, delta: number) => boolean;
  nudgeRows: (id: string, delta: number) => boolean;
  setLayerCabinetType: (id: string, type: CabinetType) => boolean;
  setLayerPitch: (id: string, mm: number | undefined) => void;
  setLayerContent: (
    id: string,
    url: string,
    posterUrl: string,
    glowColor: string,
    fitMode: FitMode
  ) => void;
  setLayerFitMode: (id: string, fitMode: FitMode) => void;
  clearLayerContent: (id: string) => void;
  setDefaultPitch: (mm: number) => void;
  setDefaultCabinetType: (t: CabinetType) => void;
}

export const DEFAULT_DISPLAY: DisplayOptions = {
  showLabels: true,
  showBorders: true,
  showDims: true,
  shadow: true,
  glow: 0.5,
};

export const MAX_GLOW = 1.2;

const initialCalibrationState = {
  referenceKind: "a4" as ReferenceKind,
  customWidthCm: 100,
  customHeightCm: 100,
  corners: [] as { x: number; y: number }[],
  cornersAuto: false,
  calibrationError: null as string | null,
  calibration: null as Calibration | null,
};

export const useStore = create<State>((set, get) => ({
  step: "upload",
  background: null,
  ...initialCalibrationState,

  layers: [],
  selectedLayerId: null,
  defaultCabinetType: "gob",
  defaultPitchMm: DEFAULT_PIXEL_PITCH,
  nextLayerNumber: 1,

  projectName: "",
  setProjectName: (name) => set({ projectName: name }),

  reset: () => {
    const s = get();
    revoke(s.background?.url);
    s.layers.forEach(revokeContent);
    set({
      step: "upload",
      background: null,
      ...initialCalibrationState,
      layers: [],
      selectedLayerId: null,
      nextLayerNumber: 1,
    });
  },

  setBackground: (img) => {
    const s = get();
    revoke(s.background?.url);
    s.layers.forEach(revokeContent);
    set({
      background: img,
      step: "calibrate",
      ...initialCalibrationState,
      layers: [],
      selectedLayerId: null,
      nextLayerNumber: 1,
    });
  },

  setReferenceKind: (kind) => set({ referenceKind: kind, calibrationError: null }),

  setCustomSize: (widthCm, heightCm) => set({ customWidthCm: widthCm, customHeightCm: heightCm }),

  addCorner: (p) =>
    set((s) => (s.corners.length >= 4 ? s : { corners: [...s.corners, p], cornersAuto: false, calibrationError: null })),

  setCorners: (quad, auto) => set({ corners: [...quad], cornersAuto: auto, calibrationError: null }),

  clearCorners: () => set({ corners: [], cornersAuto: false, calibrationError: null }),

  setCalibrationError: (message) => set({ calibrationError: message }),

  runCalibration: (image) => {
    const s = get();
    if (s.corners.length !== 4) {
      set({ calibrationError: "기준 사각형의 네 모서리를 모두 지정해주세요." });
      return false;
    }

    const quad = s.corners.slice(0, 4) as Quad;

    let widthCm: number;
    let heightCm: number;
    if (s.referenceKind === "a4") {
      const resolved = resolveA4Size(quad);
      widthCm = resolved.widthCm;
      heightCm = resolved.heightCm;
    } else {
      widthCm = s.customWidthCm;
      heightCm = s.customHeightCm;
      if (!(widthCm > 0) || !(heightCm > 0)) {
        set({ calibrationError: "기준 물체의 가로·세로 실측 크기를 입력해주세요." });
        return false;
      }
    }

    const outcome = calibrate({ image, quad, referenceWidthCm: widthCm, referenceHeightCm: heightCm, kind: s.referenceKind });

    if (!outcome.ok) {
      set({ calibrationError: calibrateFailureMessage(outcome.reason, outcome.diagnostics) });
      return false;
    }

    set({ calibration: outcome.calibration, calibrationError: null, step: "edit" });
    return true;
  },

  recalibrate: () => set({ step: "calibrate", calibration: null, calibrationError: null }),

  addLayer: () => {
    const s = get();
    if (!s.calibration) return;
    const spec = CABINETS[s.defaultCabinetType];
    const bounds = wallBounds(s.calibration);
    const spot = findFreeSpot(spec.widthCm, spec.heightCm, bounds, s.layers.map(layerRect));
    if (!spot) return;

    const layer: Layer = {
      id: crypto.randomUUID(),
      label: `L${s.nextLayerNumber}`,
      cabinetType: s.defaultCabinetType,
      cols: 1,
      rows: 1,
      xCm: spot.xCm,
      yCm: spot.yCm,
    };
    set({ layers: [...s.layers, layer], selectedLayerId: layer.id, nextLayerNumber: s.nextLayerNumber + 1 });
  },

  removeLayer: (id) =>
    set((s) => {
      const removed = s.layers.find((l) => l.id === id);
      if (removed) revokeContent(removed);
      return {
        layers: s.layers.filter((l) => l.id !== id),
        selectedLayerId: s.selectedLayerId === id ? null : s.selectedLayerId,
      };
    }),

  selectLayer: (id) => set({ selectedLayerId: id }),

  moveLayer: (id, xCm, yCm) => {
    const s = get();
    if (!s.calibration) return false;
    const layer = s.layers.find((l) => l.id === id);
    if (!layer) return false;
    const { widthCm, heightCm } = layerSizeCm(layer);
    const candidate = clampToBounds({ xCm, yCm, widthCm, heightCm }, wallBounds(s.calibration));
    const others = s.layers.filter((l) => l.id !== id).map(layerRect);
    if (overlapsAny(candidate, others)) return false;
    set({ layers: s.layers.map((l) => (l.id === id ? { ...l, xCm: candidate.xCm, yCm: candidate.yCm } : l)) });
    return true;
  },

  setLayerGrid: (id, cols, rows) => {
    const s = get();
    if (!s.calibration) return false;
    const layer = s.layers.find((l) => l.id === id);
    if (!layer || cols < 1 || rows < 1) return false;
    const candidate = { ...layer, cols, rows };
    const rect = layerRect(candidate);
    if (!fitsInBounds(rect, wallBounds(s.calibration))) return false;
    if (overlapsAny(rect, s.layers.filter((l) => l.id !== id).map(layerRect))) return false;
    set({ layers: s.layers.map((l) => (l.id === id ? candidate : l)) });
    return true;
  },

  nudgeCols: (id, delta) => {
    const layer = get().layers.find((l) => l.id === id);
    return layer ? get().setLayerGrid(id, layer.cols + delta, layer.rows) : false;
  },

  nudgeRows: (id, delta) => {
    const layer = get().layers.find((l) => l.id === id);
    return layer ? get().setLayerGrid(id, layer.cols, layer.rows + delta) : false;
  },

  setLayerCabinetType: (id, type) => {
    const s = get();
    if (!s.calibration) return false;
    const layer = s.layers.find((l) => l.id === id);
    if (!layer) return false;
    const candidate = { ...layer, cabinetType: type };
    const rect = layerRect(candidate);
    const bounds = wallBounds(s.calibration);
    const others = s.layers.filter((l) => l.id !== id).map(layerRect);

    // A taller cabinet can push the layer past the wall edge — slide it back in
    // rather than silently refusing the change.
    const adjusted = clampToBounds(rect, bounds);
    if (!fitsInBounds(adjusted, bounds) || overlapsAny(adjusted, others)) return false;
    set({
      layers: s.layers.map((l) => (l.id === id ? { ...candidate, xCm: adjusted.xCm, yCm: adjusted.yCm } : l)),
    });
    return true;
  },

  setLayerPitch: (id, mm) =>
    set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, pixelPitchMm: mm } : l)) })),

  setLayerContent: (id, url, posterUrl, glowColor, fitMode) =>
    set((s) => ({
      layers: s.layers.map((l) => {
        if (l.id !== id) return l;
        revokeContent(l);
        return { ...l, content: { url, posterUrl, glowColor, fitMode } };
      }),
    })),

  setLayerFitMode: (id, fitMode) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id && l.content ? { ...l, content: { ...l.content, fitMode } } : l)),
    })),

  clearLayerContent: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => {
        if (l.id !== id) return l;
        revokeContent(l);
        return { ...l, content: undefined };
      }),
    })),

  display: DEFAULT_DISPLAY,

  setDisplay: (patch) => set((s) => ({ display: { ...s.display, ...patch } })),

  presentationMode: () =>
    set((s) => ({
      display: { ...s.display, showLabels: false, showBorders: false, showDims: false, shadow: true },
    })),

  setDefaultPitch: (mm) => set({ defaultPitchMm: mm }),
  setDefaultCabinetType: (t) => set({ defaultCabinetType: t }),
}));

export const A4_LABEL = `A4 ${A4_SHORT_CM} × ${A4_LONG_CM} cm`;
