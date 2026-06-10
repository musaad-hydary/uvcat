import { useState, useEffect } from "react";

const FRAMES = ["=^-.-^=", "=^-o-^=", "=^-O-^=", "=^-_-^="];

function CatEmoticon() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 400);
    return () => clearInterval(id);
  }, []);
  return <div className="emoticon">{FRAMES[frame]}</div>;
}

interface Props {
  mode: "texture" | "model";
  hasImage: boolean;
  hasModel: boolean;
  hasOutput: boolean;
  pickMode: boolean;
  gifRendering: boolean;
  onLoad: () => void;
  onExportGlb: () => void;
  onExportPng: () => void;
  onExportGif: () => void;
  onPickToggle: () => void;
}

export default function DialogBar({
  mode,
  hasImage,
  hasModel,
  hasOutput,
  pickMode,
  gifRendering,
  onLoad,
  onExportGlb,
  onExportPng,
  onExportGif,
  onPickToggle,
}: Props) {
  function getDialogText() {
    if (mode === "texture") {
      if (!hasImage)
        return (
          <>
            Drop an image to <span className="accent">begin.</span>
          </>
        );
      if (!hasOutput)
        return (
          <>
            Processing <span className="accent">texture...</span>
          </>
        );
      return (
        <>
          Texture ready. <span className="accent">Download?</span>
        </>
      );
    }
    if (!hasModel)
      return (
        <>
          Load a <span className="accent">.glb</span> to begin.
        </>
      );
    if (!pickMode)
      return (
        <>
          Model loaded. <span className="accent">Pick a face?</span>
        </>
      );
    return (
      <>
        Click any face on the <span className="accent">model.</span>
      </>
    );
  }

  return (
    <div className="dialog-bar">
      <div className="dialog-left">
        <CatEmoticon />
        <div className="dialog-arrow" />
        <div className="dialog-bubble">
          <span className="dialog-text">{getDialogText()}</span>
        </div>
      </div>
      <div className="dialog-btns">
        {mode === "model" && hasModel && (
          <button
            className={`action-btn ${pickMode ? "primary" : ""}`}
            onClick={onPickToggle}
          >
            {pickMode ? "✦ PICKING..." : "◈ PICK FACE"}
          </button>
        )}
        <button className="action-btn" onClick={onLoad}>
          {mode === "texture" ? "↑ LOAD IMG" : "↑ LOAD MODEL"}
        </button>
        {mode === "model" ? (
          <>
            <button
              className="action-btn primary"
              onClick={onExportGlb}
              disabled={!hasOutput}
            >
              ▼ GLB
            </button>
            <button
              className="action-btn primary"
              onClick={onExportPng}
              disabled={!hasOutput}
            >
              ▼ PNG
            </button>
            <button
              className="action-btn primary"
              onClick={onExportGif}
              disabled={!hasModel || gifRendering}
            >
              {gifRendering ? "RENDERING..." : "⊕ GIF"}
            </button>
          </>
        ) : (
          <button
            className="action-btn primary"
            onClick={onExportPng}
            disabled={!hasOutput}
          >
            ▼ EXPORT
          </button>
        )}
      </div>
    </div>
  );
}
