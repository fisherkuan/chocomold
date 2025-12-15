import { useState, useRef } from 'react'
import ChocolateScene from './components/ChocolateScene'
import Interface from './components/Interface'
import { parseSVG } from './utils/fileHandlers'

import { STLExporter } from 'three-stdlib'

function App() {
  const [patternShapes, setPatternShapes] = useState(null)
  const [depth, setDepth] = useState(0.5)
  const modelRef = useRef()

  const handleSVGUpload = async (file) => {
    try {
      const parsedShapes = await parseSVG(file);
      setPatternShapes(parsedShapes);
    } catch (error) {
      console.error("Error parsing SVG:", error);
      alert("Failed to parse SVG. Please make sure it's a valid file.");
    }
  }

  const handleLoadDemo = async () => {
    console.log("App: handleLoadDemo called - Testing SVG Parsing");

    // Simple RECTANGLE SVG
    const demoSVG = `<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="25" y="25" width="50" height="50" fill="black" />
    </svg>`;

    const blob = new Blob([demoSVG], { type: 'image/svg+xml' });
    await handleSVGUpload(blob);
  };

  const handleExport = () => {
    if (modelRef.current) {
      const exporter = new STLExporter();
      const stlString = exporter.parse(modelRef.current);

      const blob = new Blob([stlString], { type: 'text/plain' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'chocolate_model.stl';
      link.click();
    }
  }

  return (
    <>
      <ChocolateScene
        patternShapes={patternShapes}
        depth={depth}
        modelRef={modelRef}
      />
      <Interface
        onUpload={handleSVGUpload}
        onLoadDemo={handleLoadDemo}
        depth={depth}
        setDepth={setDepth}
        onExport={handleExport}
      />
    </>
  )
}

export default App
