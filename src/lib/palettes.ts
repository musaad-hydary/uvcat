// ─── Types ───────────────────────────────────────────────────────────────────

export interface Palette {
  id: string;
  name: string;
  colors: string[]; // hex strings e.g. "#f080a0"
}

// ─── Palette data ─────────────────────────────────────────────────────────────

export const PALETTES: Palette[] = [
  {
    id: "ps1",
    name: "PS1 Default",
    colors: [
      "#000000",
      "#1a0a2e",
      "#16213e",
      "#0f3460",
      "#533483",
      "#e94560",
      "#f5a623",
      "#f8f8f8",
    ],
  },
  {
    id: "gameboy",
    name: "Game Boy",
    colors: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"],
  },
  {
    id: "gameboy-pocket",
    name: "GB Pocket",
    colors: ["#2b2b26", "#504f45", "#8c8c78", "#c6c5b0"],
  },
  {
    id: "pico8",
    name: "PICO-8",
    colors: [
      "#000000",
      "#1d2b53",
      "#7e2553",
      "#008751",
      "#ab5236",
      "#5f574f",
      "#c2c3c7",
      "#fff1e8",
      "#ff004d",
      "#ffa300",
      "#ffec27",
      "#00e436",
      "#29adff",
      "#83769c",
      "#ff77a8",
      "#ffccaa",
    ],
  },
  {
    id: "nes",
    name: "NES",
    colors: [
      "#000000",
      "#fcfcfc",
      "#bcbcbc",
      "#7c7c7c",
      "#a4e4fc",
      "#3cbcfc",
      "#0078f8",
      "#0000fc",
      "#b8b8f8",
      "#6888fc",
      "#0058f8",
      "#00b800",
      "#b8f818",
      "#58d854",
      "#58f898",
      "#00e8d8",
    ],
  },
  {
    id: "silent-hill",
    name: "Silent Hill",
    colors: [
      "#0a0505",
      "#1a0f0f",
      "#2e1a1a",
      "#4a2a2a",
      "#6b3b3b",
      "#8c5050",
      "#b07070",
      "#d0a090",
      "#e8c8b8",
      "#c8a878",
      "#a07850",
      "#704030",
    ],
  },
  {
    id: "res-evil",
    name: "Res. Evil",
    colors: [
      "#000000",
      "#0a0500",
      "#2a1a00",
      "#5a3c10",
      "#8a6030",
      "#b09060",
      "#d8c0a0",
      "#f0e0c8",
      "#3a0000",
      "#6a0000",
      "#a01010",
      "#d04020",
      "#f07050",
      "#ffc0b0",
    ],
  },
  {
    id: "ff7",
    name: "FF7 Midgar",
    colors: [
      "#000000",
      "#0a0a14",
      "#1e2850",
      "#283c7a",
      "#3c5aa0",
      "#5078c0",
      "#78a0d8",
      "#a0c8f0",
      "#c87820",
      "#a05010",
      "#783000",
      "#f0c860",
      "#f8e898",
    ],
  },
  {
    id: "crash",
    name: "Crash",
    colors: [
      "#000000",
      "#3a1500",
      "#6a2800",
      "#b05000",
      "#e08030",
      "#f0c060",
      "#f8e8c0",
      "#0a1a3a",
      "#3060a0",
      "#60a0e0",
      "#90d0ff",
      "#208040",
      "#50c070",
    ],
  },
  {
    id: "spyro",
    name: "Spyro",
    colors: [
      "#1a0030",
      "#3a0060",
      "#6000a0",
      "#9030d8",
      "#c060ff",
      "#e090ff",
      "#f8c8ff",
      "#ff8000",
      "#ffc040",
      "#ffe080",
      "#004080",
      "#0080d0",
      "#40c0ff",
      "#90e0ff",
    ],
  },
  {
    id: "metal-gear",
    name: "Metal Gear",
    colors: [
      "#000000",
      "#1a3a1a",
      "#2a5a2a",
      "#3a7a3a",
      "#4a9a4a",
      "#80c080",
      "#c0e0c0",
      "#1a1a00",
      "#6a6a00",
      "#a0a000",
      "#d4d440",
      "#f0f080",
    ],
  },
  {
    id: "cga",
    name: "CGA",
    colors: [
      "#000000",
      "#555555",
      "#aaaaaa",
      "#ffffff",
      "#0000aa",
      "#5555ff",
      "#00aaaa",
      "#55ffff",
      "#aa0000",
      "#ff5555",
      "#aa5500",
      "#ffff55",
      "#aa00aa",
      "#ff55ff",
      "#00aa00",
      "#55ff55",
    ],
  },
  {
    id: "custom",
    name: "Custom",
    colors: ["#f080a0", "#c878a0", "#3a1428", "#1a0a12", "#ffffff", "#000000"],
  },
];

// ─── Nearest color matching ───────────────────────────────────────────────────

// parse "#rrggbb" → [r, g, b] as 0-255 integers
function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

// squared euclidean distance in RGB space — no sqrt needed for comparisons
function colorDist(
  r: number,
  g: number,
  b: number,
  cr: number,
  cg: number,
  cb: number,
): number {
  return (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
}

export function applyPalette(
  imageData: ImageData,
  palette: Palette,
  strength: number, // 0–1
): ImageData {
  if (!palette.colors.length) return imageData;

  // pre-parse all palette colors once
  const parsed = palette.colors.map(hexToRgb);

  const out = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height,
  );

  for (let i = 0; i < out.data.length; i += 4) {
    const pr = out.data[i];
    const pg = out.data[i + 1];
    const pb = out.data[i + 2];

    // find nearest palette color
    let bestDist = Infinity;
    let bestR = pr,
      bestG = pg,
      bestB = pb;

    for (const [cr, cg, cb] of parsed) {
      const d = colorDist(pr, pg, pb, cr, cg, cb);
      if (d < bestDist) {
        bestDist = d;
        bestR = cr;
        bestG = cg;
        bestB = cb;
      }
    }

    // lerp between original and palette snap by strength
    out.data[i] = Math.round(pr + (bestR - pr) * strength);
    out.data[i + 1] = Math.round(pg + (bestG - pg) * strength);
    out.data[i + 2] = Math.round(pb + (bestB - pb) * strength);
    // alpha unchanged
  }

  return out;
}
