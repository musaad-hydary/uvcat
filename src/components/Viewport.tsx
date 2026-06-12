import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { floodFillFace, buildSubGeo, getUVBounds } from "../lib/floodFill";
import {
  buildAtlas,
  remapUVs,
  applyAtlasToModel,
  exportGLB,
} from "../lib/uvAtlas";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FaceEntry {
  key: string;
  meshUuid: string;
  seedTriIndex: number;
  triIndices: number[];
  label: string;
  textureDataUrl: string | null;
}

interface Props {
  textureCanvas: HTMLCanvasElement | null;
  pickMode: boolean;
  onPickModeChange: (v: boolean) => void;
  faces: FaceEntry[];
  selectedFace: string | null;
  onFacesChange: (faces: FaceEntry[]) => void;
  onSelectFace: (key: string | null) => void;
  onFaceTexture: (
    key: string,
    dataUrl: string,
    tex: THREE.CanvasTexture,
  ) => void;
  pixelScale: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function convertAllToBasic(root: THREE.Object3D): void {
  getMeshes(root).forEach((mesh) => {
    mesh.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  });
}

function getMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) out.push(c as THREE.Mesh);
  });
  return out;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Viewport({
  textureCanvas,
  pickMode,
  faces,
  selectedFace,
  onFacesChange,
  onSelectFace,
  pixelScale,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rootRef = useRef<THREE.Object3D | null>(null);
  const highlightRef = useRef<THREE.Mesh | null>(null);
  const rafRef = useRef<number>(0);
  const convertedRef = useRef(false);

  const meshCanvasRef = useRef<
    Map<
      string,
      {
        canvas: HTMLCanvasElement;
        tex: THREE.CanvasTexture;
      }
    >
  >(new Map());

  const pickModeRef = useRef(pickMode);
  const facesRef = useRef(faces);
  const textureRef = useRef(textureCanvas);
  const pixelScaleRef = useRef(pixelScale);

  useEffect(() => {
    pickModeRef.current = pickMode;
  }, [pickMode]);
  useEffect(() => {
    facesRef.current = faces;
  }, [faces]);
  useEffect(() => {
    textureRef.current = textureCanvas;
  }, [textureCanvas]);
  useEffect(() => {
    pixelScaleRef.current = pixelScale;
  }, [pixelScale]);

  // ── Update pixel scale live ────────────────────────────────────────────────
  useEffect(() => {
    const renderer = rendererRef.current;
    const el = mountRef.current;
    if (!renderer || !el) return;
    renderer.setPixelRatio(pixelScale);
    renderer.setSize(el.clientWidth, el.clientHeight || 500);
  }, [pixelScale]);

  // ── Scene init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;
    const el = mountRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(pixelScaleRef.current);
    renderer.setSize(el.clientWidth || 800, el.clientHeight || 500);
    renderer.domElement.style.imageRendering = "pixelated";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      (el.clientWidth || 800) / (el.clientHeight || 500),
      0.01,
      1000,
    );
    camera.position.set(0, 0.5, 3);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.5;
    controls.maxDistance = 20;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(2, 4, 3);
    scene.add(sun);

    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x8a3858 }),
    );
    cube.position.set(0, 0, 0);
    scene.add(cube);
    rootRef.current = cube;

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight || 500;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  // ── Face picking click ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = rendererRef.current?.domElement;
    if (!canvas) return;

    const onClick = (e: MouseEvent) => {
      if (!pickModeRef.current) return;
      if (!rootRef.current || !cameraRef.current) return;

      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        ((e.clientY - rect.top) / rect.height) * -2 + 1,
      );

      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, cameraRef.current);

      const meshes = getMeshes(rootRef.current);
      const hits = ray.intersectObjects(meshes, false);
      if (!hits.length) return;

      const hit = hits[0];
      const mesh = hit.object as THREE.Mesh;
      const seedTriIndex = hit.faceIndex ?? 0;
      const triIndices = floodFillFace(mesh.geometry, seedTriIndex);

      const triSet = new Set(triIndices);
      const existing = facesRef.current.find(
        (f) =>
          f.meshUuid === mesh.uuid && f.triIndices.some((t) => triSet.has(t)),
      );
      if (existing) {
        onSelectFace(existing.key);
        return;
      }

      const key = `${mesh.uuid}-${seedTriIndex}`;
      const meshIdx = getMeshes(rootRef.current!).indexOf(mesh);

      const entry: FaceEntry = {
        key,
        meshUuid: mesh.uuid,
        seedTriIndex,
        triIndices,
        label: `MESH ${meshIdx} / FACE ${seedTriIndex}`,
        textureDataUrl: null,
      };

      onFacesChange([...facesRef.current, entry]);
      onSelectFace(key);
    };

    canvas.addEventListener("click", onClick);
    return () => canvas.removeEventListener("click", onClick);
  }, [onSelectFace, onFacesChange]);

  // ── Highlight selected face ────────────────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (highlightRef.current) {
      scene.remove(highlightRef.current);
      highlightRef.current.geometry.dispose();
      highlightRef.current = null;
    }

    if (!selectedFace || !rootRef.current) return;

    const entry = facesRef.current.find((f) => f.key === selectedFace);
    if (!entry) return;

    const mesh = getMeshes(rootRef.current).find(
      (m) => m.uuid === entry.meshUuid,
    );
    if (!mesh) return;

    const subGeo = buildSubGeo(mesh.geometry, entry.triIndices);
    const highlight = new THREE.Mesh(
      subGeo,
      new THREE.MeshBasicMaterial({
        color: 0xf080a0,
        transparent: true,
        opacity: 0.5,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        side: THREE.DoubleSide,
      }),
    );

    mesh.updateWorldMatrix(true, false);
    highlight.matrix.copy(mesh.matrixWorld);
    highlight.matrixAutoUpdate = false;

    scene.add(highlight);
    highlightRef.current = highlight;
  }, [selectedFace]);

  // ── Disable orbit when picking ─────────────────────────────────────────────
  useEffect(() => {
    if (!controlsRef.current) return;
    controlsRef.current.enabled = !pickMode;
  }, [pickMode]);

  // ── Apply global texture from image mode ──────────────────────────────────
  useEffect(() => {
    if (!textureCanvas || !rootRef.current) return;
    if (facesRef.current.some((f) => f.textureDataUrl)) return;

    const tex = new THREE.CanvasTexture(textureCanvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;

    getMeshes(rootRef.current).forEach((mesh) => {
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      mats.forEach((m) => {
        (m as THREE.MeshBasicMaterial).map = tex;
        m.needsUpdate = true;
      });
    });
  }, [textureCanvas]);

  // ── Load .glb ─────────────────────────────────────────────────────────────
  const loadGLB = useCallback(
    (file: File) => {
      if (!sceneRef.current || !cameraRef.current) return;

      const url = URL.createObjectURL(file);
      new GLTFLoader().load(
        url,
        (gltf) => {
          const scene = sceneRef.current!;
          const camera = cameraRef.current!;

          if (highlightRef.current) {
            scene.remove(highlightRef.current);
            highlightRef.current.geometry.dispose();
            highlightRef.current = null;
          }
          if (rootRef.current) scene.remove(rootRef.current);

          onFacesChange([]);
          onSelectFace(null);
          convertedRef.current = false;
          meshCanvasRef.current.clear();

          const model = gltf.scene;

          model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.frustumCulled = false;
              mesh.visible = true;
              mesh.material = new THREE.MeshNormalMaterial();
            }
          });

          // ── pivot group for centered GIF spin ─────────────────────────────
          const pivot = new THREE.Group();
          scene.add(pivot);
          pivot.add(model);

          // compute bounding box and center model inside pivot
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          model.position.sub(center);

          // store pivot as root so GIF spin rotates around true center
          rootRef.current = pivot;

          // auto-fit camera
          const maxDim = Math.max(size.x, size.y, size.z);
          const fov = camera.fov * (Math.PI / 180);
          const camDist = (maxDim / 2 / Math.tan(fov / 2)) * 1.5;

          camera.position.set(0, 0, camDist);
          camera.near = camDist / 100;
          camera.far = camDist * 100;
          camera.updateProjectionMatrix();

          controlsRef.current!.target.set(0, 0, 0);
          controlsRef.current!.minDistance = camDist * 0.05;
          controlsRef.current!.maxDistance = camDist * 10;
          controlsRef.current!.update();

          URL.revokeObjectURL(url);
        },
        undefined,
        (error) => console.error("GLTFLoader error:", error),
      );
    },
    [onFacesChange, onSelectFace],
  );

  // ── Apply per-face texture ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = async (e: Event) => {
      const { key, tex: faceTex } = (
        e as CustomEvent<{
          key: string;
          dataUrl: string;
          tex: THREE.CanvasTexture;
        }>
      ).detail;

      if (!rootRef.current) return;

      const entry = facesRef.current.find((f) => f.key === key);
      if (!entry) return;

      const mesh = getMeshes(rootRef.current).find(
        (m) => m.uuid === entry.meshUuid,
      );
      if (!mesh) return;

      if (!convertedRef.current) {
        convertAllToBasic(rootRef.current);
        convertedRef.current = true;
      }

      const SIZE = 1024;

      let record = meshCanvasRef.current.get(entry.meshUuid);
      if (!record) {
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#aaaaaa";
        ctx.fillRect(0, 0, SIZE, SIZE);

        const compositeTex = new THREE.CanvasTexture(canvas);
        compositeTex.magFilter = THREE.NearestFilter;
        compositeTex.minFilter = THREE.NearestFilter;
        compositeTex.flipY = false;
        compositeTex.needsUpdate = true;

        record = { canvas, tex: compositeTex };
        meshCanvasRef.current.set(entry.meshUuid, record);

        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.map = compositeTex;
        mat.color.set(0xffffff);
        mat.needsUpdate = true;
      }

      const bounds = getUVBounds(mesh.geometry, entry.triIndices);
      if (!bounds) return;

      const { canvas, tex: compositeTex } = record;
      const ctx = canvas.getContext("2d")!;

      const srcCanvas = faceTex.image as HTMLCanvasElement;
      if (!srcCanvas || !srcCanvas.width) return;

      const dx = bounds.minU * SIZE;
      const dy = bounds.minV * SIZE;
      const dw = Math.max(1, (bounds.maxU - bounds.minU) * SIZE);
      const dh = Math.max(1, (bounds.maxV - bounds.minV) * SIZE);

      ctx.drawImage(srcCanvas, dx, dy, dw, dh);
      compositeTex.needsUpdate = true;

      const scene = sceneRef.current;
      if (scene && highlightRef.current) {
        scene.remove(highlightRef.current);
        highlightRef.current.geometry.dispose();
        highlightRef.current = null;
      }
    };

    window.addEventListener("uvcat:faceTexture", handler);
    return () => window.removeEventListener("uvcat:faceTexture", handler);
  }, []);

  // ── Remove per-face texture ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent<string>).detail;
      if (!rootRef.current) return;

      const entry = facesRef.current.find((f) => f.key === key);
      if (!entry) return;

      const mesh = getMeshes(rootRef.current).find(
        (m) => m.uuid === entry.meshUuid,
      );
      if (!mesh) return;

      const record = meshCanvasRef.current.get(entry.meshUuid);
      if (record) {
        const { canvas, tex } = record;
        const ctx = canvas.getContext("2d")!;
        const SIZE = canvas.width;
        const bounds = getUVBounds(mesh.geometry, entry.triIndices);
        if (bounds) {
          const dx = bounds.minU * SIZE;
          const dy = bounds.minV * SIZE;
          const dw = Math.max(1, (bounds.maxU - bounds.minU) * SIZE);
          const dh = Math.max(1, (bounds.maxV - bounds.minV) * SIZE);
          ctx.fillStyle = "#aaaaaa";
          ctx.fillRect(dx, dy, dw, dh);
          tex.needsUpdate = true;
        }
      }

      const scene = sceneRef.current;
      if (scene && highlightRef.current) {
        scene.remove(highlightRef.current);
        highlightRef.current.geometry.dispose();
        highlightRef.current = null;
      }
    };

    window.addEventListener("uvcat:removeFace", handler);
    return () => window.removeEventListener("uvcat:removeFace", handler);
  }, []);

  // ── Spin GIF export ───────────────────────────────────────────────────────
  useEffect(() => {
    const handler = async () => {
      if (
        !rendererRef.current ||
        !sceneRef.current ||
        !cameraRef.current ||
        !rootRef.current
      )
        return;

      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const pivot = rootRef.current;
      const steps = 35;

      const GIF = (await import("gif.js")).default;
      const gif = new GIF({
        workers: 2,
        quality: 10,
        workerScript: "/gif.worker.js",
        transparent: "rgba(0,0,0,0)",
        background: "#000000",
      });

      const origY = pivot.rotation.y;
      const origPixelRatio = renderer.getPixelRatio();

      if (highlightRef.current) highlightRef.current.visible = false;

      renderer.setPixelRatio(0.1);

      for (let i = 0; i < steps; i++) {
        pivot.rotation.y = (i / steps) * Math.PI * 2;
        renderer.render(scene, camera);
        const frame = document.createElement("canvas");
        frame.width = renderer.domElement.width;
        frame.height = renderer.domElement.height;
        const fctx = frame.getContext("2d")!;
        fctx.imageSmoothingEnabled = false;
        fctx.drawImage(renderer.domElement, 0, 0);
        gif.addFrame(frame, { delay: 100, copy: true });
      }

      pivot.rotation.y = origY;
      if (highlightRef.current) highlightRef.current.visible = true;
      renderer.setPixelRatio(origPixelRatio);

      gif.on("finished", (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "uvcat_spin.gif";
        a.click();
        URL.revokeObjectURL(url);
        window.dispatchEvent(new CustomEvent("uvcat:gifDone"));
      });

      gif.render();
    };

    window.addEventListener("uvcat:exportGif", handler);
    return () => window.removeEventListener("uvcat:exportGif", handler);
  }, []);

  // ── Export model with atlas ───────────────────────────────────────────────
  useEffect(() => {
    const handler = async () => {
      if (!rootRef.current) return;

      const currentFaces = facesRef.current;
      const textured = currentFaces.filter((f) => f.textureDataUrl);

      if (!textured.length) {
        alert("No face textures to export.");
        return;
      }

      try {
        const atlas = await buildAtlas(currentFaces, rootRef.current);
        remapUVs(rootRef.current, currentFaces, atlas);
        applyAtlasToModel(rootRef.current, atlas);
        await exportGLB(rootRef.current);
      } catch (err) {
        console.error("Export failed:", err);
        alert("Export failed — check console.");
      }
    };

    window.addEventListener("uvcat:exportModel", handler);
    return () => window.removeEventListener("uvcat:exportModel", handler);
  }, []);

  // ── Export atlas PNG ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = async () => {
      const currentFaces = facesRef.current.filter((f) => f.textureDataUrl);
      if (!currentFaces.length || !rootRef.current) {
        alert("No face textures to export.");
        return;
      }
      try {
        const atlas = await buildAtlas(facesRef.current, rootRef.current);
        const a = document.createElement("a");
        a.href = atlas.dataUrl;
        a.download = "uvcat_atlas.png";
        a.click();
      } catch (err) {
        console.error("Atlas export failed:", err);
      }
    };

    window.addEventListener("uvcat:exportPng", handler);
    return () => window.removeEventListener("uvcat:exportPng", handler);
  }, []);

  // ── Load model event ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const file = (e as CustomEvent<File>).detail;
      loadGLB(file);
    };
    window.addEventListener("uvcat:loadModel", handler);
    return () => window.removeEventListener("uvcat:loadModel", handler);
  }, [loadGLB]);

  return (
    <div
      ref={mountRef}
      className="viewport bi"
      style={{ cursor: pickMode ? "crosshair" : "grab" }}
    />
  );
}
