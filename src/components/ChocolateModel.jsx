import { forwardRef, useEffect, useMemo } from 'react';
import { CylinderGeometry, ExtrudeGeometry, Vector3 } from 'three';
import { SUBTRACTION, Brush, Evaluator } from 'three-bvh-csg';

const BASE_SIZE = 10;
const BASE_HEIGHT = 1.2;
const PATTERN_MARGIN = 1;
const OVERCUT = 0.05;
const SURFACE_OFFSET = 0.01;

const createExtrudeGeometry = (shapes, depth) => new ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: false,
});

const computeTransform = (shapes) => {
    const geometry = createExtrudeGeometry(shapes, 1);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    const center = new Vector3();
    bounds.getCenter(center);
    const size = new Vector3();
    bounds.getSize(size);
    const maxDimension = Math.max(size.x, size.y);
    const targetSpan = BASE_SIZE - PATTERN_MARGIN * 2;
    const scale = maxDimension > 0 ? targetSpan / maxDimension : 1;
    geometry.dispose();
    return { center, scale };
};

const applyTransform = (geometry, center, scale) => {
    geometry.translate(-center.x, -center.y, 0);
    geometry.scale(scale, scale, 1);
    geometry.rotateX(Math.PI / 2);
    const topY = (BASE_HEIGHT / 2) + SURFACE_OFFSET;
    geometry.translate(0, topY, 0);
};

const buildChocolateGeometry = (patternShapes, depth) => {
    // Trapezoid base: Cylinder with 4 segments, rotated to look like a square pyramid frustum
    // Size is distance from center to corner (radius). For side length L, radius is L / sqrt(2).
    const topSize = BASE_SIZE;
    const bottomSize = BASE_SIZE * 1.05; // Slightly larger bottom
    const radiusTop = topSize / Math.sqrt(2);
    const radiusBottom = bottomSize / Math.sqrt(2);

    // CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)
    const baseGeometry = new CylinderGeometry(radiusTop, radiusBottom, BASE_HEIGHT, 4);
    baseGeometry.rotateY(Math.PI / 4); // Align sides with axes
    const engraveShapes = patternShapes?.engraveShapes ?? [];
    const maskShapes = patternShapes?.maskShapes ?? [];

    if (engraveShapes.length === 0) {
        return { chocolateGeometry: baseGeometry };
    }

    const combinedShapes = maskShapes.length > 0
        ? [...engraveShapes, ...maskShapes]
        : engraveShapes;
    const { center, scale } = computeTransform(combinedShapes);

    const targetDepth = Math.max(Math.min(depth, BASE_HEIGHT - 0.1), 0.05);
    const extrudeDepth = targetDepth + OVERCUT;

    try {
        const engraveGeometry = createExtrudeGeometry(engraveShapes, extrudeDepth);
        applyTransform(engraveGeometry, center, scale);
        let engraveBrush = new Brush(engraveGeometry);
        engraveBrush.updateMatrixWorld();

        const evaluator = new Evaluator();

        if (maskShapes.length > 0) {
            const maskGeometry = createExtrudeGeometry(maskShapes, extrudeDepth);
            applyTransform(maskGeometry, center, scale);
            const maskBrush = new Brush(maskGeometry);
            maskBrush.updateMatrixWorld();

            // Wrap CSG operation in try-catch in case of complex geometry failure
            try {
                const trimmed = evaluator.evaluate(engraveBrush, maskBrush, SUBTRACTION);
                engraveBrush.geometry.dispose();
                maskBrush.geometry.dispose();
                trimmed.updateMatrixWorld();
                engraveBrush = trimmed;
            } catch (err) {
                console.warn("Mask subtraction failed, proceeding with original engrave shapes", err);
                // Fallback: Skip mask subtraction if it crashes
                maskBrush.geometry.dispose();
            }
        }

        if (!engraveBrush.geometry?.attributes?.position?.count) {
            engraveBrush.geometry?.dispose?.();
            return { chocolateGeometry: baseGeometry };
        }

        const baseBrush = new Brush(baseGeometry);
        baseBrush.updateMatrixWorld();

        let carved;
        try {
            carved = evaluator.evaluate(baseBrush, engraveBrush, SUBTRACTION);
        } catch (err) {
            console.error("Base carving failed", err);
            // Return just the base if carving fails
            baseBrush.geometry.dispose();
            engraveBrush.geometry.dispose();
            return { chocolateGeometry: baseGeometry };
        }

        baseBrush.geometry.dispose();
        engraveBrush.geometry.dispose();

        return {
            chocolateGeometry: carved.geometry,
        };
    } catch (error) {
        console.error("Critical error in geometry generation:", error);
        return { chocolateGeometry: baseGeometry };
    }
};

const ChocolateModel = forwardRef(({ patternShapes, depth }, ref) => {
    const geometries = useMemo(
        () => buildChocolateGeometry(patternShapes, depth),
        [patternShapes, depth],
    );

    useEffect(() => {
        return () => {
            geometries.chocolateGeometry?.dispose?.();
        };
    }, [geometries]);

    return (
        <group>
            <mesh
                ref={ref}
                geometry={geometries.chocolateGeometry}
                castShadow
                receiveShadow
            >
                <meshStandardMaterial
                    color="#8b5a38"
                    roughness={0.5}
                    metalness={0.08}
                    envMapIntensity={0.2}
                />
            </mesh>
        </group>
    );
});

export default ChocolateModel;
