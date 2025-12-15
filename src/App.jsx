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

      // Stability check: Prevent crashing with too many shapes
      const totalShapes = (parsedShapes.engraveShapes?.length || 0) + (parsedShapes.maskShapes?.length || 0);
      if (totalShapes > 350) {
        if (!window.confirm(`This SVG is very complex (${totalShapes} shapes) and might crash the 3D generation. Do you want to try anyway?`)) {
          return;
        }
      }

      setPatternShapes(parsedShapes);
    } catch (error) {
      console.error("Error parsing SVG:", error);
      alert("Failed to parse SVG. Please make sure it's a valid file.");
    }
  }



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
        depth={depth}
        setDepth={setDepth}
        onExport={handleExport}
      />
    </>
  )
}

export default App
