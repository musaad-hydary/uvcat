import * as THREE from "three";
import type { FaceEntry } from "../components/Viewport";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AtlasEntry {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AtlasResult {
  canvas: HTMLCanvasElement;
  entries: AtlasEntry[];
  dataUrl: string;
  width: number;
  height: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) out.push(c as THREE.Mesh);
  });
  return out;
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// ─── Build atlas from composite mesh canvases ─────────────────────────────────
// Each mesh that has been textured has a composite canvas stored in its
// MeshBasicMaterial.map.image. We collect those and pack them side by side.

export async function buildAtlas(
  faces: FaceEntry[],
  root: THREE.Object3D,
): Promise<AtlasResult> {
  const textured = faces.filter((f) => f.textureDataUrl);
  if (!textured.length) throw new Error("No textured faces to pack");

  // collect unique mesh uuids that have textures
  const meshUuids = [...new Set(textured.map((f) => f.meshUuid))];

  // gather composite canvases from mesh materials
  const meshCanvases: { meshUuid: string; canvas: HTMLCanvasElement }[] = [];

  getMeshes(root).forEach((mesh) => {
    if (!meshUuids.includes(mesh.uuid)) return;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    if (!mat.map?.image) return;
    meshCanvases.push({
      meshUuid: mesh.uuid,
      canvas: mat.map.image as HTMLCanvasElement,
    });
  });

  if (!meshCanvases.length)
    throw new Error("No composite canvases found on meshes");

  // pack canvases horizontally
  const totalW = meshCanvases.reduce((s, m) => s + m.canvas.width, 0);
  const maxH = Math.max(...meshCanvases.map((m) => m.canvas.height));
  const atlasW = nextPow2(totalW);
  const atlasH = nextPow2(maxH);

  const canvas = document.createElement("canvas");
  canvas.width = atlasW;
  canvas.height = atlasH;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, atlasW, atlasH);

  const entries: AtlasEntry[] = [];
  let curX = 0;

  for (const { meshUuid, canvas: src } of meshCanvases) {
    ctx.drawImage(src, curX, 0, src.width, src.height);
    entries.push({
      key: meshUuid,
      x: curX,
      y: 0,
      width: src.width,
      height: src.height,
    });
    curX += src.width;
  }

  return {
    canvas,
    entries,
    dataUrl: canvas.toDataURL("image/png"),
    width: atlasW,
    height: atlasH,
  };
}

// ─── Remap UVs to atlas space ─────────────────────────────────────────────────
// Since composite canvases already use the mesh's own UV space (0-1),
// we just need to shift each mesh's UVs to point at its slice in the atlas.

export function remapUVs(
  root: THREE.Object3D,
  _faces: FaceEntry[],
  atlas: AtlasResult,
): void {
  const atlasW = atlas.width;
  const atlasH = atlas.height;

  // build lookup: meshUuid → atlas entry
  const lookup = new Map<string, AtlasEntry>();
  for (const e of atlas.entries) lookup.set(e.key, e);

  getMeshes(root).forEach((mesh) => {
    const entry = lookup.get(mesh.uuid);
    if (!entry) return;

    const geo = mesh.geometry;
    const uvs = geo.attributes.uv as THREE.BufferAttribute | undefined;
    if (!uvs) return;

    // offset factor: how far right this mesh's canvas starts in the atlas
    const uOffset = entry.x / atlasW;
    const uScale = entry.width / atlasW;
    // composite canvas uses flipY=false so V is already in canvas space
    // atlas also uses flipY=false so no V flip needed
    const vScale = entry.height / atlasH;

    const newUvs = new Float32Array(uvs.array);

    for (let i = 0; i < uvs.count; i++) {
      const u = uvs.getX(i);
      const v = uvs.getY(i);
      newUvs[i * 2] = uOffset + u * uScale;
      newUvs[i * 2 + 1] = v * vScale;
    }

    geo.setAttribute("uv", new THREE.BufferAttribute(newUvs, 2));
    geo.attributes.uv.needsUpdate = true;
  });
}

// ─── Apply atlas texture to whole model ──────────────────────────────────────

export function applyAtlasToModel(
  root: THREE.Object3D,
  atlas: AtlasResult,
): void {
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.flipY = false;
  tex.needsUpdate = true;

  getMeshes(root).forEach((mesh) => {
    mesh.material = new THREE.MeshBasicMaterial({
      map: tex,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  });
}

// ─── GLB export ──────────────────────────────────────────────────────────────

export async function exportGLB(root: THREE.Object3D): Promise<void> {
  const { GLTFExporter } =
    await import("three/addons/exporters/GLTFExporter.js");

  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      root,
      (result) => {
        const blob = new Blob([result as ArrayBuffer], {
          type: "model/gltf-binary",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "uvcat_export.glb";
        a.click();
        URL.revokeObjectURL(url);
        resolve();
      },
      (error) => {
        console.error("GLTFExporter error:", error);
        reject(error);
      },
      { binary: true },
    );
  });
}
