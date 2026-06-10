import { useRef } from "react";
import { DEFAULT_OPTIONS } from "../lib/ps1";
import type { PS1Options, DitherMode } from "../lib/ps1";
import { PALETTES } from "../lib/palettes";
import type { Palette } from "../lib/palettes";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  opts: PS1Options;
  onOptsChange: (opts: PS1Options) => void;
  palette: Palette | null;
  paletteStrength: number;
  onPaletteChange: (p: Palette | null) => void;
  onStrengthChange: (v: number) => void;
  onImageUpload: (file: File) => void;
  hasImage: boolean;
  pixelScale: number;
  onPixelScaleChange: (v: number) => void;
}

// ─── Slider ──────────────────────────────────────────────────────────────────

interface SliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display?: string;
  onChange: (v: number) => void;
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const raw = min + frac * (max - min);
    const snapped = Math.round(raw / step) * step;
    onChange(Math.max(min, Math.min(max, snapped)));
  }

  return (
    <div className="ctrl-row">
      <span className="ctrl-label">{label}</span>
      <div className="ctrl-track" onClick={handleClick}>
        <div className="ctrl-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="ctrl-val">{display ?? value}</span>
    </div>
  );
}

// ─── Drop zone ───────────────────────────────────────────────────────────────

interface DropZoneProps {
  onFile: (file: File) => void;
}

function DropZone({ onFile }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) onFile(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      className="drop-zone"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="drop-zone-text">
        ↑ DROP IMAGE
        <br />
        OR CLICK TO LOAD
        <br />
        ＾・ω・＾
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleChange}
      />
    </div>
  );
}

// ─── Palette picker ──────────────────────────────────────────────────────────

interface PalettePickerProps {
  selected: Palette | null;
  strength: number;
  onSelect: (p: Palette | null) => void;
  onStrengthChange: (v: number) => void;
}

function PalettePicker({
  selected,
  strength,
  onSelect,
  onStrengthChange,
}: PalettePickerProps) {
  return (
    <>
      {selected && (
        <div className="ctrl-row" style={{ marginBottom: 8 }}>
          <span className="ctrl-label">STRENGTH</span>
          <div
            className="ctrl-track"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const frac = Math.max(
                0,
                Math.min(1, (e.clientX - rect.left) / rect.width),
              );
              onStrengthChange(Math.round(frac * 100) / 100);
            }}
          >
            <div
              className="ctrl-fill"
              style={{ width: `${strength * 100}%` }}
            />
          </div>
          <span className="ctrl-val">{Math.round(strength * 100)}%</span>
        </div>
      )}

      <div className="palette-grid">
        {PALETTES.map((p) => (
          <div
            key={p.id}
            className={`palette-item ${selected?.id === p.id ? "active" : ""}`}
            onClick={() => onSelect(selected?.id === p.id ? null : p)}
            title={p.name}
          >
            <div className="palette-swatches">
              {p.colors.slice(0, 6).map((c, i) => (
                <div
                  key={i}
                  className="palette-swatch"
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="palette-name">{p.name.toUpperCase()}</div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function TexturePanel({
  opts,
  onOptsChange,
  palette,
  paletteStrength,
  onPaletteChange,
  onStrengthChange,
  onImageUpload,
  pixelScale,
  onPixelScaleChange,
}: Props) {
  function set<K extends keyof PS1Options>(key: K, val: PS1Options[K]) {
    onOptsChange({ ...opts, [key]: val });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* ── Source image ── */}
      <div className="panel bi">
        <div className="panel-label">// SOURCE</div>
        <DropZone onFile={onImageUpload} />
      </div>

      {/* ── Resolution ── */}
      <div className="panel bi">
        <div className="panel-label">// RESOLUTION</div>
        <Slider
          label="PIXEL SZ"
          min={16}
          max={256}
          step={8}
          value={opts.resolution}
          display={`${opts.resolution}PX`}
          onChange={(v) => set("resolution", v)}
        />
        <Slider
          label="DEPTH"
          min={2}
          max={8}
          step={1}
          value={opts.colorBits}
          display={`${opts.colorBits}BIT`}
          onChange={(v) => set("colorBits", v)}
        />
      </div>

      {/* ── Effects ── */}
      <div className="panel bi">
        <div className="panel-label">// EFFECTS</div>
        <div className="ctrl-row">
          <span className="ctrl-label">DITHER</span>
        </div>
        <select
          className="ctrl-select"
          value={opts.dither}
          onChange={(e) => set("dither", e.target.value as DitherMode)}
        >
          <option value="none">NONE</option>
          <option value="bayer2">BAYER 2×2</option>
          <option value="bayer4">BAYER 4×4</option>
          <option value="bayer8">BAYER 8×8</option>
          <option value="floyd">FLOYD-STEINBERG</option>
        </select>
        <Slider
          label="UV WARP"
          min={0}
          max={16}
          step={1}
          value={opts.warpStrength}
          onChange={(v) => set("warpStrength", v)}
        />
        <Slider
          label="JITTER"
          min={0}
          max={10}
          step={1}
          value={opts.jitterStrength}
          onChange={(v) => set("jitterStrength", v)}
        />
      </div>

      {/* ── Post-process ── */}
      <div className="panel bi">
        <div className="panel-label">// POST-PROCESS</div>
        <Slider
          label="BRIGHT"
          min={-100}
          max={100}
          step={1}
          value={opts.brightness}
          onChange={(v) => set("brightness", v)}
        />
        <Slider
          label="CONTRAST"
          min={-100}
          max={100}
          step={1}
          value={opts.contrast}
          onChange={(v) => set("contrast", v)}
        />
        <Slider
          label="SAT"
          min={-100}
          max={100}
          step={1}
          value={opts.saturation}
          onChange={(v) => set("saturation", v)}
        />
      </div>

      {/* ── Tiling ── */}
      <div className="panel bi">
        <div className="panel-label">// TILING</div>
        <div className="tile-row">
          {([1, 2, 4] as const).map((t) => (
            <button
              key={t}
              className={`tile-btn ${opts.tileCount === t ? "active" : ""}`}
              onClick={() => set("tileCount", t)}
            >
              {t}×{t}
            </button>
          ))}
        </div>
      </div>

      {/* ── Viewport ── */}
      <div className="panel bi">
        <div className="panel-label">// VIEWPORT</div>
        <Slider
          label="PIXEL RES"
          min={0.1}
          max={1.0}
          step={0.05}
          value={pixelScale}
          display={`${Math.round(pixelScale * 100)}%`}
          onChange={onPixelScaleChange}
        />
      </div>

      {/* ── Palette ── */}
      <div className="panel bi">
        <div className="panel-label">
          // PALETTE
          {palette && (
            <button
              onClick={() => onPaletteChange(null)}
              style={{
                marginLeft: 8,
                background: "none",
                border: "none",
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                color: "var(--hi2)",
                cursor: "pointer",
                letterSpacing: "0.1em",
              }}
            >
              [CLEAR]
            </button>
          )}
        </div>
        <PalettePicker
          selected={palette}
          strength={paletteStrength}
          onSelect={onPaletteChange}
          onStrengthChange={onStrengthChange}
        />
      </div>

      {/* ── Reset ── */}
      <div className="panel bi">
        <button
          className="action-btn"
          style={{ width: "100%" }}
          onClick={() => onOptsChange(DEFAULT_OPTIONS)}
        >
          ↺ RESET ALL
        </button>
      </div>
    </div>
  );
}
