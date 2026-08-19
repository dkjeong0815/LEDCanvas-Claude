/**
 * Grabs a still out of a video file.
 *
 * The sheet and the PNG are paper — they need one frame, not a clip. Capturing
 * that frame once, when the file is dropped in, keeps printing clear of decoder
 * timing: by the time anyone presses 인쇄 the still already exists. A <video>
 * element printed directly comes out blank in some browsers, so this is not an
 * optimisation, it is the only reliable way to get the content onto the sheet.
 */

export interface VideoPoster {
  /** blob URL of the captured frame */
  url: string;
  widthPx: number;
  heightPx: number;
  /** luminance-weighted average colour of the frame, as "r, g, b" */
  glowColor: string;
}

/**
 * The colour a lit panel would throw onto the wall.
 *
 * A plain average washes out to grey, because dark pixels drag every hue
 * towards the middle. Real light does not work that way — the bright parts of
 * a picture are what actually spill — so each pixel is weighted by its own
 * luminance.
 */
function averageGlowColor(ctx: CanvasRenderingContext2D, w: number, h: number): string {
  const { data } = ctx.getImageData(0, 0, w, h);
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;
  // Every 4th pixel is plenty for an average and keeps large frames quick.
  for (let i = 0; i < data.length; i += 16) {
    const luma = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
    r += data[i] * luma;
    g += data[i + 1] * luma;
    b += data[i + 2] * luma;
    weight += luma;
  }
  if (weight === 0) return "255, 255, 255";
  return `${Math.round(r / weight)}, ${Math.round(g / weight)}, ${Math.round(b / weight)}`;
}

const CAPTURE_TIMEOUT_MS = 15000;

export function captureFirstFrame(videoUrl: string): Promise<VideoPoster> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const timer = setTimeout(
      () => fail("동영상을 읽는 데 너무 오래 걸립니다."),
      CAPTURE_TIMEOUT_MS
    );

    const grab = () => {
      if (settled) return;
      const widthPx = video.videoWidth;
      const heightPx = video.videoHeight;
      if (!widthPx || !heightPx) return fail("동영상 화면 크기를 읽지 못했습니다.");

      const canvas = document.createElement("canvas");
      canvas.width = widthPx;
      canvas.height = heightPx;
      const ctx = canvas.getContext("2d");
      if (!ctx) return fail("캔버스를 만들지 못했습니다.");
      ctx.drawImage(video, 0, 0);
      const glowColor = averageGlowColor(ctx, widthPx, heightPx);

      canvas.toBlob(
        (blob) => {
          if (settled) return;
          if (!blob) return fail("첫 프레임을 저장하지 못했습니다.");
          settled = true;
          cleanup();
          resolve({ url: URL.createObjectURL(blob), widthPx, heightPx, glowColor });
        },
        "image/jpeg",
        0.92
      );
    };

    video.onloadeddata = () => {
      // Some browsers hand over a decoded frame only after a seek, so nudge
      // slightly off zero and take whatever lands.
      const target = Number.isFinite(video.duration) ? Math.min(0.04, video.duration / 2) : 0.04;
      if (video.currentTime === target) grab();
      else
        try {
          video.currentTime = target;
        } catch {
          grab();
        }
    };
    video.onseeked = grab;
    video.onerror = () => fail("이 동영상 형식은 브라우저에서 재생할 수 없습니다.");

    video.src = videoUrl;
  });
}
