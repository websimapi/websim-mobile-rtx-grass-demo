import * as THREE from 'three';

// Grass Vertex Shader
const vertexShader = `
  varying vec2 vUv;
  varying vec3 vColor;
  
  uniform float time;
  uniform float windStrength;
  
  attribute float scale;
  attribute vec3 instanceColor;
  
  // Simple noise function
  float noise(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }
  
  void main() {
    vUv = uv;
    vColor = instanceColor;
    
    vec3 pos = position;
    
    // Scale the blade
    pos *= scale;
    
    // Wind Animation
    // Only move the top vertices (uv.y > 0.0)
    // We assume the grass blade geometry has uv.y 0 at bottom and 1 at top
    float heightFactor = pow(uv.y, 2.0); // Curve bent
    
    // Global wind direction and wave
    float wave = sin(time * 2.0 + instanceMatrix[3][0] * 0.5 + instanceMatrix[3][2] * 0.5);
    float windOffset = wave * 0.3 * windStrength * heightFactor;
    
    // Add some random turbulence
    float turb = sin(time * 5.0 + instanceMatrix[3][0]) * 0.1 * windStrength * heightFactor;
    
    pos.x += windOffset + turb;
    pos.z += (windOffset * 0.5) + turb; // Diagonal wind
    
    // Apply curvature based on wind
    pos.y -= abs(windOffset) * 0.5; // Dip down when bending
    
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Grass Fragment Shader
const fragmentShader = `
  varying vec2 vUv;
  varying vec3 vColor;
  
  void main() {
    // Shape the blade with alpha texture or math
    // Let's use math for a tapered blade
    float width = 1.0 - pow(abs(vUv.x * 2.0 - 1.0), 3.0); // Tapered X
    // Cut off if width is too small (fake transparency)
    if (width < 0.2) discard; 
    
    // Gradient from dark bottom to light top
    vec3 color = mix(vColor * 0.5, vColor * 1.5, vUv.y);
    
    // Add fake specular for "RTX" wet look
    float specular = pow(vUv.y, 10.0) * 0.5;
    color += vec3(specular);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export class GrassSystem {
    constructor(terrainChunk, count) {
        this.terrain = terrainChunk;
        this.count = count;
        this.mesh = null;
        this.windStrength = 1.0;
        this.material = null;
        this.init();
    }

    init() {
        // Create single blade geometry
        // 3 segments high for bending
        const geometry = new THREE.PlaneGeometry(0.15, 1.0, 1, 4);
        geometry.translate(0, 0.5, 0); // Pivot at bottom

        this.material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                time: { value: 0 },
                windStrength: { value: 1.0 }
            },
            side: THREE.DoubleSide,
            transparent: false
        });

        this.mesh = new THREE.InstancedMesh(geometry, this.material, this.count);
        
        // Shadows for grass? Expensive. Let's enable casting but maybe not receiving self-shadows easily.
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        this.populate();
    }

    populate() {
        const dummy = new THREE.Object3D();
        const sampler = new THREE.Mesh(this.terrain.geometry); // Use original geometry for sampling
        const posAttribute = this.terrain.geometry.attributes.position;
        
        // Raycaster for accurate height
        const raycaster = new THREE.Raycaster();
        const down = new THREE.Vector3(0, -1, 0);

        const scales = [];
        const colors = [];

        for (let i = 0; i < this.count; i++) {
            // Random position within terrain bounds
            const x = (Math.random() - 0.5) * this.terrain.size;
            const z = (Math.random() - 0.5) * this.terrain.size;
            
            // Find height
            raycaster.set(new THREE.Vector3(x, 20, z), down);
            const intersects = raycaster.intersectObject(this.terrain.mesh);
            
            if (intersects.length > 0) {
                const y = intersects[0].point.y;
                const normal = intersects[0].face.normal;
                
                // Don't place grass on steep slopes (rock)
                if (normal.y < 0.7) {
                    // Reset to 0 scale to hide it
                    dummy.scale.set(0,0,0);
                    dummy.updateMatrix();
                    this.mesh.setMatrixAt(i, dummy.matrix);
                    scales.push(0);
                    colors.push(0,0,0);
                    continue;
                }

                dummy.position.set(x, y, z);
                
                // Random rotation
                dummy.rotation.y = Math.random() * Math.PI * 2;
                
                // Random scale
                const scale = 0.8 + Math.random() * 0.6;
                dummy.scale.set(scale, scale, scale);
                dummy.updateMatrix();
                
                this.mesh.setMatrixAt(i, dummy.matrix);
                scales.push(scale);
                
                // Color variation
                const color = new THREE.Color();
                color.setHSL(0.25 + Math.random() * 0.08, 0.6 + Math.random() * 0.2, 0.2 + Math.random() * 0.3);
                colors.push(color.r, color.g, color.b);
            } else {
                // Fallback
                dummy.position.set(x, 0, z);
                dummy.updateMatrix();
                this.mesh.setMatrixAt(i, dummy.matrix);
                scales.push(1);
                colors.push(0,1,0);
            }
        }

        this.mesh.geometry.setAttribute('scale', new THREE.InstancedBufferAttribute(new Float32Array(scales), 1));
        this.mesh.geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(new Float32Array(colors), 3));
        
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    update(time) {
        if (this.material) {
            this.material.uniforms.time.value = time;
            this.material.uniforms.windStrength.value = this.windStrength;
        }
    }

    setWindStrength(val) {
        this.windStrength = val;
    }
}

