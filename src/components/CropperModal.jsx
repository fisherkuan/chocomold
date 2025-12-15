import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Check, Minus, Plus } from 'lucide-react';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const MIN_CROP_SCALE = 0.3;
const MAX_CROP_SCALE = 1;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

const CropperModal = ({ imageUrl, fileName, onCancel, onConfirm, isProcessing = false }) => {
    const wrapperRef = useRef(null);
    const [wrapperSize, setWrapperSize] = useState(null);
    const [imageSize, setImageSize] = useState(null);
    const [naturalSize, setNaturalSize] = useState(null);
    const previousSizeRef = useRef(null);
    const [cropRect, setCropRect] = useState(null);
    const [cropScale, setCropScale] = useState(0.8);
    const [dragState, setDragState] = useState(null);
    const [resizeState, setResizeState] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [panState, setPanState] = useState(null);
    const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });

    const minDimension = imageSize ? Math.min(imageSize.width, imageSize.height) : 0;

    const clampPan = useCallback(
        (nextPan, customZoom = zoom) => {
            if (!imageSize) return { x: 0, y: 0 };
            const scaledWidth = imageSize.width * customZoom;
            const scaledHeight = imageSize.height * customZoom;
            const minX = Math.min(0, imageSize.width - scaledWidth);
            const minY = Math.min(0, imageSize.height - scaledHeight);
            return {
                x: clamp(nextPan.x, minX, 0),
                y: clamp(nextPan.y, minY, 0),
            };
        },
        [imageSize, zoom]
    );

    useEffect(() => {
        if (!wrapperRef.current || typeof ResizeObserver === 'undefined') return;
        const node = wrapperRef.current;
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            const { width, height } = entry.contentRect;
            if (width && height) {
                setWrapperSize({ width, height });
            }
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!wrapperSize || !naturalSize) return;
        const scale = Math.min(wrapperSize.width / naturalSize.width, wrapperSize.height / naturalSize.height);
        const width = naturalSize.width * scale;
        const height = naturalSize.height * scale;
        setImageSize({ width, height });
        setImageOffset({
            x: (wrapperSize.width - width) / 2,
            y: (wrapperSize.height - height) / 2,
        });
    }, [wrapperSize, naturalSize]);

    useEffect(() => {
        setCropRect(null);
        setPan({ x: 0, y: 0 });
        setZoom(1);
        setNaturalSize(null);
        setImageSize(null);
        setImageOffset({ x: 0, y: 0 });
        previousSizeRef.current = null;
    }, [imageUrl]);

    const handleImageLoad = useCallback((event) => {
        const { naturalWidth, naturalHeight } = event.currentTarget;
        if (naturalWidth && naturalHeight) {
            setNaturalSize({ width: naturalWidth, height: naturalHeight });
        }
    }, []);

    useEffect(() => {
        if (!imageSize) return;

        if (!cropRect) {
            const size = minDimension * cropScale;
            setCropRect({
                x: (imageSize.width - size) / 2,
                y: (imageSize.height - size) / 2,
                size,
            });
            setPan({ x: 0, y: 0 });
            setZoom(1);
            previousSizeRef.current = imageSize;
            return;
        }

        if (!previousSizeRef.current) {
            previousSizeRef.current = imageSize;
            return;
        }

        if (
            previousSizeRef.current.width !== imageSize.width ||
            previousSizeRef.current.height !== imageSize.height
        ) {
            const scaleX = imageSize.width / previousSizeRef.current.width;
            const scaleY = imageSize.height / previousSizeRef.current.height;
            const uniformScale = (scaleX + scaleY) / 2;
            setCropRect((prev) => ({
                x: prev.x * uniformScale,
                y: prev.y * uniformScale,
                size: prev.size * uniformScale,
            }));
            setPan((prev) => clampPan({ x: prev.x * uniformScale, y: prev.y * uniformScale }, zoom));
            previousSizeRef.current = imageSize;
        }
    }, [imageSize, cropRect, cropScale, minDimension, clampPan, zoom]);

    const handleScaleChange = (value) => {
        const parsed = parseFloat(value);
        if (!imageSize || !minDimension) return;
        setCropScale(parsed);
        setCropRect((prev) => {
            const size = minDimension * parsed;
            const centerX = prev ? prev.x + prev.size / 2 : imageSize.width / 2;
            const centerY = prev ? prev.y + prev.size / 2 : imageSize.height / 2;
            const maxX = Math.max(imageSize.width - size, 0);
            const maxY = Math.max(imageSize.height - size, 0);
            const nextX = clamp(centerX - size / 2, 0, maxX);
            const nextY = clamp(centerY - size / 2, 0, maxY);
            const normalizedScale = clamp(size / minDimension, MIN_CROP_SCALE, MAX_CROP_SCALE);
            setCropScale(normalizedScale);
            return { x: nextX, y: nextY, size };
        });
    };

    const beginDrag = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!cropRect) return;
        setDragState({
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            rect: { ...cropRect },
        });
    };

    const beginResize = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!cropRect) return;
        setResizeState({
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            rect: { ...cropRect },
        });
    };

    const beginPanGesture = (event) => {
        if (zoom <= 1 || !imageSize) return;
        if (typeof event.button === 'number' && event.button !== 0) return;
        if (event.target.closest('.cropper-overlay')) return;
        event.preventDefault();
        setPanState({
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            panAtStart: { ...pan },
        });
    };

    const handleZoomChange = (value) => {
        const parsed = clamp(parseFloat(value), MIN_ZOOM, MAX_ZOOM);
        if (!imageSize) return;
        if (!cropRect) {
            setZoom(parsed);
            setPan({ x: 0, y: 0 });
            return;
        }
        const centerScreenX = cropRect.x + cropRect.size / 2;
        const centerScreenY = cropRect.y + cropRect.size / 2;
        const centerImageX = (centerScreenX - pan.x) / zoom;
        const centerImageY = (centerScreenY - pan.y) / zoom;
        const desiredPan = {
            x: centerScreenX - parsed * centerImageX,
            y: centerScreenY - parsed * centerImageY,
        };
        setZoom(parsed);
        setPan(clampPan(desiredPan, parsed));
    };

    const handleZoomStep = (delta) => {
        handleZoomChange((zoom + delta).toFixed(2));
    };

    const toImageCoordinates = useCallback(
        (rect) => {
            if (!rect || !imageSize) return null;
            const size = clamp(rect.size / zoom, 0, minDimension);
            const x = clamp((rect.x - pan.x) / zoom, 0, imageSize.width - size);
            const y = clamp((rect.y - pan.y) / zoom, 0, imageSize.height - size);
            return { x, y, size };
        },
        [imageSize, minDimension, pan, zoom]
    );

    useEffect(() => {
        if (!dragState || !imageSize) return;

        const handleMove = (event) => {
            event.preventDefault();
            setCropRect(() => {
                const dx = event.clientX - dragState.startX;
                const dy = event.clientY - dragState.startY;
                const size = dragState.rect.size;
                const maxX = Math.max(imageSize.width - size, 0);
                const maxY = Math.max(imageSize.height - size, 0);
                const nextX = clamp(dragState.rect.x + dx, 0, maxX);
                const nextY = clamp(dragState.rect.y + dy, 0, maxY);
                return { x: nextX, y: nextY, size };
            });
        };

        const handleUp = () => {
            setDragState(null);
        };

        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);

        return () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
        };
    }, [dragState, imageSize]);

    useEffect(() => {
        if (!resizeState || !imageSize) return;

        const handleMove = (event) => {
            event.preventDefault();
            setCropRect(() => {
                const dx = event.clientX - resizeState.startX;
                const dy = event.clientY - resizeState.startY;
                const delta = Math.max(dx, dy);
                const proposedSize = resizeState.rect.size + delta;
                const maxWidth = imageSize.width - resizeState.rect.x;
                const maxHeight = imageSize.height - resizeState.rect.y;
                const maxAllowed = Math.min(maxWidth, maxHeight, minDimension);
                const minAllowed = minDimension * MIN_CROP_SCALE;
                const nextSize = clamp(proposedSize, minAllowed, Math.max(minAllowed, maxAllowed));
                const normalizedScale = clamp(nextSize / minDimension, MIN_CROP_SCALE, MAX_CROP_SCALE);
                setCropScale(normalizedScale);
                return { ...resizeState.rect, size: nextSize };
            });
        };

        const handleUp = () => {
            setResizeState(null);
        };

        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);

        return () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
        };
    }, [resizeState, imageSize, minDimension]);

    useEffect(() => {
        if (!panState) return;

        const handleMove = (event) => {
            event.preventDefault();
            const dx = event.clientX - panState.startX;
            const dy = event.clientY - panState.startY;
            setPan(() => clampPan({ x: panState.panAtStart.x + dx, y: panState.panAtStart.y + dy }));
        };

        const handleUp = () => {
            setPanState(null);
        };

        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);

        return () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
        };
    }, [panState, clampPan]);

    const overlayStyle = useMemo(() => {
        if (!cropRect) return {};
        return {
            left: `${imageOffset.x + cropRect.x}px`,
            top: `${imageOffset.y + cropRect.y}px`,
            width: `${cropRect.size}px`,
            height: `${cropRect.size}px`,
        };
    }, [cropRect, imageOffset]);

    const stageWidth = imageSize?.width ?? wrapperSize?.width ?? 0;
    const stageHeight = imageSize?.height ?? wrapperSize?.height ?? 0;
    const stageOffset = imageSize ? imageOffset : { x: 0, y: 0 };
    const shouldRenderStage = stageWidth > 0 && stageHeight > 0;

    const handleConfirm = () => {
        if (!cropRect || !imageSize) return;
        const normalizedRect = toImageCoordinates(cropRect);
        if (!normalizedRect) return;
        onConfirm({ cropRect: normalizedRect, imageSize });
    };

    return (
        <div className="cropper-backdrop">
            <div className="cropper-panel">
                <div className="cropper-header">
                    <div>
                        <h2>Crop SVG</h2>
                        {fileName && <p className="cropper-filename">{fileName}</p>}
                    </div>
                    <button className="icon-button" aria-label="Close cropper" onClick={onCancel}>
                        <X size={18} />
                    </button>
                </div>

                <div className="cropper-body">
                    <div className="cropper-image-column">
                        <div className="cropper-image-wrapper" ref={wrapperRef}>
                            {shouldRenderStage && (
                                <div
                                    className="cropper-image-stage"
                                    style={{
                                        width: `${stageWidth}px`,
                                        height: `${stageHeight}px`,
                                        left: `${stageOffset.x}px`,
                                        top: `${stageOffset.y}px`,
                                    }}
                                    onPointerDown={beginPanGesture}
                                >
                                    <div
                                        className={`cropper-image-canvas${zoom > 1 ? ' is-zoomed' : ''}${
                                            panState ? ' is-panning' : ''
                                        }`}
                                        style={{
                                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                        }}
                                    >
                                        <img src={imageUrl} alt="SVG preview" draggable={false} onLoad={handleImageLoad} />
                                    </div>
                                </div>
                            )}
                            {cropRect && (
                                <div
                                    className="cropper-overlay"
                                    style={overlayStyle}
                                    onPointerDown={beginDrag}
                                    role="presentation"
                                >
                                    <div className="cropper-handle" onPointerDown={beginResize} role="presentation" />
                                </div>
                            )}
                        </div>
                        <div className="cropper-zoom-controls">
                            <div className="cropper-zoom-label">
                                <span>Zoom</span>
                                <span>{Math.round(zoom * 100)}%</span>
                            </div>
                            <div className="cropper-zoom-slider">
                                <button
                                    type="button"
                                    className="icon-button"
                                    aria-label="Zoom out"
                                    onClick={() => handleZoomStep(-0.1)}
                                    disabled={zoom <= MIN_ZOOM}
                                >
                                    <Minus size={14} />
                                </button>
                                <input
                                    id="crop-zoom"
                                    type="range"
                                    min={MIN_ZOOM}
                                    max={MAX_ZOOM}
                                    step="0.1"
                                    value={zoom}
                                    onChange={(e) => handleZoomChange(e.target.value)}
                                />
                                <button
                                    type="button"
                                    className="icon-button"
                                    aria-label="Zoom in"
                                    onClick={() => handleZoomStep(0.1)}
                                    disabled={zoom >= MAX_ZOOM}
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                            <p className="cropper-zoom-hint">Drag the image to pan when zoomed in.</p>
                        </div>
                    </div>
                    <div className="cropper-controls">
                        <label htmlFor="crop-size">Crop Size</label>
                        <input
                            id="crop-size"
                            type="range"
                            min={MIN_CROP_SCALE}
                            max={MAX_CROP_SCALE}
                            step="0.01"
                            value={cropScale}
                            onChange={(e) => handleScaleChange(e.target.value)}
                        />
                        <p className="cropper-hint">
                            Drag inside the square to reposition or use the corner handle to resize. The crop is always
                            1:1.
                        </p>
                    </div>
                </div>

                <div className="cropper-footer">
                    <button className="secondary-button" onClick={onCancel}>
                        Cancel
                    </button>
                    <button className="primary-button" onClick={handleConfirm} disabled={!cropRect || isProcessing}>
                        <Check size={16} /> {isProcessing ? 'Cropping...' : 'Crop & Load'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CropperModal;
