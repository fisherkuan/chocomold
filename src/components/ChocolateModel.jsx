import { forwardRef, useEffect, useMemo } from 'react';
import { CylinderGeometry, ExtrudeGeometry, Vector3, Shape, Vector2 } from 'three';
import { SUBTRACTION, Brush, Evaluator } from 'three-bvh-csg';

const BASE_SIZE = 10;
const BASE_HEIGHT = 1.2;
const OVERCUT = 0.05;

// Helper to transform shapes in 2D to avoid 3D operations where possible
const transformShapes = (shapes, targetScale = 1) => {
    if (!shapes || shapes.length === 0) return { transformed: [], bounds: null };

    // 1. Calculate Bounds of the original shapes
    const tempGeo = new ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false });
    tempGeo.computeBoundingBox();
    const box = tempGeo.boundingBox;
    const center = new Vector3();
    box.getCenter(center);
    const size = new Vector3();
    box.getSize(size);
    tempGeo.dispose();

    // 2. Adjust for Scale
    const maxDim = Math.max(size.x, size.y);
    // Target is to fit BASE_SIZE * targetScale
    const fitScale = maxDim > 0 ? (BASE_SIZE * targetScale) / maxDim : 1;

    // 3. Create new Shapes with points transformed
    const transformed = shapes.map(shape => {
        const newShape = new Shape();

        // Transform a point
        const transformPoint = (x, y) => {
            const tx = (x - center.x) * fitScale;
            const ty = (y - center.y) * fitScale; // Center at 0,0
            return new Vector2(tx, ty);
        };

        // Rebuild shape from points (approximation) to ensure clean topology
        // Extract points from the shape
        const points = shape.getPoints();
        const newPoints = points.map(p => transformPoint(p.x, p.y));
        newShape.setFromPoints(newPoints);

        // Handle holes
        if (shape.holes && shape.holes.length > 0) {
            shape.holes.forEach(hole => {
                const holePoints = hole.getPoints().map(p => transformPoint(p.x, p.y));
                const newHole = new Shape().setFromPoints(holePoints);
                newShape.holes.push(newHole);
            });
        }

        return newShape;
    });

    return { transformed, fitScale };
};

