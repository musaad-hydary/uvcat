# UVCAT

A PS1-style texture mapper for 3D models. Load a GLB, pick faces, apply retro textures, export.

## What it does

UVCAT has two modes:

**Texture Mode** processes images through a PS1 pipeline. Control resolution, color depth, dithering, UV warping, and color palettes to produce authentic retro textures.

**Model Mode** loads GLB files and lets you paint processed textures onto individual faces of the mesh. Faces are selected using flood-fill picking, which automatically finds coplanar triangles that form a logical face.

## How UV mapping works

When you pick a face, the app computes the UV bounding box of that face's triangles. When you upload a texture, it gets drawn into that UV region on a composite canvas that covers the whole mesh. This means textures always land in the right place without needing to modify the geometry.

## Exporting

- **GLB** packs all composite canvases into an atlas, remaps UVs to atlas space, and exports a self-contained GLB with baked textures
- **PNG** exports the raw texture atlas sheet
- **GIF** renders 24 frames of the model spinning and encodes them as an animated GIF with transparent background

## Stack

- React + TypeScript + Vite
- Three.js for 3D rendering, raycasting, and GLB loading
- Custom flood-fill algorithm for face selection
- gif.js for animated GIF encoding
- Pure CSS Persona 5 inspired UI with clip-path panels and scanline overlay

## Running locally

```bash
npm install
cp node_modules/gif.js/dist/gif.worker.js public/gif.worker.js
npm run dev
```

## Building

```bash
npm run build
```

Deploy the `dist/` folder to any static host. No backend required.

## Keyboard shortcuts

- `Ctrl+Z` / `Cmd+Z` - undo last face pick or texture change
- `?` button in topbar - open help modal
- Sun/moon button - toggle light and dark mode
