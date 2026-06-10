import * as THREE from "three";

// ─── Triangle helpers ─────────────────────────────────────────────────────────

// Get the three vertex indices of triangle at triIndex
function getTriIndices(
  geo: THREE.BufferGeometry,
  triIndex: number,
): [number, number, number] {
  if (geo.index) {
    const i = triIndex * 3;
    return [geo.index.getX(i), geo.index.getX(i + 1), geo.index.getX(i + 2)];
  }
  const i = triIndex * 3;
  return [i, i + 1, i + 2];
}

// Compute face normal for a triangle
function getTriNormal(
  geo: THREE.BufferGeometry,
  triIndex: number,
): THREE.Vector3 {
  const pos = geo.attributes.position;
  const [a, b, c] = getTriIndices(geo, triIndex);

  const vA = new THREE.Vector3().fromBufferAttribute(pos, a);
  const vB = new THREE.Vector3().fromBufferAttribute(pos, b);
  const vC = new THREE.Vector3().fromBufferAttribute(pos, c);

  const edge1 = new THREE.Vector3().subVectors(vB, vA);
  const edge2 = new THREE.Vector3().subVectors(vC, vA);
  return new THREE.Vector3().crossVectors(edge1, edge2).normalize();
}

// ─── Edge adjacency map ───────────────────────────────────────────────────────

// Build a map from "vA-vB" edge key → triangle indices that share that edge
// We sort vertex indices so edge AB == edge BA
function buildEdgeMap(geo: THREE.BufferGeometry): Map<string, number[]> {
  const triCount = geo.index
    ? geo.index.count / 3
    : geo.attributes.position.count / 3;

  const map = new Map<string, number[]>();

  for (let t = 0; t < triCount; t++) {
    const [a, b, c] = getTriIndices(geo, t);
    const edges = [
      [a, b],
      [b, c],
      [c, a],
    ];
    for (const [p, q] of edges) {
      const key = p < q ? `${p}-${q}` : `${q}-${p}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
  }

  return map;
}

// ─── Flood fill ───────────────────────────────────────────────────────────────

export function floodFillFace(
  geo: THREE.BufferGeometry,
  seedTriIndex: number,
  dotThreshold = 0.98,
): number[] {
  const seedNormal = getTriNormal(geo, seedTriIndex);
  const edgeMap = buildEdgeMap(geo);
  const triCount = geo.index
    ? geo.index.count / 3
    : geo.attributes.position.count / 3;

  const visited = new Set<number>();
  const queue = [seedTriIndex];
  visited.add(seedTriIndex);

  while (queue.length) {
    const current = queue.shift()!;
    const [a, b, c] = getTriIndices(geo, current);

    // check all three edges of this triangle
    const edges = [
      [a, b],
      [b, c],
      [c, a],
    ];

    for (const [p, q] of edges) {
      const key = p < q ? `${p}-${q}` : `${q}-${p}`;
      const neighbors = edgeMap.get(key) ?? [];

      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        if (neighbor >= triCount) continue;

        const neighborNormal = getTriNormal(geo, neighbor);
        const dot = seedNormal.dot(neighborNormal);

        if (dot >= dotThreshold) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }

  return Array.from(visited);
}

// ─── Build sub-geometry from triangle indices ─────────────────────────────────

export function buildSubGeo(
  geo: THREE.BufferGeometry,
  triIndices: number[],
): THREE.BufferGeometry {
  const subGeo = new THREE.BufferGeometry();

  // copy all attributes by reference (position, normal, uv, etc.)
  for (const key of Object.keys(geo.attributes)) {
    subGeo.setAttribute(key, geo.attributes[key]);
  }

  // build new index buffer containing only our triangles
  const indices = new Uint32Array(triIndices.length * 3);
  triIndices.forEach((triIdx, i) => {
    const [a, b, c] = getTriIndices(geo, triIdx);
    indices[i * 3] = a;
    indices[i * 3 + 1] = b;
    indices[i * 3 + 2] = c;
  });

  subGeo.setIndex(new THREE.BufferAttribute(indices, 1));
  return subGeo;
}

// ─── UV bounds for a set of triangles ────────────────────────────────────────
// Returns the min/max UV coords for a set of triangles
// Useful for cropping the texture to just this face's UV island

export interface UVBounds {
  minU: number;
  minV: number;
  maxU: number;
  maxV: number;
}

export function getUVBounds(
  geo: THREE.BufferGeometry,
  triIndices: number[],
): UVBounds | null {
  const uvAttr = geo.attributes.uv;
  if (!uvAttr) return null;

  let minU = Infinity,
    minV = Infinity;
  let maxU = -Infinity,
    maxV = -Infinity;

  for (const triIdx of triIndices) {
    const [a, b, c] = getTriIndices(geo, triIdx);
    for (const vi of [a, b, c]) {
      const u = uvAttr.getX(vi);
      const v = uvAttr.getY(vi);
      minU = Math.min(minU, u);
      minV = Math.min(minV, v);
      maxU = Math.max(maxU, u);
      maxV = Math.max(maxV, v);
    }
  }

  return { minU, minV, maxU, maxV };
}
