import type { Layer } from "../types";

/** What a printer resolves; more pixels than this land on paper as nothing. */
const PRINT_DPI = 300;
const MM_PER_INCH = 25.4;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}

async function resample(url: string, targetWidthPx: number): Promise<string | null> {
  const img = await loadImage(url);
  if (!img.naturalWidth || img.naturalWidth <= targetWidthPx) return null;

  const scale = targetWidthPx / img.naturalWidth;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.9));
  return blob ? URL.createObjectURL(blob) : null;
}

/**
 * Layers whose stills are sized for the paper they are about to land on.
 *
 * A sheet embeds whatever pixels the picture happens to have. One 4812 px photo
 * printed 56 mm wide is 2183 dpi — seven times the width a printer can resolve,
 * and fifty times the data — which is how a single A3 page reached 21.5 MB.
 * Resampling to 300 dpi changes nothing anyone can see and everything about
 * what has to be carried.
 *
 * Returns the layers untouched where a picture is already small enough, and a
 * list of the URLs it created so the caller can release them.
 */
export async function layersForPrint(
  layers: Layer[],
  /** how wide each layer is drawn on paper, in mm, by layer id */
  printWidthMm: (layer: Layer) => number
): Promise<{ layers: Layer[]; created: string[] }> {
  const created: string[] = [];

  const out = await Promise.all(
    layers.map(async (layer) => {
      if (!layer.content) return layer;
      const targetPx = Math.round((printWidthMm(layer) / MM_PER_INCH) * PRINT_DPI);
      if (targetPx <= 0) return layer;
      try {
        const url = await resample(layer.content.posterUrl, targetPx);
        if (!url) return layer;
        created.push(url);
        return { ...layer, content: { ...layer.content, posterUrl: url } };
      } catch {
        return layer;
      }
    })
  );

  return { layers: out, created };
}
