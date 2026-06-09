import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Environment, ContactShadows, PresentationControls } from '@react-three/drei';
import * as THREE from 'three';

const GlassShape = ({ position, rotation, scale, color, shape }) => {
    const meshRef = useRef();

    useFrame((state) => {
        const t = state.clock.getElapsedTime();
        if (meshRef.current) {
            meshRef.current.rotation.y = Math.sin(t / 4) / 4 + rotation[1];
            meshRef.current.rotation.z = Math.sin(t / 4) / 4 + rotation[2];
            meshRef.current.position.y = Math.sin(t / 2) / 10 + position[1];
        }
    });

    const geometry = shape === 'box' ? <boxGeometry args={[1, 1.5, 0.2]} /> : <capsuleGeometry args={[0.5, 1, 4, 16]} />;

    return (
        <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
            <mesh ref={meshRef} position={position} rotation={rotation} scale={scale}>
                {geometry}
                <meshPhysicalMaterial
                    color={color}
                    transmission={0.9}
                    opacity={1}
                    metalness={0.1}
                    roughness={0.05}
                    ior={1.5}
                    thickness={0.5}
                    specularIntensity={1}
                    envMapIntensity={1}
                />
            </mesh>
        </Float>
    );
};

export default function FloatingBloKKit3D({ theme = 'light' }) {
    const accentColor = new THREE.Color('#3ce0d0');
    const secondaryColor = new THREE.Color(theme === 'dark' ? '#16213e' : '#e0f7fa');

    return (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}>
            <Canvas camera={{ position: [0, 0, 5], fov: 45 }} dpr={[1, 2]}>
                <ambientLight intensity={theme === 'dark' ? 0.2 : 0.8} />
                <directionalLight position={[10, 10, 5]} intensity={1} color={theme === 'dark' ? '#ffffff' : '#f0f0f0'} />
                <spotLight position={[-10, 10, 10]} penumbra={1} intensity={1.5} color={accentColor} />

                <PresentationControls global config={{ mass: 2, tension: 500 }} snap={{ mass: 4, tension: 1500 }} rotation={[0, 0.3, 0]} polar={[-Math.PI / 3, Math.PI / 3]} azimuth={[-Math.PI / 1.4, Math.PI / 2]}>
                    {/* Main Center BlokKit */}
                    <GlassShape position={[-1.5, 0, 0]} rotation={[0, 0.2, 0]} scale={1.2} color={accentColor} shape="box" />
                    <ContactShadows position={[-1.5, -2, 0]} opacity={0.4} scale={5} blur={2} />

                    {/* Secondary Floating Elements */}
                    <GlassShape position={[1.5, 0.5, -1]} rotation={[0.5, -0.2, 0.1]} scale={0.8} color={secondaryColor} shape="capsule" />

                    <GlassShape position={[2.5, -1, -2]} rotation={[-0.2, 0.4, -0.1]} scale={0.6} color={accentColor} shape="box" />
                </PresentationControls>

                <Environment preset="city" />
            </Canvas>
        </div>
    );
}
