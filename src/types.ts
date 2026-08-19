export interface Point {
  x: number;
  y: number;
}

/** Row-major 3x3, length 9: [h0..h8]. */
export type Matrix3x3 = number[];

/** A quadrilateral, always ordered TL → TR → BR → BL. */
export type Quad = [Point, Point, Point, Point];

export interface RectCm {
  xCm: number;
  yCm: number;
  widthCm: number;
  heightCm: number;
}

export interface BackgroundImage {
  /** object URL of the user's photo; owned by the store, revoked on replace */
  url: string;
  naturalWidth: number;
  naturalHeight: number;
}

/**
 * How the real-world scale was established.
 *  - "a4": a sheet of A4 on the wall; orientation is auto-detected.
 *  - "custom": any rectangle whose real size the user types in.
 */
export type ReferenceKind = "a4" | "custom";

export interface Calibration {
  kind: ReferenceKind;
  /** real size of the reference rectangle, after orientation resolution */
  referenceWidthCm: number;
  referenceHeightCm: number;
  /** the four reference corners on the ORIGINAL photo, natural px, TL/TR/BR/BL */
  imagePoints: Quad;
  /** original-photo px → wall cm */
  toCm: Matrix3x3;
  /** wall cm → original-photo px */
  toImage: Matrix3x3;
  /** rectified ("straight-on") wall render */
  rectifiedUrl: string;
  pxPerCm: number;
  rectWidthPx: number;
  rectHeightPx: number;
  /** wall-cm coordinate of the rectified image's top-left pixel */
  originCm: Point;
}

export type CabinetType = "gob" | "cob";

export interface CabinetSpec {
  label: string;
  widthCm: number;
  heightCm: number;
}

/** "cover" is the default: an LED face is a fixed canvas, not a picture frame. */
export type FitMode = "cover" | "contain";

export interface LayerContent {
  /** object URL of the user's video; owned by the store, revoked on replace */
  url: string;
  /**
   * A still frame of that video, captured once on upload. Paper output — the
   * printed sheet and the PNG — can only carry one frame, and a live <video>
   * prints blank in some browsers, so paper always draws this instead.
   */
  posterUrl: string;
  fitMode: FitMode;
}

export interface Layer {
  id: string;
  label: string;
  cabinetType: CabinetType;
  /** mm; undefined = inherit the workspace default */
  pixelPitchMm?: number;
  cols: number;
  rows: number;
  /** top-left corner in wall-cm coordinates */
  xCm: number;
  yCm: number;
  content?: LayerContent;
}
