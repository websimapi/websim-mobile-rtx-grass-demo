import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';

export class PostProcessing {
    constructor(renderer, scene, camera, width, height) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.width = width;
        this.height = height;
        
        this.composer = new EffectComposer(renderer);
        this.init();
    }

    init() {
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // 1. SSAO (Screen Space Ambient Occlusion) - The core of "RTX" look for geometry
        this.ssaoPass = new SSAOPass(this.scene, this.camera, this.width, this.height);
        this.ssaoPass.kernelRadius = 16; // Bigger radius for terrain
        this.ssaoPass.minDistance = 0.001;
        this.ssaoPass.maxDistance = 0.15;
        // Output AO directly? No, blend.
        this.composer.addPass(this.ssaoPass);

        // 2. Bloom - High dynamic range glow
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 1.5, 0.4, 0.85);
        this.bloomPass.threshold = 0.6; // Only bright things glow
        this.bloomPass.strength = 0.8;
        this.bloomPass.radius = 0.5;
        this.composer.addPass(this.bloomPass);

        // 3. Bokeh (Depth of Field) - Focus terrain
        // This is heavy, maybe optional or subtle.
        this.bokehPass = new BokehPass(this.scene, this.camera, {
            focus: 10.0,
            aperture: 0.0001,
            maxblur: 0.01
        });
        // We won't add Bokeh by default as it makes gameplay blurry often, 
        // but we can add it if requested. The prompt said "render focus terrain".
        this.composer.addPass(this.bokehPass);

        // 4. Output with Tone Mapping
        const outputPass = new OutputPass();
        this.composer.addPass(outputPass);
    }

    setSize(width, height) {
        this.composer.setSize(width, height);
        this.ssaoPass.setSize(width, height);
        // Update bloom resolution?
    }

    render() {
        this.composer.render();
    }
    
    setRTX(enabled) {
        // Boost bloom and SSAO in RTX mode
        if(enabled) {
            this.ssaoPass.kernelRadius = 32;
            this.bloomPass.strength = 1.2;
            this.bloomPass.radius = 0.8;
        } else {
            this.ssaoPass.kernelRadius = 16;
            this.bloomPass.strength = 0.8;
            this.bloomPass.radius = 0.5;
        }
    }
}

