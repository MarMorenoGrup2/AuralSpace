import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let camera, scene, renderer, controls, player, floorPlane, raycaster, pointer;
let isDragging = false;

// --- MOTOR DE AUDIO ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let sourceNode = null;
let userAudioBuffer = null;
let isPlaying = false;
let selectedAudioId = null;
let audioLibrary = [];

let masterGain = null;
// let dryGainNode = null; // COMENTADO: Audio real desactivado por ahora
let activeWetChain = null; 
const irBuffers = {}; 
const FADE_TIME = 0.2; 

// --- CONFIGURACIÓN DE LA MALLA (GRILLA) ---
const GRID_SIZE = 0.6; 
const OFFSET_X = -0.16;
const OFFSET_Z = 2.05;
let currentGridPos = { x: 2, z: 3 };

init();
animate();

async function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(6, 6, 10);
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // 1. JUGADOR (ESFERA ROJA)
    player = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 32, 32),
        new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff0000, emissiveIntensity: 0.5 })
    );
    updatePlayerPosition();
    scene.add(player);

    // 2. MALLA DE PUNTOS DISCRETA (Puntos de medición)
    const dotGeo = new THREE.SphereGeometry(0.015, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.4 });

    for (let x = 0; x < 6; x++) {
        for (let z = 0; z < 7; z++) {
            const dot = new THREE.Mesh(dotGeo, dotMat);
            dot.position.set(OFFSET_X + x * GRID_SIZE, 1.225, OFFSET_Z - z * 0.65);
            scene.add(dot);
        }
    }

    // 3. CARGA DE LA SALA 3D
    new GLTFLoader().load('./Sala3D.glb', (gltf) => {
        scene.add(gltf.scene);
        const floorGeo = new THREE.PlaneGeometry(20, 20);
        floorGeo.rotateX(-Math.PI / 2);
        floorPlane = new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial({ visible: false }));
        scene.add(floorPlane);
    });

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    await preloadAllIRs();

    // EVENTOS
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('resize', onResize);
    document.getElementById('audioInput').addEventListener('change', handleFileUpload);
    document.getElementById('playButton').addEventListener('click', toggleAudio);

    // El slider ahora solo controla el volumen de la Convolución
    document.getElementById('mixSlider').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (activeWetChain) activeWetChain.gainNode.gain.setTargetAtTime(val, audioCtx.currentTime, 0.05);
    });
}

async function preloadAllIRs() {
    const total = 42; let loaded = 0;
    const progressEl = document.getElementById('load-progress');
    const promises = [];
    for (let f = 1; f <= 6; f++) {
        for (let a = 1; a <= 7; a++) {
            const label = `${f}F-${a}A`;
            const p = fetch(`IRs/${label}.wav`).then(r => r.arrayBuffer())
                .then(ab => audioCtx.decodeAudioData(ab))
                .then(buf => {
                    irBuffers[label] = buf;
                    loaded++;
                    progressEl.innerText = `${Math.round((loaded/total)*100)}%`;
                }).catch(() => loaded++);
            promises.push(p);
        }
    }
    await Promise.all(promises);
    document.getElementById('loading-overlay').style.opacity = '0';
    setTimeout(() => document.getElementById('loading-overlay').remove(), 800);
}

function updateConvolver() {
    if (!isPlaying || !sourceNode) return;
    const label = `${currentGridPos.x + 1}F-${currentGridPos.z + 1}A`;
    const nextBuffer = irBuffers[label];
    if (!nextBuffer) return;

    const now = audioCtx.currentTime;
    const mixValue = parseFloat(document.getElementById('mixSlider').value);

    const nextWetGain = audioCtx.createGain();
    const nextConv = audioCtx.createConvolver();
    nextConv.buffer = nextBuffer;
    nextWetGain.gain.setValueAtTime(0, now);

    sourceNode.connect(nextConv);
    nextConv.connect(nextWetGain);
    nextWetGain.connect(masterGain);

    nextWetGain.gain.linearRampToValueAtTime(mixValue, now + FADE_TIME);

    if (activeWetChain) {
        const oldG = activeWetChain.gainNode;
        const oldC = activeWetChain.convNode;
        oldG.gain.linearRampToValueAtTime(0, now + FADE_TIME);
        setTimeout(() => { oldC.disconnect(); oldG.disconnect(); }, FADE_TIME * 1000);
    }
    activeWetChain = { convNode: nextConv, gainNode: nextWetGain };
}

