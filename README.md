# ChocoMold

Interactive React app for turning flat vector artwork into a printable chocolate mold. Upload an SVG, crop the exact region you want, tweak the engrave depth/scale, preview the result in 3D, and export an STL that is ready for printing.

## Features
- Drag-and-drop SVG intake with optional square cropper that understands the SVG viewBox, so the 3D geometry matches what you see.
- Automatic separation of engrave shapes (anything non-white) and mask shapes (white/transparent fills or strokes) to keep raised and recessed areas correct.
- Real-time chocolate preview powered by React Three Fiber, `three-bvh-csg`, and PBR-style lighting so you can inspect every angle before exporting.
- Fine-grained controls for engraving depth (0.05–0.9), pattern scaling (10–150%), and pattern inversion to flip raised versus recessed geometry.
- One-click STL export that orients the chocolate face upward, making the mesh directly usable in slicers or CAM software.
- Bundled SVG fixtures in `fixtures/` for quick demos or regression testing.

## Tech Stack
- [React 19](https://react.dev/) + [Vite](https://vitejs.dev/) for the SPA experience.
- [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber/getting-started/introduction) + [three-bvh-csg](https://github.com/gkjohnson/three-bvh-csg) for fast constructive solid geometry operations.
- [three-stdlib](https://github.com/pmndrs/three-stdlib) `SVGLoader` for parsing vector files and `STLExporter` for downloads.
- [polygon-clipping](https://github.com/mfogel/polygon-clipping) for precise crop window clipping.

## Getting Started
### Prerequisites
- Node.js ≥ 18 (developed on Node 20).
- npm (ships with Node) or a compatible package manager.

### Installation
```bash
npm install
```

### Core scripts
- `npm run dev` – launch Vite’s dev server with hot reloading.
- `npm run build` – create a production build in `dist/`.
- `npm run preview` – serve the production build locally.
- `npm run lint` – run ESLint across the repo.

## Usage
1. Start the dev server and open the browser window Vite prints (usually `http://localhost:5173`).
2. Drag an SVG into the upload area (or click “Upload Pattern”).
3. Crop the artwork if needed. The cropper enforces a square selection so the mold remains 10×10cm.
4. Adjust controls:
   - **Pattern Scale**: uniformly scale the artwork relative to the 10×10 base.
   - **Engraving Depth**: how far details carve into (or raise from) the chocolate.
   - **Invert Pattern**: flip raised vs recessed regions. Helpful if your SVG colors are inverted.
5. Examine the 3D preview (orbit with the mouse) and, when satisfied, click **Export STL**.

### Preparing SVGs
- Use solid fills/strokes where possible; extremely complex gradients will be ignored.
- White or fully transparent fills/strokes act as *mask shapes* (areas that stay uncut). Everything else is treated as engrave lines.
- Dense artwork is automatically simplified, but very large files (thousands of shapes) can still be heavy. You will be prompted when the upload exceeds ~350 shapes; the geometry builder bails out above ~2000 engrave paths to keep the app responsive.
- Need quick samples? Try the files under `fixtures/`.

### Exported Geometry
- Base footprint: 10 × 10 cm, tapered to 10.5 × 10.5 cm at the bottom; height 1.2 cm (see `BASE_SIZE` and `BASE_HEIGHT` in `src/components/ChocolateModel.jsx` if you need to tweak).
- A tiny overcut (0.05) is added to engravings for cleaner prints.
- The mesh is exported with the pattern side facing +Z so most slicers treat it as “top”.

## Project Structure
```
src/
  components/
    ChocolateScene.jsx    # React Three Fiber scene + lighting
    ChocolateModel.jsx    # Converts parsed shapes into CSG geometry
    Interface.jsx         # UI controls & STL export button
    CropperModal.jsx      # Resize/zoom/pan cropper workflow
  utils/
    fileHandlers.js       # SVG parsing, color classification, clipping
fixtures/                 # Sample SVGs for local testing
public/                   # Static assets served by Vite
```

## Implementation Notes
- SVG parsing uses `SVGLoader` plus a custom pipeline that inlines `<style>` rules, simplifies curves, and separates mask/engrave shapes based on fill/stroke color. White/transparent strokes become masks; everything else engraves.
- The crop modal calculates against the SVG’s viewBox so the exported geometry matches the cropped selection even if the artwork lacks width/height attributes.
- `three-bvh-csg` performs boolean subtraction of extruded shapes from the beveled chocolate base. The tool skips mask shapes that would cover >85% of the design to avoid pathological meshes.
- The STL exporter temporarily rotates the mesh 180° on X to guarantee the chocolate face is oriented upwards, then rotates it back in-scene.

## Troubleshooting
- **“Failed to parse SVG”**: ensure the file is valid XML. Running it through an optimizer like [SVGOMG](https://jakearchibald.github.io/svgomg/) often fixes stray styles.
- **Nothing appears after upload**: the parser may have detected only white/transparent content. Add a darker fill or stroke so the app treats it as an engrave shape, or toggle “Invert Pattern”.
- **Cropping freezes**: extremely large bitmaps embedded in the SVG can overwhelm the browser. Remove `<image>` tags or convert them to paths before uploading.
- **Exported STL is empty/flat**: check that the Engraving Depth slider is >0.05 and that the SVG contains visible non-white paths.

Happy molding! 🎂
