import { SVGLoader } from 'three-stdlib';
import { Shape, Vector2, Path } from 'three';
import polygonClipping from 'polygon-clipping';

const WHITE_VALUES = new Set(['#fff', '#ffffff', 'white']);
const TRANSPARENT_VALUES = new Set(['none', 'transparent']);
const HEX_COLOR_REGEX = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;

const parseRGB = (color) => {
    const match = color.match(/rgba?\(([^)]+)\)/i);
    if (!match) return null;
    const parts = match[1]
        .split(',')
        .map((value) => parseFloat(value.trim()))
        .filter((value) => Number.isFinite(value));

    if (parts.length < 3) return null;
    const [r, g, b, a = 1] = parts;
    return { r, g, b, a };
};

const parseHexColor = (color) => {
    const match = color.match(HEX_COLOR_REGEX);
    if (!match) return null;
    const value = match[1];
    const hasAlpha = value.length === 8;
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    const a = hasAlpha ? parseInt(value.slice(6, 8), 16) / 255 : 1;
    if ([r, g, b, a].some((channel) => Number.isNaN(channel))) return null;
    return { r, g, b, a };
};

const isInvisibleFill = (color) => {
    if (!color) return false;
    const normalized = color.trim().toLowerCase();
    if (TRANSPARENT_VALUES.has(normalized)) return true;

    const hex = parseHexColor(normalized);
    if (hex) {
        return hex.a <= 0.05;
    }

    if (normalized.startsWith('rgb')) {
        const rgb = parseRGB(normalized);
        if (!rgb) return false;
        return rgb.a <= 0.05;
    }

    return false;
};

const isMaskColor = (color) => {
    if (!color) return false;
    const normalized = color.trim().toLowerCase();

    if (isInvisibleFill(normalized)) return false;
    if (WHITE_VALUES.has(normalized)) return true;

    const hex = parseHexColor(normalized);
    if (hex) {
        if (hex.a <= 0.05) return false;
        return hex.r >= 250 && hex.g >= 250 && hex.b >= 250;
    }

    if (normalized.startsWith('rgb')) {
        const rgb = parseRGB(normalized);
        if (!rgb) return false;
        const { r, g, b, a } = rgb;
        const isWhite = r >= 250 && g >= 250 && b >= 250;
        const isTransparent = a <= 0.05;
        return isWhite || isTransparent;
    }

    return false;
};

const isEngraveColor = (color) => {
    if (!color) return false;
    return !isMaskColor(color);
};

const parseStrokeWidth = (value) => {
    if (!value) return 1;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const buildStrokeShapes = (path) => {
    const style = path.userData?.style ?? {};
    const strokeColor = style.stroke?.trim();
    if (!strokeColor || strokeColor === 'none') {
        return [];
    }

    const strokeWidth = Math.max(parseStrokeWidth(style.strokeWidth), 0.4);
    const halfWidth = strokeWidth / 2;
    const strokeShapes = [];

    path.subPaths.forEach((subPath) => {
        // Optimization: Reduce point density for complex curves
        const rawPoints = subPath.getPoints();
        if (rawPoints.length < 2) return;

        // Simplify points: simple distance filter
        // Base units are arbitrary in SVG, but usually 0.5-1.0 is a reasonable minimal step 
        // if the overall view is typically 100-1000 units.
        // However, we don't know the SVG scale here yet (it gets scaled later).
        // Let's use a dynamic tolerance or a safe fixed one assuming standard web SVG coordinates.
        // If we are too aggressive, we lose detail. If too conservative, we crash.
        // Let's filter out points that are extremely close relative to the total length.

        const totalLen = subPath.getLength();
        // If the path is tiny, don't over-optimize.
        // If the path is huge, we need to be careful.

        // Strategy: Ensure we don't have thousands of segments.
        // Hard limit segments per subpath?
        // Or just distance check.

        const minDistanceString = 0.5; // Pixels/Units. 
        // For a 500x500 svg, 0.5 is 0.1%. Detailed enough.

        const points = [rawPoints[0]];
        let lastPoint = rawPoints[0];

        for (let i = 1; i < rawPoints.length; i++) {
            const p = rawPoints[i];
            const dist = p.distanceTo(lastPoint);

            // Dynamic resolution: if we have > 100 points, start being more aggressive
            // But simple distance is usually enough to kill "curve over-tessellation"
            if (dist >= minDistanceString || i === rawPoints.length - 1) {
                points.push(p);
                lastPoint = p;
            }
        }

        if (points.length < 2) return;

        for (let i = 0; i < points.length - 1; i += 1) {
            const start = points[i];
            const end = points[i + 1];

            const dir = new Vector2().subVectors(end, start);
            // Ensure we don't process zero-length segments that might slipped through
            if (dir.lengthSq() < 1e-6) continue;
            dir.normalize();

            const normal = new Vector2(-dir.y, dir.x).multiplyScalar(halfWidth);

            const p1 = start.clone().add(normal);
            const p2 = end.clone().add(normal);
            const p3 = end.clone().sub(normal);
            const p4 = start.clone().sub(normal);

            const shape = new Shape();
            shape.moveTo(p1.x, p1.y);
            shape.lineTo(p2.x, p2.y);
            shape.lineTo(p3.x, p3.y);
            shape.lineTo(p4.x, p4.y);
            shape.closePath();

            strokeShapes.push(shape);
        }
    });

    return strokeShapes;
};

const getShapeBounds = (shape) => {
    if (!shape) return null;
    const points = shape.getPoints();
    if (!points?.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    points.forEach((point) => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    });
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
        return null;
    }
    return { minX, minY, maxX, maxY };
};

