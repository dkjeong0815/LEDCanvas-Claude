import type { Calibration, Matrix3x3, Point, Quad, ReferenceKind } from "../types";
import {
  applyHomography,
  computeHomography,
  invertMatrix3x3,
  multiply3x3,
  quadArea,
  rectifyImage,
  rotation3x3,
} from "./homography";

/**
 * Cancels the in-plane roll that the reference rectangle imposes on the world.
 *
 * Rectification makes the reference rectangle's edges axis-aligned, so a sheet
 * taped on the wall even slightly crooked tilts the ENTIRE rectified photo by
 * that angle — on a real site photo a 1.6° crooked A4 rotated the whole wall by
 * 1.9°, which reads as "the app rotated my picture". The sheet is a reliable
 * source of scale and perspective, but a poor source of "which way is up".
 *
 * So we keep the photo's own horizontal: measure where the photo's horizontal
 * centre line ends up in cm space and rotate the world back by that angle.
 * Rotation is rigid, so every distance, area and the perspective row of the
 * homography are untouched — only the orientation of the output changes.
 */
function levelToPhoto(toCm: Matrix3x3, photoWidth: number, photoHeight: number): Matrix3x3 {
  const left = applyHomography(toCm, { x: 0, y: photoHeight / 2 });
  const right = applyHomography(toCm, { x: photoWidth, y: photoHeight / 2 });
  if (![left.x, left.y, right.x, right.y].every(Number.isFinite)) return toCm;

  const dx = right.x - left.x;
  const dy = right.y - left.y;
  if (Math.hypot(dx, dy) < 1e-9) return toCm;

  return multiply3x3(rotation3x3(-Math.atan2(dy, dx)), toCm);
}

export type CalibrateFailure =
  | "degenerate-quad"
  | "singular-homography"
  | "unstable-perspective"
  | "implausible-size"
  | "render-failed";

export interface CalibrateDiagnostics {
  wallWidthCm: number;
  wallHeightCm: number;
  /** ratio of the largest to smallest perspective denominator across the photo */
  perspectiveSpread: number;
}

export type CalibrateOutcome =
  | { ok: true; calibration: Calibration; diagnostics: CalibrateDiagnostics }
  | { ok: false; reason: CalibrateFailure; diagnostics?: CalibrateDiagnostics };

/** A wall smaller than this, or larger, is almost certainly a bad calibration. */
const MIN_WALL_CM = 20;
const MAX_WALL_CM = 2000;

export interface CalibrateInput {
  image: HTMLImageElement;
  quad: Quad;
  referenceWidthCm: number;
  referenceHeightCm: number;
  kind: ReferenceKind;
  /** default true — see levelToPhoto() */
  keepPhotoLevel?: boolean;
}

/**
 * Turns four clicked/detected corners plus their real-world size into a full
 * wall calibration: the cm↔photo homographies and a rectified background.
 */
export function calibrate(input: CalibrateInput): CalibrateOutcome {
  const { image, quad, referenceWidthCm, referenceHeightCm, kind } = input;

  const naturalW = image.naturalWidth;
  const naturalH = image.naturalHeight;
  if (!naturalW || !naturalH) return { ok: false, reason: "render-failed" };

  // Four points on a line (or nearly) carry no perspective information.
  const refArea = quadArea(quad);
  if (!(refArea > 0) || refArea < naturalW * naturalH * 1e-6) {
    return { ok: false, reason: "degenerate-quad" };
  }

  const dstRect: Point[] = [
    { x: 0, y: 0 },
    { x: referenceWidthCm, y: 0 },
    { x: referenceWidthCm, y: referenceHeightCm },
    { x: 0, y: referenceHeightCm },
  ];

  const rawToCm = computeHomography(quad, dstRect);
  if (!rawToCm) return { ok: false, reason: "singular-homography" };

  const toCm = input.keepPhotoLevel === false ? rawToCm : levelToPhoto(rawToCm, naturalW, naturalH);

  const toImage = invertMatrix3x3(toCm);
  if (!toImage) return { ok: false, reason: "singular-homography" };

  // The reference rectangle is small relative to the photo, so the homography
  // is extrapolated far beyond the data that produced it. If the perspective
  // denominator (h6·x + h7·y + 1) approaches zero or flips sign anywhere in the
  // frame, that extrapolation diverges and the resulting "wall" is fiction.
  const denominators = [
    [0, 0],
    [naturalW, 0],
    [naturalW, naturalH],
    [0, naturalH],
  ].map(([x, y]) => toCm[6] * x + toCm[7] * y + 1);
  const minDenom = Math.min(...denominators);
  const maxDenom = Math.max(...denominators);
  const perspectiveSpread = maxDenom / Math.max(minDenom, 1e-6);

  const cornersCm = [
    { x: 0, y: 0 },
    { x: naturalW, y: 0 },
    { x: naturalW, y: naturalH },
    { x: 0, y: naturalH },
  ].map((p) => applyHomography(toCm, p));
  const xs = cornersCm.map((p) => p.x);
  const ys = cornersCm.map((p) => p.y);
  const wallWidthCm = Math.max(...xs) - Math.min(...xs);
  const wallHeightCm = Math.max(...ys) - Math.min(...ys);

  const diagnostics: CalibrateDiagnostics = { wallWidthCm, wallHeightCm, perspectiveSpread };

  if (minDenom <= 0.15 || perspectiveSpread > 12) {
    return { ok: false, reason: "unstable-perspective", diagnostics };
  }
  if (
    !Number.isFinite(wallWidthCm) ||
    !Number.isFinite(wallHeightCm) ||
    wallWidthCm < MIN_WALL_CM ||
    wallHeightCm < MIN_WALL_CM ||
    wallWidthCm > MAX_WALL_CM ||
    wallHeightCm > MAX_WALL_CM
  ) {
    return { ok: false, reason: "implausible-size", diagnostics };
  }

  const rect = rectifyImage(image, toCm, toImage);
  if (!rect) return { ok: false, reason: "render-failed", diagnostics };

  const calibration: Calibration = {
    kind,
    referenceWidthCm,
    referenceHeightCm,
    imagePoints: quad,
    toCm,
    toImage,
    rectifiedUrl: rect.canvas.toDataURL("image/png"),
    pxPerCm: rect.pxPerCm,
    rectWidthPx: rect.widthPx,
    rectHeightPx: rect.heightPx,
    originCm: rect.originCm,
  };

  return { ok: true, calibration, diagnostics };
}

export function calibrateFailureMessage(reason: CalibrateFailure, d?: CalibrateDiagnostics): string {
  switch (reason) {
    case "degenerate-quad":
      return "네 점이 거의 일직선입니다. 기준 사각형의 서로 다른 네 모서리를 찍어주세요.";
    case "singular-homography":
      return "원근 계산에 실패했습니다. 네 점을 다시 지정해주세요.";
    case "unstable-perspective":
      return "사진의 기울기가 너무 커서 벽면 전체를 안정적으로 펼 수 없습니다. 벽을 좀 더 정면에서 찍은 사진을 사용해주세요.";
    case "implausible-size":
      return d
        ? `계산된 벽면 크기가 비정상적입니다 (${d.wallWidthCm.toFixed(0)} × ${d.wallHeightCm.toFixed(
            0
          )} cm). 기준 사각형의 모서리를 더 정확히 지정하거나, 더 큰 기준 물체를 사용해보세요.`
        : "계산된 벽면 크기가 비정상적입니다.";
    case "render-failed":
      return "정면 보정 렌더링에 실패했습니다.";
  }
}
