import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

export class TerrainChunk {
    constructor(size, resolution) {
        this.size = size;
        this.resolution = resolution;
        this.mesh = null;
        this.geometry = null;
        this.heightData = [];
        this.noise2D = createNoise2D();
    }

    _computeHeight(x, z) {
        let y = this.noise2D(x * 0.02, z * 0.02) * 4;
        y += this.noise2D(x * 0.1, z * 0.1) * 0.5;
        y += this.noise2D(x * 0.5, z * 0.5) * 0.1;
        return y;
    }

    async generate() {
        this.geometry = new THREE.PlaneGeometry(this.size, this.size, this.resolution, this.resolution);
        this.geometry.rotateX(-Math.PI / 2);

        const posAttribute = this.geometry.attributes.position;
        const vertexCount = posAttribute.count;
        const colors = [];

        // Generate Height
        for (let i = 0; i < vertexCount; i++) {
            const x = posAttribute.getX(i);
            const z = posAttribute.getZ(i);
            
            const y = this._computeHeight(x, z);
            
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

        // Generate HD Soil Texture
        const texture = this._generateSoilTexture();

        // Material setup
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            vertexColors: false, // Using texture now
            roughness: 0.85,
            metalness: 0.1,
            flatShading: false
        });
        
        // Add Normal Map for HD detail (simulated from same texture data)
        material.normalMap = this._generateNormalMap(texture);
        material.normalScale = new THREE.Vector2(2, 2);

        this.mesh = new THREE.Mesh(this.geometry, material);
        this.mesh.receiveShadow = true;
        this.mesh.castShadow = true;
    }

    // Helper to get height at specific x,z
    getHeightAt(x, z) {
        return this._computeHeight(x, z);
    }

    _generateSoilTexture() {
        const width = 512;
        const height = 512;
        const size = width * height;
        const data = new Uint8Array(4 * size);
        
        for (let i = 0; i < size; i++) {
            const x = i % width;
            const y = Math.floor(i / width);
            
            // High freq noise for dirt grains
            const nx = x / width;
            const ny = y / height;
            
            // Simulating noise with math (pseudo random)
            const n1 = (Math.sin(nx * 100.0) + Math.cos(ny * 100.0)) * 0.5 + 0.5; 
            const n2 = (Math.sin(nx * 20.0 + ny * 50.0) * Math.cos(ny * 20.0 - nx * 10.0)) * 0.5 + 0.5;
            
            // Base Brown: RGB(74, 57, 41)
            // Var 1: RGB(54, 38, 26)
            
            const intensity = 0.5 * n2 + 0.2 * n1 + 0.3 * Math.random();
            
            data[4 * i] = 50 + intensity * 40;     // R
            data[4 * i + 1] = 35 + intensity * 30; // G
            data[4 * i + 2] = 20 + intensity * 20; // B
            data[4 * i + 3] = 255;                 // A
        }
        
        const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(10, 10); // Tile it
        texture.anisotropy = 16;
        texture.needsUpdate = true;
        return texture;
    }

    _generateNormalMap(diffuseTex) {
        // Create a simple normal map from the diffuse data
        // Darker areas are deeper
        const width = diffuseTex.image.width;
        const height = diffuseTex.image.height;
        const data = new Uint8Array(4 * width * height);
        const src = diffuseTex.image.data;
        
        for (let i = 0; i < width * height; i++) {
            const x = i % width;
            const y = Math.floor(i / width);
            
            // Get neighbors
            const r = (x + 1) % width;
            const l = (x - 1 + width) % width;
            const t = (y - 1 + height) % height;
            const b = (y + 1) % height;
            
            const val = (idx) => src[4 * idx] / 255.0; // Use Red channel as height
            
            const dx = (val(y * width + r) - val(y * width + l)) * 5.0; // strength
            const dy = (val(b * width + x) - val(t * width + x)) * 5.0;
            
            // Normal vector (dx, dy, 1) normalized and mapped to 0-255
            let nx = -dx;
            let ny = -dy;
            let nz = 1.0;
            
            const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
            nx /= len; ny /= len; nz /= len;
            
            data[4 * i] = (nx * 0.5 + 0.5) * 255;
            data[4 * i + 1] = (ny * 0.5 + 0.5) * 255;
            data[4 * i + 2] = (nz * 0.5 + 0.5) * 255;
            data[4 * i + 3] = 255;
        }
        
        const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.copy(diffuseTex.repeat);
        tex.needsUpdate = true;
        return tex;
    }
}

