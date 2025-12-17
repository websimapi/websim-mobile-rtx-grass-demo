import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

export class TerrainChunk {
    constructor(size, resolution) {
        this.size = size;
        this.resolution = resolution;
        this.mesh = null;
        this.geometry = null;
        this.heightData = [];
    }

    async generate() {
        const noise2D = createNoise2D();
        this.geometry = new THREE.PlaneGeometry(this.size, this.size, this.resolution, this.resolution);
        this.geometry.rotateX(-Math.PI / 2);

        const posAttribute = this.geometry.attributes.position;
        const vertexCount = posAttribute.count;
        const colors = [];

        // Generate Height
        for (let i = 0; i < vertexCount; i++) {
            const x = posAttribute.getX(i);
            const z = posAttribute.getZ(i);
            
            // Multiple octaves of noise
            let y = noise2D(x * 0.02, z * 0.02) * 4;
            y += noise2D(x * 0.1, z * 0.1) * 0.5;
            y += noise2D(x * 0.5, z * 0.5) * 0.1;
            
            // Flatten edges to blend into fog if we had infinite terrain, 
            // but for this scene, we make a bowl shape? No, just infinite plane illusion.
            
            posAttribute.setY(i, y);
            this.heightData.push(y);
        }

        this.geometry.computeVertexNormals();

        // "Bake" Lighting (AO & Slope darkening)
        // We simulate raytracing by checking normal 'up' ness and local concavity
        for (let i = 0; i < vertexCount; i++) {
            const normal = new THREE.Vector3(
                this.geometry.attributes.normal.getX(i),
                this.geometry.attributes.normal.getY(i),
                this.geometry.attributes.normal.getZ(i)
            );
            
            // 1. Slope based coloring (Steep = Rock/Darker, Flat = Grass/Lighter)
            const slope = normal.dot(new THREE.Vector3(0, 1, 0));
            
            // 2. Height based darkening (Crevices are darker)
            const y = posAttribute.getY(i);
            // Simple logic: lower is slightly darker
            const heightFactor = THREE.MathUtils.mapLinear(y, -5, 5, 0.4, 1.0);
            
            // Combine for "Baked" occlusion color
            const ao = Math.max(0.1, slope * heightFactor);
            
            // Base color mix: Greenish for grass, brownish for steep
            const baseColor = new THREE.Color().setHSL(0.25 + (Math.random() * 0.05), 0.5, 0.2 + ao * 0.3);
            const rockColor = new THREE.Color().setHSL(0.08, 0.3, 0.3 * ao);
            
            // Lerp based on slope
            baseColor.lerp(rockColor, 1 - Math.pow(slope, 4)); // Sharp transition

            colors.push(baseColor.r, baseColor.g, baseColor.b);
        }

        this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        // Material setup
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.9,
            metalness: 0.1,
            flatShading: true // Low poly style look is popular, or remove for smooth
        });
        
        // Actually, let's go smooth for "High Detail" look
        material.flatShading = false;

        this.mesh = new THREE.Mesh(this.geometry, material);
        this.mesh.receiveShadow = true;
        this.mesh.castShadow = true;
    }

    // Helper to get height at specific x,z
    getHeightAt(x, z) {
        // Raycaster is accurate but slow. 
        // For grass placement, we can just use the noise function again if we kept the seed/logic,
        // or raycast once during init.
        // For now, we will use raycaster in the Grass system setup.
        return 0; 
    }
}

