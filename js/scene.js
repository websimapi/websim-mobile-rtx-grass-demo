import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { TerrainChunk } from './terrain.js';
import { GrassSystem } from './grass.js';

export class SceneManager {
    constructor(renderer) {
        this.renderer = renderer;
        this.scene = new THREE.Scene();
        
        // Fog for depth
        this.scene.fog = new THREE.FogExp2(0x111111, 0.02);
        this.scene.background = new THREE.Color(0x111111);

        // Camera setup
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.set(0, 2, 5);

        // Systems
        this.terrain = null;
        this.grass = null;
        
        // Lights
        this.setupLights();
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
        this.scene.add(ambientLight);

        this.sunLight = new THREE.DirectionalLight(0xffdfaa, 2.0);
        this.sunLight.position.set(50, 50, 50);
        this.sunLight.castShadow = true;
        
        // Optimize shadows for mobile
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 150;
        this.sunLight.shadow.camera.left = -50;
        this.sunLight.shadow.camera.right = 50;
        this.sunLight.shadow.camera.top = 50;
        this.sunLight.shadow.camera.bottom = -50;
        this.sunLight.shadow.bias = -0.0005;
        
        this.scene.add(this.sunLight);

        // Blue rim light for "night/dusk" feel or cinematic contrast
        const rimLight = new THREE.DirectionalLight(0x4455ff, 0.5);
        rimLight.position.set(-50, 20, -50);
        this.scene.add(rimLight);
    }

    async init() {
        // Generate Terrain
        this.terrain = new TerrainChunk(100, 64);
        await this.terrain.generate();
        this.scene.add(this.terrain.mesh);

        // Generate Grass
        this.grass = new GrassSystem(this.terrain, 40000); // 40k instances
        this.scene.add(this.grass.mesh);
    }

    update(time, delta, rtxEnabled) {
        if (this.grass) this.grass.update(time, this.sunLight.position, rtxEnabled);
    }

    setRTXMode(enabled) {
        // Adjust lighting intensity if needed for post-processing
        if (enabled) {
            this.sunLight.intensity = 3.0;
            this.scene.fog.density = 0.01; 
            // Improve shadows
            this.sunLight.shadow.mapSize.width = 4096;
            this.sunLight.shadow.mapSize.height = 4096;
            this.sunLight.shadow.bias = -0.0001; // Tighter bias
        } else {
            this.sunLight.intensity = 2.0;
            this.scene.fog.density = 0.02;
            // Lower shadows for perf
            this.sunLight.shadow.mapSize.width = 2048;
            this.sunLight.shadow.mapSize.height = 2048;
            this.sunLight.shadow.bias = -0.0005;
        }
        
        // Force update of shadow map
        this.sunLight.shadow.map.dispose();
        this.sunLight.shadow.map = null;
    }

    setWind(strength) {
        if(this.grass) this.grass.setWindStrength(strength);
    }
}

