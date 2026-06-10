import { useState, useEffect, useRef, useCallback } from "react";
import TexturePanel from "./components/TexturePanel";
import DialogBar from "./components/DialogBar";
import Viewport from "./components/Viewport";
import FaceList from "./components/FaceList";
import * as THREE from "three";
import type { PS1Options } from "./lib/ps1";
import {
  DEFAULT_OPTIONS,
  processPS1,
  cropToSquare,
  downloadCanvas,
} from "./lib/ps1";
import type { Palette } from "./lib/palettes";
import { applyPalette } from "./lib/palettes";
import type { FaceEntry } from "./components/Viewport";

type Mode = "texture" | "model";

// ─── Welcome modal ────────────────────────────────────────────────────────────

function WelcomeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">▶ WELCOME TO UVCAT</span>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-section">
            <div className="modal-section-title">TEXTURE MODE</div>
            <div className="modal-text">
              Drop any image into the <span className="accent">SOURCE</span>{" "}
              panel or click to load. Adjust resolution, dithering, effects and
              palette to get your PS1 look. Hit{" "}
              <span className="accent">▼ EXPORT</span> to download the processed
              texture.
            </div>
          </div>
          <div className="modal-section">
            <div className="modal-section-title">MODEL MODE</div>
            <div className="modal-text">
              Load a <span className="accent">.glb</span> file to preview your
              3D model. Enable <span className="accent">◈ PICK FACE</span> then
              click any face on the model to select it. Upload a texture to that
              face via <span className="accent">↑ IMG</span> in the faces panel
              — it runs through the PS1 pipeline automatically using your
              current settings. Repeat for as many faces as you want.
            </div>
          </div>
          <div className="modal-section">
            <div className="modal-section-title">EXPORTING</div>
            <div className="modal-text">
              <span className="accent">▼ GLB</span> — exports your model with
              textures baked in.
              <br />
              <span className="accent">▼ PNG</span> — exports the texture atlas
              sheet.
              <br />
              <span className="accent">⊕ GIF</span> — renders a 24-frame
              spinning GIF of your model.
            </div>
          </div>
          <div className="modal-section">
            <div className="modal-section-title">TIPS</div>
            <div className="modal-text">
              Use <span className="accent">PIXEL RES</span> slider to control
              viewport pixelation. Low res = chunky PS1 look. Palettes shift all
              colors at once. Textures are applied per-face based on UV
              coordinates. Press <span className="accent">Ctrl+Z</span> to undo
              face picks and texture changes.
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="action-btn primary" onClick={onClose}>
            ▶ LET'S GO
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [mode, setMode] = useState<Mode>("texture");
  const [darkMode, setDarkMode] = useState(true);
  const [showModal, setShowModal] = useState(true);

  const [opts, setOpts] = useState<PS1Options>(DEFAULT_OPTIONS);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [paletteStrength, setStrength] = useState(1);
  const [sourceCanvas, setSource] = useState<HTMLCanvasElement | null>(null);
  const [outputCanvas, setOutput] = useState<HTMLCanvasElement | null>(null);
  const [outputDataUrl, setOutputUrl] = useState<string | null>(null);

  const [hasModel, setHasModel] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [faces, setFaces] = useState<FaceEntry[]>([]);
  const [selectedFace, setSelected] = useState<string | null>(null);
  const [gifRendering, setGifRendering] = useState(false);
  const [pixelScale, setPixelScale] = useState(0.3);

  // ── undo history ──────────────────────────────────────────────────────────
  const [history, setHistory] = useState<FaceEntry[][]>([]);

  function pushHistory(current: FaceEntry[]) {
    setHistory((prev) => [...prev.slice(-19), [...current]]);
  }

  function handleUndo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    const prevKeys = new Set(prev.map((f) => f.key));

    // find faces that exist now but not in the previous snapshot → remove them
    faces
      .filter((f) => !prevKeys.has(f.key))
      .forEach((f) => {
        window.dispatchEvent(
          new CustomEvent("uvcat:removeFace", { detail: f.key }),
        );
      });

    setHistory((h) => h.slice(0, -1));
    setFaces(prev);
    if (!prev.length) {
      setSelected(null);
    } else if (selectedFace && !prevKeys.has(selectedFace)) {
      setSelected(null);
    }
  }

  // ── keyboard shortcut for undo ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [history, faces, selectedFace]);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!sourceCanvas) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const out = processPS1(sourceCanvas, opts);
      if (palette) {
        const ctx = out.getContext("2d")!;
        const data = ctx.getImageData(0, 0, out.width, out.height);
        const adj = applyPalette(data, palette, paletteStrength);
        ctx.putImageData(adj, 0, 0);
      }
      setOutput(out);
      setOutputUrl(out.toDataURL("image/png"));
    }, 80);
  }, [sourceCanvas, opts, palette, paletteStrength]);

  useEffect(() => {
    const handler = () => setGifRendering(false);
    window.addEventListener("uvcat:gifDone", handler);
    return () => window.removeEventListener("uvcat:gifDone", handler);
  }, []);

  const loadImage = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => setSource(cropToSquare(img));
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  const loadModel = useCallback((file: File) => {
    window.dispatchEvent(new CustomEvent("uvcat:loadModel", { detail: file }));
    setHasModel(true);
    setPickMode(false);
    setFaces([]);
    setSelected(null);
    setHistory([]);
  }, []);

  const handleFaceImage = useCallback(
    (key: string, file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const cropped = cropToSquare(img);
          const processed = processPS1(cropped, opts);
          if (palette) {
            const ctx = processed.getContext("2d")!;
            const data = ctx.getImageData(
              0,
              0,
              processed.width,
              processed.height,
            );
            const adj = applyPalette(data, palette, paletteStrength);
            ctx.putImageData(adj, 0, 0);
          }
          const tex = new THREE.CanvasTexture(processed);
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          tex.needsUpdate = true;
          const dataUrl = processed.toDataURL("image/png");
          window.dispatchEvent(
            new CustomEvent("uvcat:faceTexture", {
              detail: { key, dataUrl, tex },
            }),
          );
          setFaces((prev) => {
            pushHistory(prev);
            return prev.map((f) =>
              f.key === key ? { ...f, textureDataUrl: dataUrl } : f,
            );
          });
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    },
    [opts, palette, paletteStrength],
  );

  function handleLoad() {
    if (mode === "texture") imageInputRef.current?.click();
    else modelInputRef.current?.click();
  }
  function handleExportGlb() {
    window.dispatchEvent(new CustomEvent("uvcat:exportModel"));
  }
  function handleExportPng() {
    if (mode === "texture" && outputCanvas) downloadCanvas(outputCanvas);
    else window.dispatchEvent(new CustomEvent("uvcat:exportPng"));
  }
  function handleExportGif() {
    setGifRendering(true);
    window.dispatchEvent(new CustomEvent("uvcat:exportGif"));
  }
  function handlePickToggle() {
    setPickMode((p) => !p);
  }

  return (
    <div className={`app ${darkMode ? "" : "light"}`}>
      {showModal && <WelcomeModal onClose={() => setShowModal(false)} />}

      {/* ── Topbar ── */}
      <div className="topbar">
        <div className="logo-block">
          <span className="logo-text">UVCAT</span>
        </div>
        <div className="tab-spacer" />
        <div className="tabs">
          <button
            className={`tab ${mode === "texture" ? "active" : ""}`}
            onClick={() => {
              setMode("texture");
              setPickMode(false);
            }}
          >
            TEXTURE
          </button>
          <button
            className={`tab ${mode === "model" ? "active" : ""}`}
            onClick={() => {
              setMode("model");
              setPickMode(false);
            }}
          >
            MODEL
          </button>
          <button
            className="tab icon-btn"
            onClick={handleUndo}
            disabled={history.length === 0}
            title="Undo (Ctrl+Z)"
            style={{ opacity: history.length === 0 ? 0.35 : 1 }}
          >
            ↩
          </button>
          <button
            className="tab icon-btn"
            onClick={() => setShowModal(true)}
            title="Help"
          >
            ?
          </button>
          <button
            className="tab icon-btn"
            onClick={() => setDarkMode((d) => !d)}
            title="Toggle light/dark"
          >
            {darkMode ? "☀" : "☾"}
          </button>
        </div>
      </div>

      {/* ── Main ── */}
      <div className="main">
        <div className="sidebar">
          <TexturePanel
            opts={opts}
            onOptsChange={setOpts}
            palette={palette}
            paletteStrength={paletteStrength}
            onPaletteChange={setPalette}
            onStrengthChange={setStrength}
            onImageUpload={loadImage}
            hasImage={!!sourceCanvas}
            pixelScale={pixelScale}
            onPixelScaleChange={setPixelScale}
          />
        </div>

        <div className="center-col">
          <div
            className="viewport-wrapper"
            style={{ display: mode === "model" ? "flex" : "none" }}
          >
            <Viewport
              textureCanvas={outputCanvas}
              pickMode={pickMode}
              onPickModeChange={setPickMode}
              faces={faces}
              selectedFace={selectedFace}
              onFacesChange={(newFaces) => {
                pushHistory(faces);
                setFaces(newFaces);
              }}
              onSelectFace={setSelected}
              pixelScale={pixelScale}
              onFaceTexture={(key, dataUrl, tex) => {
                window.dispatchEvent(
                  new CustomEvent("uvcat:faceTexture", {
                    detail: { key, dataUrl, tex },
                  }),
                );
                setFaces((prev) =>
                  prev.map((f) =>
                    f.key === key ? { ...f, textureDataUrl: dataUrl } : f,
                  ),
                );
              }}
            />
          </div>

          {mode === "texture" && (
            <div style={{ flex: 1, display: "flex", gap: 4, minHeight: 0 }}>
              <div
                className="panel bi"
                style={{ flex: 1, display: "flex", flexDirection: "column" }}
              >
                <div className="panel-label">ORIGINAL</div>
                <div
                  style={{
                    flex: 1,
                    background: "var(--bg2)",
                    minHeight: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {sourceCanvas ? (
                    <canvas
                      ref={(el) => {
                        if (!el) return;
                        el.width = sourceCanvas.width;
                        el.height = sourceCanvas.height;
                        el.getContext("2d")!.drawImage(sourceCanvas, 0, 0);
                      }}
                      style={{
                        maxWidth: "100%",
                        maxHeight: "100%",
                        imageRendering: "pixelated",
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        fontSize: 16,
                        color: "var(--hi-dark)",
                        letterSpacing: "0.1em",
                      }}
                    >
                      NO IMAGE LOADED
                    </span>
                  )}
                </div>
              </div>
              <div
                className="panel bi"
                style={{ flex: 1, display: "flex", flexDirection: "column" }}
              >
                <div className="panel-label">
                  OUTPUT —{" "}
                  <span style={{ color: "var(--hi)" }}>
                    {opts.resolution}PX · {opts.colorBits}BIT ·{" "}
                    {opts.dither.toUpperCase()}
                  </span>
                </div>
                <div
                  style={{
                    flex: 1,
                    background: "var(--bg2)",
                    minHeight: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {outputDataUrl ? (
                    <img
                      src={outputDataUrl}
                      alt="ps1 output"
                      style={{
                        maxWidth: "100%",
                        maxHeight: "100%",
                        imageRendering: "pixelated",
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        fontSize: 16,
                        color: "var(--hi-dark)",
                        letterSpacing: "0.1em",
                      }}
                    >
                      NO OUTPUT YET
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="right-col">
          {mode === "model" ? (
            <FaceList
              faces={faces}
              selectedFace={selectedFace}
              onSelectFace={setSelected}
              onFaceImage={handleFaceImage}
              onRemoveFace={(key) => {
                pushHistory(faces);
                setFaces((prev) => prev.filter((f) => f.key !== key));
                if (selectedFace === key) setSelected(null);
                window.dispatchEvent(
                  new CustomEvent("uvcat:removeFace", { detail: key }),
                );
              }}
            />
          ) : (
            <div className="panel bi" style={{ flex: 1 }}>
              <div className="panel-label">PREVIEW</div>
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  background: "var(--bg2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid var(--hi-darker)",
                }}
              >
                {outputDataUrl ? (
                  <img
                    src={outputDataUrl}
                    alt="preview"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      imageRendering: "pixelated",
                    }}
                  />
                ) : (
                  <span style={{ fontSize: 14, color: "var(--hi-dark)" }}>
                    NO OUTPUT
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Dialog bar ── */}
      <DialogBar
        mode={mode}
        hasImage={!!sourceCanvas}
        hasModel={hasModel}
        hasOutput={
          mode === "model"
            ? faces.some((f) => f.textureDataUrl)
            : !!outputCanvas
        }
        pickMode={pickMode}
        gifRendering={gifRendering}
        onLoad={handleLoad}
        onExportGlb={handleExportGlb}
        onExportPng={handleExportPng}
        onExportGif={handleExportGif}
        onPickToggle={handlePickToggle}
      />

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) loadImage(f);
          e.target.value = "";
        }}
      />
      <input
        ref={modelInputRef}
        type="file"
        accept=".glb,.gltf"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) loadModel(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
