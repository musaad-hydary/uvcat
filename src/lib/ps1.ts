// ─── Types ──────────────────────────────────────────────────────────────────

export type DitherMode = "none" | "bayer2" | "bayer4" | "bayer8" | "floyd";

export interface PS1Options {
  resolution: number; // output px size (16–256, powers of 2)
  colorBits: number; // bits per channel (2–8, PS1 native = 5)
  dither: DitherMode;
  warpStrength: number; // UV affine warp (0–16)
  jitterStrength: number; // vertex jitter (0–10)
  tileCount: 1 | 2 | 4; // output tiling
  brightness: number; // -100 to 100
  contrast: number; // -100 to 100
  saturation: number; // -100 to 100
}

export const DEFAULT_OPTIONS: PS1Options = {
  resolution: 64,
  colorBits: 5,
  dither: "bayer4",
  warpStrength: 4,
  jitterStrength: 3,
  tileCount: 1,
  brightness: 0,
  contrast: 0,
  saturation: 0,
};

// ─── Bayer matrices ──────────────────────────────────────────────────────────

const BAYER2: number[][] = [
  [0, 2],
  [3, 1],
];

const BAYER4: number[][] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// BAYER8 is derived from BAYER4 — each cell expands into a 2x2 block
const BAYER8: number[][] = (() => {
  const m: number[][] = Array.from({ length: 8 }, () => Array(8).fill(0));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      m[r][c] =
        BAYER4[Math.floor(r / 2)][Math.floor(c / 2)] * 4 + BAYER2[r % 2][c % 2];
    }
  }
  return m;
})();

function bayerThreshold(x: number, y: number, matrix: number[][]): number {
  const s = matrix.length;
  // normalize to -0.5 to +0.5 range so it adds/subtracts symmetrically
  return matrix[y % s][x % s] / (s * s) - 0.5;
}

// ─── Color math ──────────────────────────────────────────────────────────────

// Snap a [0,1] float to the nearest value on a `bits`-level grid
function quantize(v: number, bits: number): number {
  const levels = (1 << bits) - 1;
  return Math.round(Math.min(1, Math.max(0, v)) * levels) / levels;
}

function adjustPixels(
  data: Uint8ClampedArray,
  brightness: number,
  contrast: number,
  saturation: number,
): void {
  const bAdj = brightness / 100;
  // standard Photoshop contrast formula
  const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const sAdj = (saturation + 100) / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;

    // brightness
    r += bAdj;
    g += bAdj;
    b += bAdj;

    // contrast
    r = cFactor * (r - 0.5) + 0.5;
    g = cFactor * (g - 0.5) + 0.5;
    b = cFactor * (b - 0.5) + 0.5;

    // saturation — lerp between luminance gray and original
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = lum + sAdj * (r - lum);
    g = lum + sAdj * (g - lum);
    b = lum + sAdj * (b - lum);

    data[i] = Math.round(Math.min(1, Math.max(0, r)) * 255);
    data[i + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
    data[i + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
  }
}

// ─── Passes ──────────────────────────────────────────────────────────────────

function warpAndJitter(
  src: ImageData,
  dstSize: number,
  warp: number,
  jitter: number,
): ImageData {
  const { width: sw, height: sh, data: sd } = src;
  const out = new ImageData(dstSize, dstSize);

  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      // affine warp — sine wave offset per row/col
      const wx = warp > 0 ? Math.sin((y / dstSize) * Math.PI * 2) * warp : 0;
      const wy = warp > 0 ? Math.cos((x / dstSize) * Math.PI * 2) * warp : 0;
      // random jitter — integer snap simulation
      const jx = jitter > 0 ? (Math.random() - 0.5) * jitter : 0;
      const jy = jitter > 0 ? (Math.random() - 0.5) * jitter : 0;

      const sx = Math.max(
        0,
        Math.min(sw - 1, Math.round((x / dstSize) * sw + wx + jx)),
      );
      const sy = Math.max(
        0,
        Math.min(sh - 1, Math.round((y / dstSize) * sh + wy + jy)),
      );

      const si = (sy * sw + sx) * 4;
      const di = (y * dstSize + x) * 4;
      out.data[di] = sd[si];
      out.data[di + 1] = sd[si + 1];
      out.data[di + 2] = sd[si + 2];
      out.data[di + 3] = sd[si + 3];
    }
  }
  return out;
}