const rectContainsBounds = (rect, bounds) => {
    if (!rect || !bounds) return false;
    const epsilon = Math.max(rect.maxX - rect.minX, rect.maxY - rect.minY, 1) * 1e-4;
    const withinX = bounds.minX >= rect.minX - epsilon && bounds.maxX <= rect.maxX + epsilon;
    const withinY = bounds.minY >= rect.minY - epsilon && bounds.maxY <= rect.maxY + epsilon;
    return withinX && withinY;
};

const simplifyPoints = (points) => {
    if (points.length < 3) return points;
    const simplified = [points[0]];
    let last = points[0];
    // Tolerance: 0.25 (squared = 0.0625) provides decent detail but kills redundancy
    const minSq = 0.25;

    for (let i = 1; i < points.length; i++) {
        if (points[i].distanceToSquared(last) > minSq) {
            simplified.push(points[i]);
            last = points[i];
        }
    }
    return simplified;
};

const simplifyShape = (shape) => {
    const points = shape.getPoints();
    const simplifiedPoints = simplifyPoints(points);
    const newShape = new Shape(simplifiedPoints);

    if (shape.holes && shape.holes.length) {
        newShape.holes = shape.holes.map(hole => {
            const holePoints = hole.getPoints();
            const simpleHolePoints = simplifyPoints(holePoints);
            const holePath = new Path();
            holePath.setFromPoints(simpleHolePoints);
            return holePath;
        });
    }
    return newShape;
};

const mergePathShapes = (path) => {
    const style = path.userData?.style ?? {};
    const engraveShapes = [];
    const maskShapes = [];

    let fillShapes = SVGLoader.createShapes(path);
    // OPTIMIZATION: Simplify filled shapes to prevent crashes with dense paths
    // 7KB files can have thousands of points if they are complex vector art.
    // We convert curves to simplified linear segments.
    // NOTE: This loses "perfect" curve resolution but saves the app.
    fillShapes = fillShapes.map(s => simplifyShape(s));

    if (fillShapes.length) {
        if (style.fill == null || style.fill === '') {
            engraveShapes.push(...fillShapes);
        } else if (isInvisibleFill(style.fill)) {
            // Fill is explicitly invisible, skip creating geometry
        } else if (isEngraveColor(style.fill)) {
            engraveShapes.push(...fillShapes);
        } else if (isMaskColor(style.fill)) {
            maskShapes.push(...fillShapes);
        }
    }

    const strokeShapes = buildStrokeShapes(path);
    if (strokeShapes.length) {
        // strokeShapes are already simplified during build
        if (isEngraveColor(style.stroke)) {
            engraveShapes.push(...strokeShapes);
        } else if (isMaskColor(style.stroke)) {
            maskShapes.push(...strokeShapes);
        }
    }

    if (engraveShapes.length === 0 && maskShapes.length === 0) {
        // Fallback to treating the filled area as engrave so empty uploads still show something.
        if (fillShapes.length) {
            engraveShapes.push(...fillShapes);
        }
    }

    return { engraveShapes, maskShapes };
};

