/**
 * Every layer's content carries a still, whatever it is.
 *
 * The sheet and the PNG are paper: they hold one frame per layer and cannot
 * hold more. An image is already that frame; a video has to give one up. So the
 * work here is lopsided on purpose — the video path extracts a frame, the image
 * path just reports its colour — and everything downstream reads a still
 * without knowing which kind it came from.
 */

/** Longest side of the scratch canvas the average colour is taken from. */
const SAMPLE_MAX = 256;
const CAPTURE_TIMEOUT_MS = 15000;

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
 * towards the middle. Real light does not work that way — the bright parts of a
 * picture are what actually spill — so each pixel is weighted by its own
 * luminance.
 *
 * Sampling happens on a downscaled copy. A 4000 px photo has nothing more to
 * say about its average colour than a 256 px one, and reading twelve million
 * pixels to find that out would stall the upload.
 */
function glowColorFrom(source: CanvasImageSource, widthPx: number, heightPx: number): string {
  const scale = Math.min(1, SAMPLE_MAX / Math.max(widthPx, heightPx));
  const w = Math.max(1, Math.round(widthPx * scale));
  const h = Math.max(1, Math.round(heightPx * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "255, 255, 255";
  ctx.drawImage(source, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;
  for (let i = 0; i < data.length; i += 4) {
    const luma = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
    r += data[i] * luma;
    g += data[i + 1] * luma;
    b += data[i + 2] * luma;
    weight += luma;
  }
  if (weight === 0) return "255, 255, 255";
  return `${Math.round(r / weight)}, ${Math.round(g / weight)}, ${Math.round(b / weight)}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // onload, not decode(): decode() never settles while the page is not being
    // painted, which strands the upload instead of failing it.
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 열 수 없습니다."));
    img.src = url;
  });
}

/** An image is its own still, so only its colour has to be worked out. */
export async function sampleImageGlow(imageUrl: string): Promise<string> {
  const img = await loadImage(imageUrl);
  return glowColorFrom(img, img.naturalWidth, img.naturalHeight);
}

/**
 * Grabs a still out of a video file. A <video> element printed directly comes
 * out blank in some browsers, so this is not an optimisation — it is the only
 * reliable way to get moving content onto paper.
 */
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
      const glowColor = glowColorFrom(video, widthPx, heightPx);

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
