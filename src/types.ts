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

export type ContentKind = "image" | "video";

export interface LayerContent {
  kind: ContentKind;
  /** object URL of the user's file; owned by the store, revoked on replace */
  url: string;
  /**
   * A still frame of that video, captured once on upload. Paper output — the
   * printed sheet and the PNG — can only carry one frame, and a live <video>
   * prints blank in some browsers, so paper always draws this instead.
   */
  posterUrl: string;
  /**
   * Luminance-weighted average colour of that still, as "r, g, b". A lit LED
   * face spills its own colour onto the wall, and bright areas spill more —
   * so the glow is sampled from the picture rather than picked by hand.
   */
  glowColor: string;
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

/**
 * What the arrangement shows on top of the content. The editor, the printed
 * sheet and the PNG all read the same options, so turning the annotations off
 * for a client turns them off everywhere.
 */
export interface DisplayOptions {
  /**
   * Layer name, outline and size caption, and with them the resize handle and
   * the wall's dashed edge. They travel together: leaving any one of them on
   * is enough to make the wall read as a drawing rather than a photograph.
   */
  annotations: boolean;
  /** drop shadow, so a face reads as mounted off the wall */
  shadow: boolean;
  /**
   * How far the face stands off the wall. Drives darkness and softness at
   * once, because a shadow cast from further away is both.
   */
  shadowAmount: number;
  /** strength of the content-coloured light spill */
  glow: number;
  /**
   * How much the face is driven like a lit panel rather than printed paper.
   * 0 leaves the content exactly as supplied; higher lifts it, deepens its
   * blacks and widens its colour, which is what separates an emissive screen
   * from a photograph hanging on a wall.
   */
  screen: number;
}
