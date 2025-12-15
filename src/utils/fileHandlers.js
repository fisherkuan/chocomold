import { SVGLoader } from 'three-stdlib';
import { Shape, Vector2 } from 'three';

const WHITE_VALUES = new Set(['#fff', '#ffffff', 'white', '#ffffff00', 'transparent', 'none']);

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

const isMaskColor = (color) => {
    if (!color) return false;
    const normalized = color.trim().toLowerCase();

    if (WHITE_VALUES.has(normalized)) return true;
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
        const points = subPath.getPoints();
        if (points.length < 2) return;

        for (let i = 0; i < points.length - 1; i += 1) {
            const start = points[i];
            const end = points[i + 1];

            const dir = new Vector2().subVectors(end, start);
            if (dir.lengthSq() < 1e-4) continue;
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

const mergePathShapes = (path) => {
    const style = path.userData?.style ?? {};
    const engraveShapes = [];
    const maskShapes = [];

    const fillShapes = SVGLoader.createShapes(path);
    if (fillShapes.length) {
        if (style.fill == null || style.fill === '') {
            engraveShapes.push(...fillShapes);
        } else if (isEngraveColor(style.fill)) {
            engraveShapes.push(...fillShapes);
        } else if (isMaskColor(style.fill)) {
            maskShapes.push(...fillShapes);
        }
    }

    const strokeShapes = buildStrokeShapes(path);
    if (strokeShapes.length) {
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

export const parseSVG = async (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const text = e.target.result;
            const loader = new SVGLoader();

            try {
                const svgData = loader.parse(text);
                const engraveShapes = [];
                const maskShapes = [];

                svgData.paths.forEach((path) => {
                    const { engraveShapes: engrave, maskShapes: mask } = mergePathShapes(path);
                    engraveShapes.push(...engrave);
                    maskShapes.push(...mask);
                });

                resolve({ engraveShapes, maskShapes });
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = (err) => reject(err);
        reader.readAsText(file);
    });
};
