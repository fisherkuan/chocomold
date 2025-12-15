import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import ChocolateModel from './ChocolateModel';

const ChocolateScene = ({ patternShapes, depth, invert, modelRef, scale }) => {
    return (
        <Canvas
            shadows
            camera={{ position: [16, 16, 16], fov: 45 }}
            style={{ background: '#fce4ec' }}
        >
            <ambientLight intensity={0.4} />
            <hemisphereLight
                args={['#ffe9d6', '#402313', 0.6]}
                position={[0, 5, 0]}
            />
            <spotLight
                position={[8, 12, 6]}
                angle={0.35}
                penumbra={0.5}
                intensity={1.2}
                castShadow
            />
            <directionalLight
                position={[-6, 6, -4]}
                intensity={0.6}
                color="#ffd9c1"
                castShadow
            />
            <pointLight position={[0, 2, 0]} intensity={0.2} />

            <OrbitControls
                makeDefault
                maxPolarAngle={(Math.PI / 2) - 0.05}
                minPolarAngle={0.05}
            />

            <ChocolateModel ref={modelRef} patternShapes={patternShapes} depth={depth} scale={scale} invert={invert} />
        </Canvas>
    );
};

export default ChocolateScene;
