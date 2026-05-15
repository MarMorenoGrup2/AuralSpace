import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let camera, scene, renderer, controls, player, floorPlane, raycaster, pointer;
let isDragging = false;
let autoPlayStarted = false; 

//AUDIO
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let sourceNode = null;
let userAudioBuffer = null;
let isPlaying = false;
let selectedAudioId = null;
let audioLibrary = [];
let currentMode = 'mono';

let masterGain = null;
let activeWetChain = null; 
const irBuffers = {}; 
const FADE_TIME = 0.2; 

//MESH
const GRID_SIZE = 0.6; 
const OFFSET_X = -0.16;
const OFFSET_Z = 2.05;
let currentGridPos = { x: 2, z: 3 };

// CAMERA CENTER
const centroX = OFFSET_X + (2.5 * GRID_SIZE);
const centroZ = OFFSET_Z - (3 * 0.65);

init();
animate();

async function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    
    // CAMERA ZOOM 
    camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(centroX, 10, centroZ); 
    
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(centroX, 1, centroZ); 
    controls.update();

    // PLAYER
    player = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 32, 32),
        new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff0000, emissiveIntensity: 0.5 })
    );
    updatePlayerPosition();
    scene.add(player);

    // MESH OF POINTS
    const dotGeo = new THREE.SphereGeometry(0.02, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.6 });
    for (let x = 0; x < 6; x++) {
        for (let z = 0; z < 7; z++) {
            const dot = new THREE.Mesh(dotGeo, dotMat);
            dot.position.set(OFFSET_X + x * GRID_SIZE, 1.22, OFFSET_Z - z * 0.65);
            scene.add(dot);
        }
    }

    // 3D ROOM
    new GLTFLoader().load('./Sala3D.glb', (gltf) => {
        scene.add(gltf.scene);
        const floorGeo = new THREE.PlaneGeometry(20, 20);
        floorGeo.rotateX(-Math.PI / 2);
        floorPlane = new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial({ visible: false }));
        scene.add(floorPlane);
    });

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    // AUDIO AND DEMO 
    await preloadAllIRs();
    await loadDemoAudio(); 

    
    const slider = document.getElementById('mixSlider');
    if(slider) slider.value = 1;

    // EVENTS
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('resize', onResize);
    document.getElementById('audioInput').addEventListener('change', handleFileUpload);
    document.getElementById('playButton').addEventListener('click', toggleAudio);

    if(slider) {
        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (activeWetChain) activeWetChain.gainNode.gain.setTargetAtTime(val, audioCtx.currentTime, 0.05);
        });
    }

    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentMode = e.target.id.replace('btn-', ''); 
            console.log("Modo cambiado a:", currentMode);
            
            updateConvolver(); 
    })})
        
    
    
};

// CHARGE DEMO AND PUT THE AUDIO PLAYING 
async function loadDemoAudio() {
    try {
        const response = await fetch('Audio/orgue.wav');
        const arrayBuffer = await response.arrayBuffer();
        userAudioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
        const demoId = 'demo-auto';
        audioLibrary.push({ id: demoId, name: 'Orgue (Demo)', data: arrayBuffer });
        selectedAudioId = demoId;
        renderAudioList();

       
        const startAudioOnInteraction = async () => {
            if (autoPlayStarted) return;
            autoPlayStarted = true;
            if (audioCtx.state === 'suspended') await audioCtx.resume();
            if (!isPlaying) toggleAudio();
            
            window.removeEventListener('click', startAudioOnInteraction);
            window.removeEventListener('pointerdown', startAudioOnInteraction);
        };

        window.addEventListener('click', startAudioOnInteraction);
        window.addEventListener('pointerdown', startAudioOnInteraction);

    } catch (e) {
        console.error("Error cargando orgue.wav:", e);
    }
}

async function preloadAllIRs() {
    const total = 42; let loaded = 0;
    const progressEl = document.getElementById('load-progress');
    const promises = [];
    for (let f = 1; f <= 6; f++) {
        for (let a = 1; a <= 7; a++) {
            const label = `${f}F-${a}A`;
            const p = fetch(`IRs/MONO/${label}.wav`).then(r => r.arrayBuffer())
                .then(ab => audioCtx.decodeAudioData(ab))
                .then(buf => {
                    irBuffers[label] = buf;
                    loaded++;
                    if(progressEl) progressEl.innerText = `${Math.round((loaded/total)*100)}%`;
                }).catch(() => loaded++);
            promises.push(p);
        }
    }
    await Promise.all(promises);
    const overlay = document.getElementById('loading-overlay');
    if(overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 800);
    }
}


function ensureStereo(buffer) {

    if (!buffer) return null;
    if (buffer.numberOfChannels >= 2) return buffer;
        
    const stereoBuffer = audioCtx.createBuffer(2, buffer.length, buffer.sampleRate);
    const monoData = buffer.getChannelData(0);
    
    stereoBuffer.copyToChannel(monoData, 0); 
    stereoBuffer.copyToChannel(monoData, 1);
    return stereoBuffer;
}