const inlineStyles = (svgText) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");

    const styleElements = doc.getElementsByTagName('style');
    if (!styleElements.length) return svgText;

    const styles = {};

    // 1. Parse simple CSS rules from <style> tags
    // Regex to match .classname { property: value; ... }
    Array.from(styleElements).forEach(styleEl => {
        const css = styleEl.textContent;
        // Match .class { ... }
        const ruleRegex = /\.([a-zA-Z0-9_-]+)\s*\{([^}]+)\}/g;
        let match;
        while ((match = ruleRegex.exec(css)) !== null) {
            const className = match[1];
            const ruleBody = match[2];
            styles[className] = styles[className] || {};

            // Parse rules: prop: value;
            ruleBody.split(';').forEach(rule => {
                const [prop, val] = rule.split(':').map(s => s.trim());
                if (prop && val) {
                    styles[className][prop] = val;
                }
            });
        }
    });

    // 2. Apply attributes to matching elements
    Object.keys(styles).forEach(className => {
        // Use querySelectorAll with the class selector directly
        // Escaping might be needed for weird class names, but standard CSS class names are safe-ish.
        try {
            const elements = doc.querySelectorAll(`.${className}`);
            const rules = styles[className];

            Array.from(elements).forEach(el => {
                Object.entries(rules).forEach(([prop, val]) => {
                    // Only set if not already present (inline style/attr wins)
                    if (!el.hasAttribute(prop) && !el.style[prop]) {
                        el.setAttribute(prop, val);
                    }
                });
            });
        } catch (err) {
            console.warn(`Failed to apply styles for class .${className}`, err);
        }
    });

    return new XMLSerializer().serializeToString(doc);
};

const loadSVGText = (input) => {
    if (typeof input === 'string') {
        return Promise.resolve(input);
    }

    if (input?.text) {
        return input.text();
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (err) => reject(err);
        reader.readAsText(input);
    });
};

const normalizeCropRect = (rect) => {
    if (!rect) return null;
    const rawMinX = Number(rect.minX ?? rect.x ?? 0);
    const rawMinY = Number(rect.minY ?? rect.y ?? 0);
    const rawMaxX = rect.maxX != null
        ? Number(rect.maxX)
        : rawMinX + Number(rect.width ?? rect.size ?? 0);
    const rawMaxY = rect.maxY != null
        ? Number(rect.maxY)
        : rawMinY + Number(rect.height ?? rect.size ?? 0);

    if (
        !Number.isFinite(rawMinX) ||
        !Number.isFinite(rawMinY) ||
        !Number.isFinite(rawMaxX) ||
        !Number.isFinite(rawMaxY)
    ) {
        return null;
    }

    return {
        minX: Math.min(rawMinX, rawMaxX),
        maxX: Math.max(rawMinX, rawMaxX),
        minY: Math.min(rawMinY, rawMaxY),
        maxY: Math.max(rawMinY, rawMaxY),
    };
};

const arePointsEqual = (a, b, epsilon = 1e-5) => {
    return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
};

const vectorsToRing = (points) => {
    if (!points?.length) return null;
    const ring = [];
    points.forEach((point) => {
        const coords = [point.x, point.y];
        const last = ring[ring.length - 1];
        if (!last || !arePointsEqual(last, coords)) {
            ring.push(coords);
        }
    });

    if (ring.length < 3) return null;

    const first = ring[0];
    const last = ring[ring.length - 1];
    if (!arePointsEqual(first, last)) {
        ring.push([...first]);
    }

    return ring;
};

const shapeToPolygons = (shape) => {
    if (!shape) return null;
    const extracted = shape.extractPoints();
    const outerRing = vectorsToRing(extracted.shape);
    if (!outerRing) return null;

    const holes = extracted.holes
        .map((holePoints) => vectorsToRing(holePoints))
        .filter(Boolean);

    return [[outerRing, ...holes]];
};