async function toggleAudio() {
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    if (!isPlaying) {
        if (!userAudioBuffer) return alert("Sube un audio primero");

        masterGain = audioCtx.createGain();
        masterGain.connect(audioCtx.destination);

        sourceNode = audioCtx.createBufferSource();
        sourceNode.buffer = userAudioBuffer;
        sourceNode.loop = true;

        /* --- AUDIO DRY COMENTADO ---
        dryGainNode = audioCtx.createGain();
        dryGainNode.gain.value = 0; // Silenciado
        sourceNode.connect(dryGainNode);
        dryGainNode.connect(masterGain);
        ---------------------------- */

        sourceNode.start();
        isPlaying = true;
        updateConvolver();

        document.getElementById('playButton').textContent = "STOP AUDIO";
        document.getElementById('playButton').classList.add("playing");
    } else {
        stopAudio();
    }
}

function stopAudio() {
    if (sourceNode) { try { sourceNode.stop(); } catch(e) {} sourceNode = null; }
    if (activeWetChain) { activeWetChain.gainNode.disconnect(); activeWetChain.convNode.disconnect(); activeWetChain = null; }
    if (masterGain) { masterGain.disconnect(); masterGain = null; }
    isPlaying = false;
    document.getElementById('playButton').textContent = "PLAY AUDIO";
    document.getElementById('playButton').classList.remove("playing");
}

// --- UTILIDADES ---
function updatePlayerPosition() {
    player.position.x = OFFSET_X + currentGridPos.x * GRID_SIZE;
    player.position.z = OFFSET_Z - currentGridPos.z * 0.65;
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    audioLibrary.push({ id: Date.now(), name: file.name, data: buffer });
    renderAudioList();
}

function renderAudioList() {
    const container = document.getElementById("audioList");
    container.innerHTML = "";
    audioLibrary.forEach(audio => {
        const div = document.createElement("div");
        div.className = `audio-item ${selectedAudioId === audio.id ? 'active' : ''}`;
        div.innerHTML = `<span class="audio-name">${audio.name}</span><button class="delete-btn">✕</button>`;
        div.onclick = () => selectAudio(audio);
        div.querySelector('.delete-btn').onclick = (e) => { e.stopPropagation(); deleteAudio(audio.id); };
        container.appendChild(div);
    });
}

async function selectAudio(audio) {
    if (selectedAudioId === audio.id) return;
    selectedAudioId = audio.id;
    userAudioBuffer = await audioCtx.decodeAudioData(audio.data.slice(0));
    if (isPlaying) { stopAudio(); toggleAudio(); }
    renderAudioList();
}

function deleteAudio(id) {
    if (selectedAudioId === id) stopAudio();
    audioLibrary = audioLibrary.filter(a => a.id !== id);
    renderAudioList();
}

function onDown(e) {
    updatePointer(e);
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.intersectObject(player).length > 0) { isDragging = true; controls.enabled = false; }
}

function onMove(e) {
    updatePointer(e);
    if (!isDragging) return;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(floorPlane);
    if (hits.length > 0) {
        const pt = hits[0].point;
        let gx = Math.round((pt.x - OFFSET_X) / GRID_SIZE);
        let gz = Math.round((OFFSET_Z - pt.z) / 0.65);
        gx = Math.max(0, Math.min(5, gx)); gz = Math.max(0, Math.min(6, gz));
        if (gx !== currentGridPos.x || gz !== currentGridPos.z) {
            currentGridPos = { x: gx, z: gz };
            updatePlayerPosition();
            updateConvolver();
        }
    }
}

function onUp() { isDragging = false; controls.enabled = true; }
function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
function updatePointer(e) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
}
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}