async function createPseudoBRIR(monoBuffer, x, z) {
   
    const relX = x - 2.5; 
    const relZ = z - 3;
    let angle = Math.atan2(relX, relZ) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    
    const availableAngles = [0, 30, 60, 90, 120, 150, 180]; 
    const closestAngle = availableAngles.reduce((prev, curr) => 
        Math.abs(curr - (angle % 180)) < Math.abs(prev - (angle % 180)) ? curr : prev
    );

    try {
        const hrtfRes = await fetch(`HRTF/${closestAngle}.wav`);
        const hrtfAb = await hrtfRes.arrayBuffer();
        const hrtfBuffer = await audioCtx.decodeAudioData(hrtfAb);

        
        const offlineCtx = new OfflineAudioContext(2, monoBuffer.length + hrtfBuffer.length, monoBuffer.sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = monoBuffer;

        const convolver = offlineCtx.createConvolver();
        convolver.buffer = hrtfBuffer;

        source.connect(convolver);
        convolver.connect(offlineCtx.destination);
        source.start();

        return await offlineCtx.startRendering();
    } catch (e) {
        console.warn("ERROR PSEUDO-BRIR", e);
        return ensureStereo(monoBuffer);
    }
}

async function updateConvolver() {
    if (!isPlaying || !sourceNode) return;
    
    const label = `${currentGridPos.x + 1}F-${currentGridPos.z + 1}A`;
    let rawBuffer = irBuffers[label];
    if (!rawBuffer) return;

    let finalBuffer;
    let modeBoost = 1.0; 

    if (currentMode === "pseudo") {
        finalBuffer = await createPseudoBRIR(rawBuffer, currentGridPos.x, currentGridPos.z);
        modeBoost = 6.5; 
    } else {
        finalBuffer = ensureStereo(rawBuffer);
        modeBoost = 2.5; 
    }

    const now = audioCtx.currentTime;
    
    
    const userMix = parseFloat(document.getElementById('mixSlider').value);
    const finalGainValue = userMix * modeBoost;

    const nextWetGain = audioCtx.createGain();
    const nextConv = audioCtx.createConvolver();
    
    nextConv.buffer = finalBuffer;
    nextWetGain.gain.setValueAtTime(0, now);

    sourceNode.connect(nextConv);
    nextConv.connect(nextWetGain);
    nextWetGain.connect(masterGain);

    
    nextWetGain.gain.linearRampToValueAtTime(finalGainValue, now + FADE_TIME);

    if (activeWetChain) {
        const oldG = activeWetChain.gainNode;
        const oldC = activeWetChain.convNode;
        oldG.gain.linearRampToValueAtTime(0, now + FADE_TIME);
        setTimeout(() => { 
            oldC.disconnect(); 
            oldG.disconnect(); 
        }, FADE_TIME * 1000);
    }
    activeWetChain = { convNode: nextConv, gainNode: nextWetGain };
}

async function toggleAudio() {
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    if (!isPlaying) {
        if (!userAudioBuffer) return;
        masterGain = audioCtx.createGain();
        masterGain.connect(audioCtx.destination);
        sourceNode = audioCtx.createBufferSource();
        sourceNode.buffer = userAudioBuffer;
        sourceNode.loop = true;
        sourceNode.start();
        isPlaying = true;
        updateConvolver();
        const btn = document.getElementById('playButton');
        if(btn) { btn.textContent = "STOP AUDIO"; btn.classList.add("playing"); }
    } else {
        stopAudio();
    }
}

function stopAudio() {
    if (sourceNode) { try { sourceNode.stop(); } catch(e) {} sourceNode.disconnect(); sourceNode = null; }
    if (activeWetChain) { activeWetChain.gainNode.disconnect(); activeWetChain.convNode.disconnect(); activeWetChain = null; }
    if (masterGain) { masterGain.disconnect(); masterGain = null; }
    isPlaying = false;
    const btn = document.getElementById('playButton');
    if(btn) { btn.textContent = "PLAY AUDIO"; btn.classList.remove("playing"); }
}

function updatePlayerPosition() {
    player.position.x = OFFSET_X + currentGridPos.x * GRID_SIZE;
    player.position.y = 1.22; 
    player.position.z = OFFSET_Z - currentGridPos.z * 0.65;
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    audioLibrary.push({ id: Date.now(), name: file.name, data: buffer });
    renderAudioList();
    e.target.value = "";
}

function renderAudioList() {
    const container = document.getElementById("audioList");
    if(!container) return;
    container.innerHTML = "";
    audioLibrary.forEach(audio => {
        const div = document.createElement("div");
        div.className = `audio-item ${selectedAudioId === audio.id ? 'active' : ''}`;
        div.innerHTML = `<span class="audio-name">${audio.name}</span><button class="delete-btn">✕</button>`;
        div.querySelector('.audio-name').onclick = () => selectAudio(audio);
        div.querySelector('.delete-btn').onclick = (e) => { e.stopPropagation(); deleteAudio(audio.id); };
        container.appendChild(div);
    });
}

async function selectAudio(audio) {
    if (selectedAudioId === audio.id) {
        stopAudio(); selectedAudioId = null; userAudioBuffer = null;
    } else {
        stopAudio();
        selectedAudioId = audio.id;
        userAudioBuffer = await audioCtx.decodeAudioData(audio.data.slice(0));
    }
    renderAudioList();
}

function deleteAudio(id) {
    if (selectedAudioId === id) { stopAudio(); selectedAudioId = null; userAudioBuffer = null; }
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
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.22);
    const target = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, target)) {
        let gx = Math.round((target.x - OFFSET_X) / GRID_SIZE);
        let gz = Math.round((OFFSET_Z - target.z) / 0.65);
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