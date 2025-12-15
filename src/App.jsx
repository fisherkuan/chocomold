import { useEffect, useRef, useState } from 'react'
import ChocolateScene from './components/ChocolateScene'
import Interface from './components/Interface'
import CropperModal from './components/CropperModal'
import { getSVGViewBox, parseSVG } from './utils/fileHandlers'

import { STLExporter } from 'three-stdlib'

const DEFAULT_DEPTH = 0.3
const DEFAULT_SCALE = 1.0

function App() {
  const [patternShapes, setPatternShapes] = useState(null)
  const [depth, setDepth] = useState(DEFAULT_DEPTH)
  const [scale, setScale] = useState(DEFAULT_SCALE)
  const [invert, setInvert] = useState(false)
  const [cropSession, setCropSession] = useState(null)
  const [isCropping, setIsCropping] = useState(false)
  const modelRef = useRef()

  const cleanupCropSession = () => {
    if (cropSession?.previewUrl) {
      URL.revokeObjectURL(cropSession.previewUrl)
    }
    setCropSession(null)
  }

  const resetForNewUpload = () => {
    setPatternShapes(null)
    setIsCropping(false)
    setDepth(DEFAULT_DEPTH)
    setScale(DEFAULT_SCALE)
    cleanupCropSession()
  }

  const finalizePatternShapes = (parsedShapes) => {
    const totalShapes = (parsedShapes.engraveShapes?.length || 0) + (parsedShapes.maskShapes?.length || 0)
    if (totalShapes > 350) {
      if (!window.confirm(`This SVG is very complex (${totalShapes} shapes) and might crash the 3D generation. Do you want to try anyway?`)) {
        return
      }
    }

    setPatternShapes(parsedShapes)
  }

  const handleSVGUpload = async (file) => {
    if (!file) return
    const isSVG = file.type === 'image/svg+xml' || file.name?.toLowerCase().endsWith('.svg')
    if (!isSVG) {
      alert("Please upload an SVG file.")
      return
    }
    try {
      resetForNewUpload()
      const text = await file.text()
      const viewBox = getSVGViewBox(text)
      const previewUrl = URL.createObjectURL(file)
      setCropSession({
        fileName: file.name || 'pattern.svg',
        svgText: text,
        viewBox,
        previewUrl
      })
    } catch (error) {
      console.error("Error preparing SVG:", error)
      alert("Failed to load SVG. Please make sure it's a valid file.")
    }
  }

  const handleCropConfirm = async ({ cropRect, imageSize }) => {
    if (!cropSession || !cropRect || !imageSize?.width || !imageSize?.height) return
    if (!cropSession.viewBox?.width || !cropSession.viewBox?.height) {
      alert("Could not determine the SVG size for cropping.")
      return
    }

    const scaleX = cropSession.viewBox.width / imageSize.width
    const scaleY = cropSession.viewBox.height / imageSize.height
    const minX = cropSession.viewBox.minX + cropRect.x * scaleX
    const minY = cropSession.viewBox.minY + cropRect.y * scaleY
    const maxX = minX + cropRect.size * scaleX
    const maxY = minY + cropRect.size * scaleY
    const viewMaxX = cropSession.viewBox.minX + cropSession.viewBox.width
    const viewMaxY = cropSession.viewBox.minY + cropSession.viewBox.height
    const epsilonX = Math.max(cropSession.viewBox.width, 1) * 0.001
    const epsilonY = Math.max(cropSession.viewBox.height, 1) * 0.001
    const coversFullWidth = Math.abs(minX - cropSession.viewBox.minX) <= epsilonX &&
      Math.abs(maxX - viewMaxX) <= epsilonX
    const coversFullHeight = Math.abs(minY - cropSession.viewBox.minY) <= epsilonY &&
      Math.abs(maxY - viewMaxY) <= epsilonY
    const shouldSkipCrop = coversFullWidth && coversFullHeight

    setIsCropping(true)
    try {
      const cropBounds = shouldSkipCrop ? undefined : { minX, minY, maxX, maxY }
      const parsedShapes = await parseSVG(cropSession.svgText, cropBounds)
      finalizePatternShapes(parsedShapes)
      cleanupCropSession()
    } catch (error) {
      console.error("Error parsing cropped SVG:", error)
      alert("Failed to parse the cropped SVG. Please try a different file.")
    } finally {
      setIsCropping(false)
    }
  }

  const handleCropCancel = () => {
    cleanupCropSession()
  }

  useEffect(() => {
    return () => {
      if (cropSession?.previewUrl) {
        URL.revokeObjectURL(cropSession.previewUrl)
      }
    }
  }, [cropSession])

  const handleExport = () => {
    if (modelRef.current) {
      // Temporarily rotate for export to ensure pattern side is UP
      modelRef.current.rotation.x += Math.PI;
      modelRef.current.updateMatrixWorld();

      const exporter = new STLExporter();
      const stlString = exporter.parse(modelRef.current);

      // Rotate back
      modelRef.current.rotation.x -= Math.PI;
      modelRef.current.updateMatrixWorld();

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
        scale={scale}
        invert={invert}
        modelRef={modelRef}
      />
      <Interface
        onUpload={handleSVGUpload}
        depth={depth}
        setDepth={setDepth}
        scale={scale}
        setScale={setScale}
        invert={invert}
        setInvert={setInvert}
        onExport={handleExport}
      />
      {cropSession && (
        <CropperModal
          imageUrl={cropSession.previewUrl}
          fileName={cropSession.fileName}
          onCancel={handleCropCancel}
          onConfirm={handleCropConfirm}
          isProcessing={isCropping}
        />
      )}
    </>
  )
}

export default App
