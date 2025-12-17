import * as THREE from 'three';

// Grass Vertex Shader (RTX Ready)
const vertexShader = `
  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;
  
  uniform float time;
  uniform float windStrength;
  
  attribute float scale;
  attribute vec3 instanceColor;
  
  void main() {
    vUv = uv;
    vColor = instanceColor;
    
    // Base position
    vec3 pos = position;
    pos *= scale;
    
    // Wind Logic
    float heightFactor = pow(uv.y, 2.0);
    float x = instanceMatrix[3][0];
    float z = instanceMatrix[3][2];
    
    // Complex Wind: Layered waves
    float wave1 = sin(time * 1.0 + x * 0.5 + z * 0.5);
    float wave2 = sin(time * 2.5 + x * 1.5 + z * 0.2); 
    
    float combinedWave = (wave1 + wave2 * 0.5) * windStrength;
    
    float xOffset = combinedWave * 0.25 * heightFactor;
    float zOffset = cos(time * 0.8 + x) * 0.1 * windStrength * heightFactor;
    
    pos.x += xOffset;
    pos.z += zOffset;
    
    // Curvature preservation (approx)
    pos.y -= abs(xOffset) * 0.2;
    
    // Calculate Normal (Approximation for bending)
    vec3 objectNormal = vec3(0.0, 0.0, 1.0);
    objectNormal.x -= xOffset * 2.0; 
    objectNormal = normalize(objectNormal);
    
    // World Position
    vec4 worldPos = instanceMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPos.xyz;
    
    // View Position
    vec4 mvPosition = modelViewMatrix * worldPos;
    vViewPosition = -mvPosition.xyz;
    
    // Normal in View Space
    vNormal = normalize(normalMatrix * mat3(instanceMatrix) * objectNormal);
    
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Grass Fragment Shader - High Fidelity PBR approximation
const fragmentShader = `
  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  
  uniform vec3 sunPosition;
  uniform float rtxEnabled; 
  
  void main() {
    // 1. Blade Shape
    float shape = 1.0 - pow(abs(vUv.x * 2.0 - 1.0), 2.5);
    if (shape < 0.1) discard;
    
    // 2. Base Color Gradient (Roots darker)
    vec3 color = mix(vColor * 0.1, vColor, smoothstep(0.0, 0.3, vUv.y));
    color = mix(color, vColor * 1.4, smoothstep(0.5, 1.0, vUv.y));
    
    // 3. Lighting Data
    vec3 N = normalize(vNormal);
    vec3 L = normalize(sunPosition);
    vec3 V = normalize(vViewPosition);
    vec3 H = normalize(L + V);
    
    // 4. Diffuse (Wrap lighting for softness)
    float NdotL = dot(N, L);
    float diffuse = max(NdotL, 0.0) * 0.7 + 0.3; // Half-lambert-ish
    
    // 5. Specular (Sun glint)
    float spec = pow(max(dot(N, H), 0.0), 32.0) * 0.5;
    
    // 6. Translucency (RTX Style SSS)
    // Light coming through the back of the blade
    float backLight = max(dot(L, -V), 0.0);
    float sss = pow(backLight, 8.0) * vUv.y * 1.5;
    vec3 sssColor = vec3(1.0, 1.0, 0.6) * sss;
    
    // 7. Ambient Occlusion (Simulated deep grass darkening)
    float ao = smoothstep(0.0, 0.4, vUv.y);
    
    // Compose
    vec3 finalColor = color * diffuse;
    finalColor += sssColor; // Glow adds to base
    finalColor += vec3(spec); // Gloss on top
    
    finalColor *= ao; // Apply AO
    
    // Gamma (Approximation)
    gl_FragColor = vec4(finalColor, 1.0);
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
                windStrength: { value: 1.0 },
                sunPosition: { value: new THREE.Vector3(50, 50, 50) },
                rtxEnabled: { value: 0.0 }
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

    update(time, sunPos, rtx) {
        if (this.material) {
            this.material.uniforms.time.value = time;
            this.material.uniforms.windStrength.value = this.windStrength;
            if(sunPos) this.material.uniforms.sunPosition.value.copy(sunPos);
            this.material.uniforms.rtxEnabled.value = rtx ? 1.0 : 0.0;
        }
    }

    setWindStrength(val) {
        this.windStrength = val;
    }
}