const ringToPath = (ring) => {
    if (!ring?.length) return null;
    const limit = arePointsEqual(ring[0], ring[ring.length - 1]) ? ring.length - 1 : ring.length;
    const cleaned = [];
    for (let i = 0; i < limit; i += 1) {
        const point = ring[i];
        const prev = ring[i - 1];
        if (!prev || !arePointsEqual(prev, point)) {
            cleaned.push(point);
        }
    }

    if (cleaned.length < 3) return null;
    return cleaned.map(([x, y]) => new Vector2(x, y));
};

const polygonToShape = (polygon) => {
    if (!polygon?.length) return null;
    const outer = ringToPath(polygon[0]);
    if (!outer) return null;

    const shape = new Shape();
    shape.setFromPoints(outer);

    polygon.slice(1).forEach((ring) => {
        const holePoints = ringToPath(ring);
        if (holePoints) {
            const holePath = new Path();
            holePath.setFromPoints(holePoints);
            shape.holes.push(holePath);
        }
    });

    return simplifyShape(shape);
};

const clipShapesWithRect = (shapes, rect) => {
    const normalizedRect = normalizeCropRect(rect);
    if (!normalizedRect) return shapes;
    const rectPolygon = [[[
        [normalizedRect.minX, normalizedRect.minY],
        [normalizedRect.maxX, normalizedRect.minY],
        [normalizedRect.maxX, normalizedRect.maxY],
        [normalizedRect.minX, normalizedRect.maxY],
        [normalizedRect.minX, normalizedRect.minY],
    ]]];

    const clipped = [];
    shapes.forEach((shape) => {
        const bounds = getShapeBounds(shape);
        if (rectContainsBounds(normalizedRect, bounds)) {
            clipped.push(shape);
            return;
        }
        const polygon = shapeToPolygons(shape);
        if (!polygon) return;
        try {
            const result = polygonClipping.intersection(polygon, rectPolygon);
            if (!result || !result.length) {
                return;
            }
            result.forEach((poly) => {
                const newShape = polygonToShape(poly);
                if (newShape) clipped.push(newShape);
            });
        } catch (err) {
            console.warn('Failed to clip shape', err);
            clipped.push(shape);
        }
    });
    return clipped;
};

export const getSVGViewBox = (svgText) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) {
        throw new Error('Invalid SVG: missing <svg> root');
    }

    const viewBoxAttr = svg.getAttribute('viewBox');
    if (viewBoxAttr) {
        const parts = viewBoxAttr
            .split(/[\s,]+/)
            .map((value) => parseFloat(value))
            .filter((value) => Number.isFinite(value));
        if (parts.length >= 4) {
            const [minX, minY, width, height] = parts;
            return {
                minX,
                minY,
                width: Math.max(width, 1),
                height: Math.max(height, 1),
            };
        }
    }

    const widthAttr = parseFloat(svg.getAttribute('width'));
    const heightAttr = parseFloat(svg.getAttribute('height'));
    const width = Number.isFinite(widthAttr) ? Math.max(widthAttr, 1) : 100;
    const height = Number.isFinite(heightAttr) ? Math.max(heightAttr, 1) : width;

    return { minX: 0, minY: 0, width, height };
};

export const parseSVG = async (input, cropRect) => {
    let text = await loadSVGText(input);

    try {
        text = inlineStyles(text);
    } catch (err) {
        console.warn("Style inlining failed, proceeding with raw SVG", err);
    }

    const loader = new SVGLoader();

    try {
        const svgData = loader.parse(text);
        let engraveShapes = [];
        let maskShapes = [];

        svgData.paths.forEach((path) => {
            const { engraveShapes: engrave, maskShapes: mask } = mergePathShapes(path);
            engraveShapes.push(...engrave);
            maskShapes.push(...mask);
        });

        if (cropRect) {
            engraveShapes = clipShapesWithRect(engraveShapes, cropRect);
            maskShapes = clipShapesWithRect(maskShapes, cropRect);
        }

        return { engraveShapes, maskShapes };
    } catch (error) {
        throw error;
    }
};
