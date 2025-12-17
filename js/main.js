import * as THREE from 'three';
import { SceneManager } from './scene.js';
import { Controls } from './controls.js';
import { PostProcessing } from './postprocessing.js';

// Application State
const state = {
    rtxEnabled: false,
    windEnabled: true,
    width: window.innerWidth,
    height: window.innerHeight
};

// DOM Elements
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const loadingScreen = document.getElementById('loader');
const fpsCounter = document.getElementById('fps');
const rtxToggle = document.getElementById('rtx-toggle');
const rtxStatus = document.getElementById('rtx-status');
const windToggle = document.getElementById('wind-toggle');

// Initialize Three.js
const renderer = new THREE.WebGLRenderer({ 
    canvas, 
    antialias: false, // AA handled by post-proc or disabled for perf
    powerPreference: "high-performance",
    stencil: false,
    depth: true
});
renderer.setSize(state.width, state.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// Managers
const sceneManager = new SceneManager(renderer);
const camera = sceneManager.camera;
const controls = new Controls(camera, document.body);
const postProcessing = new PostProcessing(renderer, sceneManager.scene, camera, state.width, state.height);

// Audio
const audioListener = new THREE.AudioListener();
camera.add(audioListener);
const windSound = new THREE.Audio(audioListener);
const audioLoader = new THREE.AudioLoader();

// Load Audio
audioLoader.load('wind_ambience.mp3', function(buffer) {
    windSound.setBuffer(buffer);
    windSound.setLoop(true);
    windSound.setVolume(0.5);
    if(state.windEnabled) windSound.play();
});

// Event Listeners
window.addEventListener('resize', onWindowResize, false);

rtxToggle.addEventListener('change', (e) => {
    state.rtxEnabled = e.target.checked;
    rtxStatus.innerText = state.rtxEnabled ? "ON" : "OFF";
    rtxStatus.style.color = state.rtxEnabled ? "var(--accent)" : "#aaa";
    sceneManager.setRTXMode(state.rtxEnabled);
});

windToggle.addEventListener('change', (e) => {
    state.windEnabled = e.target.checked;
    if(state.windEnabled) {
        if(!windSound.isPlaying) windSound.play();
        sceneManager.setWind(1.0);
    } else {
        if(windSound.isPlaying) windSound.pause();
        sceneManager.setWind(0.0);
    }
});

// Resize Handler
function onWindowResize() {
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    
    camera.aspect = state.width / state.height;
    camera.updateProjectionMatrix();
    
    renderer.setSize(state.width, state.height);
    postProcessing.setSize(state.width, state.height);
}

// Main Loop
let lastTime = 0;
let frameCount = 0;
let lastFpsTime = 0;

function animate(time) {
    requestAnimationFrame(animate);
    
    const delta = (time - lastTime) / 1000;
    lastTime = time;

    // FPS Counter
    frameCount++;
    if (time - lastFpsTime >= 1000) {
        fpsCounter.innerText = `${frameCount} FPS`;
        frameCount = 0;
        lastFpsTime = time;
    }

    // Logic
    controls.update(delta);
    sceneManager.update(time / 1000, delta); // Pass time in seconds

    // Render
    if (state.rtxEnabled) {
        postProcessing.render();
    } else {
        renderer.render(sceneManager.scene, camera);
    }
}

// Start
sceneManager.init().then(() => {
    loadingScreen.style.opacity = '0';
    setTimeout(() => {
        loadingScreen.style.display = 'none';
    }, 500);
    
    // Initial resize to ensure everything fits
    onWindowResize();
    
    // Start loop
    animate(0);
});

