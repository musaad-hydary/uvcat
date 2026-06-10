import { useRef } from "react";
import type { FaceEntry } from "./Viewport";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  faces: FaceEntry[];
  selectedFace: string | null;
  onSelectFace: (key: string) => void;
  onFaceImage: (key: string, file: File) => void;
  onRemoveFace: (key: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FaceList({
  faces,
  selectedFace,
  onSelectFace,
  onFaceImage,
  onRemoveFace,
}: Props) {
  if (faces.length === 0) {
    return (
      <div className="panel bi" style={{ flex: 1 }}>
        <div className="panel-label">// FACES</div>
        <div
          style={{
            fontSize: 12,
            color: "var(--hi-dark)",
            letterSpacing: "0.1em",
            lineHeight: 1.8,
            padding: "4px 0",
          }}
        >
          NO FACES PICKED.
          <br />
          ENABLE PICK MODE
          <br />
          AND CLICK THE MODEL.
          <br />
          ＾・ω・＾
        </div>
      </div>
    );
  }

  return (
    <div className="panel bi" style={{ flex: 1, overflowY: "auto" }}>
      <div className="panel-label">// FACES ({faces.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {faces.map((face) => (
          <FaceRow
            key={face.key}
            face={face}
            isActive={face.key === selectedFace}
            onSelect={() => onSelectFace(face.key)}
            onImage={(file) => onFaceImage(face.key, file)}
            onRemove={() => onRemoveFace(face.key)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Face row ────────────────────────────────────────────────────────────────

interface FaceRowProps {
  face: FaceEntry;
  isActive: boolean;
  onSelect: () => void;
  onImage: (file: File) => void;
  onRemove: () => void;
}

function FaceRow({
  face,
  isActive,
  onSelect,
  onImage,
  onRemove,
}: FaceRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`face-entry ${isActive ? "active" : ""}`}
      onClick={onSelect}
    >
      {/* thumbnail */}
      <div className="face-thumb">
        {face.textureDataUrl ? (
          <img src={face.textureDataUrl} alt="face texture" />
        ) : (
          <span style={{ fontSize: 18, color: "var(--hi-dark)" }}>·</span>
        )}
      </div>

      {/* info */}
      <div className="face-info">
        <span className="face-label">{face.label}</span>
        <span className="face-sublabel">
          {face.textureDataUrl ? "TEXTURE SET" : "NO TEXTURE"}
        </span>
      </div>

      {/* upload button */}
      <button
        className="action-btn"
        style={{ flexShrink: 0, fontSize: 12, padding: "3px 6px" }}
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
      >
        ↑ IMG
      </button>

      {/* remove button */}
      <button
        className="action-btn"
        style={{
          flexShrink: 0,
          fontSize: 12,
          padding: "3px 6px",
          color: "var(--hi3)",
          borderLeftColor: "var(--accent)",
        }}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        ✕
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImage(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