function quantizePass(
  imgData: ImageData,
  bits: number,
  dither: DitherMode,
): ImageData {
  const { width, height } = imgData;

  // work in float32 for accuracy during error diffusion
  const r = new Float32Array(width * height);
  const g = new Float32Array(width * height);
  const b = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    r[i] = imgData.data[i * 4] / 255;
    g[i] = imgData.data[i * 4 + 1] / 255;
    b[i] = imgData.data[i * 4 + 2] / 255;
  }

  if (dither === "floyd") {
    // Floyd-Steinberg error diffusion
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const qr = quantize(r[i], bits);
        const qg = quantize(g[i], bits);
        const qb = quantize(b[i], bits);
        const er = r[i] - qr;
        const eg = g[i] - qg;
        const eb = b[i] - qb;
        r[i] = qr;
        g[i] = qg;
        b[i] = qb;

        // distribute error to neighbours
        const spread: [number, number, number][] = [
          [1, 0, 7 / 16],
          [-1, 1, 3 / 16],
          [0, 1, 5 / 16],
          [1, 1, 1 / 16],
        ];
        for (const [dx, dy, w] of spread) {
          const nx = x + dx,
            ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const ni = ny * width + nx;
            r[ni] += er * w;
            g[ni] += eg * w;
            b[ni] += eb * w;
          }
        }
      }
    }
  } else if (dither !== "none") {
    const matrix =
      dither === "bayer2" ? BAYER2 : dither === "bayer4" ? BAYER4 : BAYER8;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const t = bayerThreshold(x, y, matrix);
        r[i] = quantize(r[i] + t, bits);
        g[i] = quantize(g[i] + t, bits);
        b[i] = quantize(b[i] + t, bits);
      }
    }
  } else {
    for (let i = 0; i < width * height; i++) {
      r[i] = quantize(r[i], bits);
      g[i] = quantize(g[i], bits);
      b[i] = quantize(b[i], bits);
    }
  }

  const out = new ImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    out.data[i * 4] = Math.round(Math.min(1, Math.max(0, r[i])) * 255);
    out.data[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, g[i])) * 255);
    out.data[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, b[i])) * 255);
    out.data[i * 4 + 3] = imgData.data[i * 4 + 3];
  }
  return out;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function cropToSquare(img: HTMLImageElement): HTMLCanvasElement {
  const size = Math.min(img.naturalWidth, img.naturalHeight, 1024);
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  c.getContext("2d")!.drawImage(
    img,
    (img.naturalWidth - size) / 2,
    (img.naturalHeight - size) / 2,
    size,
    size,
    0,
    0,
    size,
    size,
  );
  return c;
}

export function processPS1(
  source: HTMLCanvasElement,
  opts: PS1Options,
): HTMLCanvasElement {
  const {
    resolution: sz,
    colorBits,
    dither,
    warpStrength,
    jitterStrength,
    tileCount,
    brightness,
    contrast,
    saturation,
  } = opts;

  // 1. get source pixels
  const srcCtx = source.getContext("2d")!;
  const srcData = srcCtx.getImageData(0, 0, source.width, source.height);

  // 2. warp + jitter downsample
  let pixels: ImageData;
  if (warpStrength > 0 || jitterStrength > 0) {
    pixels = warpAndJitter(srcData, sz, warpStrength, jitterStrength);
  } else {
    const tmp = document.createElement("canvas");
    tmp.width = sz;
    tmp.height = sz;
    const tc = tmp.getContext("2d")!;
    tc.imageSmoothingEnabled = false;
    tc.drawImage(source, 0, 0, sz, sz);
    pixels = tc.getImageData(0, 0, sz, sz);
  }

  // 3. brightness / contrast / saturation
  adjustPixels(pixels.data, brightness, contrast, saturation);

  // 4. color quantization + dithering
  const quantised = quantizePass(pixels, colorBits, dither);

  // 5. write to tile canvas
  const tile = document.createElement("canvas");
  tile.width = sz;
  tile.height = sz;
  tile.getContext("2d")!.putImageData(quantised, 0, 0);

  // 6. tile output
  const outSize = sz * tileCount;
  const out = document.createElement("canvas");
  out.width = outSize;
  out.height = outSize;
  const oc = out.getContext("2d")!;
  oc.imageSmoothingEnabled = false;
  for (let ty = 0; ty < tileCount; ty++)
    for (let tx = 0; tx < tileCount; tx++)
      oc.drawImage(tile, tx * sz, ty * sz, sz, sz);

  return out;
}

export function downloadCanvas(
  canvas: HTMLCanvasElement,
  filename = "uvcat_texture.png",
): void {
  const a = document.createElement("a");
  a.download = filename;
  a.href = canvas.toDataURL("image/png");
  a.click();
}