const buildChocolateGeometry = (patternShapes, depth, invert, userScale) => {
    const topSize = BASE_SIZE;
    const bottomSize = BASE_SIZE * 1.05;
    const radiusTop = topSize / Math.sqrt(2);
    const radiusBottom = bottomSize / Math.sqrt(2);

    const baseGeometry = new CylinderGeometry(radiusTop, radiusBottom, BASE_HEIGHT, 4);
    baseGeometry.rotateY(Math.PI / 4);

    const engraveShapes = patternShapes?.engraveShapes ?? [];
    const maskShapes = patternShapes?.maskShapes ?? [];

    if (engraveShapes.length > 2000) {
        console.warn("Shape count too high, aborting detail generation to prevent crash");
        return { chocolateGeometry: baseGeometry };
    }

    if (engraveShapes.length === 0) {
        return { chocolateGeometry: baseGeometry };
    }

    // Combine for unified bounding box calculation
    const allShapes = maskShapes.length > 0 ? [...engraveShapes, ...maskShapes] : engraveShapes;

    // Transform all shapes to Mold Space (0,0 centered)
    const { transformed: transformedAll } = transformShapes(allShapes, userScale);

    // Split back into engrave and mask
    const splitIndex = engraveShapes.length;
    const transformedEngrave = transformedAll.slice(0, splitIndex);
    const transformedMask = transformedAll.slice(splitIndex);

    const extrudeDepth = Math.max(Math.min(depth, BASE_HEIGHT - 0.1), 0.05) + OVERCUT;

    try {
        const evaluator = new Evaluator();
        let toolBrush;

        if (invert) {
            // Stable Invert Logic:
            // "Background" = Plate (10x10) MINUS Pattern (Engrave).
            // "Masks" = White areas inside Pattern > Should be SUBTRACTED from Base (same as Background).
            // So Tool = [PlateWithEngraveHoles, ...Masks].

            // 1. Create Plate
            // Make it large enough to contain the pattern even if scaled up significantly.
            // If the pattern (holes) intersects the plate edge, geometry breaks.
            // Plate acts as the "Tool" that cuts away the background.
            // Base - (PlateWithHoles) = Base matches Holes (Raised Pattern).
            const safeScale = Math.max(userScale, 1.0) * 2.5;
            const plateSize = BASE_SIZE * safeScale;
            const plateShape = new Shape();
            plateShape.moveTo(-plateSize / 2, -plateSize / 2);
            plateShape.lineTo(plateSize / 2, -plateSize / 2);
            plateShape.lineTo(plateSize / 2, plateSize / 2);
            plateShape.lineTo(-plateSize / 2, plateSize / 2);
            plateShape.closePath();

            // 2. Add Engrave Shapes as Holes to Plate
            // This is valid since they are coplanar and we just transformed them to center.
            plateShape.holes.push(...transformedEngrave);

            // 3. Extract internal holes from Engrave Shapes
            // These are holes inside the pattern (donuts) that need to be CUT from the base (made Low).
            // Since they are holes in the 'Pattern', they were ignored by step 2 (plate just has a void at pattern outline).
            // We need to add them as SOLIDS to the Tool so they get subtracted from Base.
            const internalHoles = [];
            transformedEngrave.forEach(shape => {
                if (shape.holes && shape.holes.length > 0) {
                    shape.holes.forEach(hole => {
                        // Create a new Shape from the Hole Path to treat it as a Solid
                        const holeShape = new Shape();
                        const points = hole.getPoints();
                        // ThreeJS holes are typically CW, Shapes should be CCW.
                        // We might need to reverse points if they are CW to ensure valid Extrusion.
                        // However, standard ExtrudeGeometry is often forgiving, or we can force CCW.
                        // simple reversal is usually enough for a hole->shape conversion.
                        holeShape.setFromPoints(points.reverse());
                        internalHoles.push(holeShape);
                    });
                }
            });

            // 4. Extrude the "Plate with Holes" AND the "Masks" AND "Internal Holes"
            // We can extrude them all in one go as a single geometry
            const toolShapes = [plateShape, ...transformedMask, ...internalHoles];

            const toolGeometry = new ExtrudeGeometry(toolShapes, { depth: extrudeDepth, bevelEnabled: false });
            toolGeometry.rotateX(Math.PI / 2);
            toolGeometry.translate(0, BASE_HEIGHT / 2 + 0.01, 0); // Position at top

            toolBrush = new Brush(toolGeometry);
            toolBrush.updateMatrixWorld();

        } else {
            // Normal Logic: 
            // Tool = Engrave. 
            // If masks exist, Tool = Tool - Masks.

            const engraveGeometry = new ExtrudeGeometry(transformedEngrave, { depth: extrudeDepth, bevelEnabled: false });
            engraveGeometry.rotateX(Math.PI / 2);
            engraveGeometry.translate(0, BASE_HEIGHT / 2 + 0.01, 0);

            toolBrush = new Brush(engraveGeometry);
            toolBrush.updateMatrixWorld();

            if (transformedMask.length > 0) {
                const maskGeometry = new ExtrudeGeometry(transformedMask, { depth: extrudeDepth, bevelEnabled: false });
                maskGeometry.rotateX(Math.PI / 2);
                maskGeometry.translate(0, BASE_HEIGHT / 2 + 0.01, 0);

                const maskBrush = new Brush(maskGeometry);
                maskBrush.updateMatrixWorld();

                try {
                    const trimmed = evaluator.evaluate(toolBrush, maskBrush, SUBTRACTION);
                    toolBrush.geometry.dispose();
                    maskBrush.geometry.dispose();
                    toolBrush = trimmed;
                    toolBrush.updateMatrixWorld();
                } catch (err) {
                    console.warn("Mask subtraction failed", err);
                    maskBrush.geometry.dispose();
                }
            }
        }

        // Final Subtraction: Base - Tool
        const baseBrush = new Brush(baseGeometry);
        baseBrush.updateMatrixWorld();

        const result = evaluator.evaluate(baseBrush, toolBrush, SUBTRACTION);

        baseBrush.geometry.dispose();
        toolBrush.geometry.dispose();

        return { chocolateGeometry: result.geometry };

    } catch (error) {
        console.error("Geometry generation failed:", error);
        return { chocolateGeometry: baseGeometry };
    }
};

const ChocolateModel = forwardRef(({ patternShapes, depth, invert, scale }, ref) => {
    const geometries = useMemo(
        () => buildChocolateGeometry(patternShapes, depth, invert, scale || 1),
        [patternShapes, depth, invert, scale],
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
