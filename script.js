import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// GLOBAL VARIABLES
let camera, scene, renderer, controls;
let player, floorPlane, raycaster, pointer;

let isDragging = false;
let autoPlayStarted = false;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

let sourceNode = null;
let userAudioBuffer = null;

let isPlaying = false;

let selectedAudioId = null;
let audioLibrary = [];

let convolverUpdatePending = false;

let currentMode = 'mono';

let demoAudioBuffer = null;
let demoAudioData = null;

let masterGain = null;
let activeWetChain = null;

const irBuffersMono = {};
const irBuffersStereo = {};
const irBuffersBinaural = {};

const pseudoBRIRCache = {};
const hrtfBuffers = {};

const FADE_TIME = 0.75;

const GRID_SIZE = 0.7;

const OFFSET_X = 0.5;
const OFFSET_Z = 1.55;

let currentGridPos = { x: 2, z: 2 };

const centroX = OFFSET_X + (2 * GRID_SIZE);
const centroZ = OFFSET_Z - (2 * GRID_SIZE);

const gridDots = [];
let pseudoCentralBRIR = null;

init();
animate();

async function init() {
    //SCENE
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

    // CAMERA
    camera = new THREE.PerspectiveCamera( 25, window.innerWidth / window.innerHeight, 0.1, 1000 );
    camera.position.set(centroX + 3, 10, centroZ );
    // LIGHT
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));

    // RENDERER
    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // CONTROLS
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(centroX,5,centroZ);
    controls.update();

    //RED SPHERE
    player = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 32), new THREE.MeshStandardMaterial({color: 0xff4444, emissive: 0xff0000, emissiveIntensity: 0.5 }));
    //POSITION PLAYER
    updatePlayerPosition();

    scene.add(player);
    //GRID VISUALATION
    const dotGeo = new THREE.SphereGeometry(0.02, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({color: 0x444444,transparent: true,opacity: 0.6});

    for (let x = 0; x < 5; x++) {

        for (let z = 0; z < 5; z++) {

            const dot = new THREE.Mesh(dotGeo, dotMat);

            dot.position.set(OFFSET_X + x * GRID_SIZE, 1.22, OFFSET_Z - z * GRID_SIZE );
            scene.add(dot);
            gridDots.push(dot);
        }
    }
    //3D ROOM LOADING
    new GLTFLoader().load('./Sala3D.glb', (gltf) => { scene.add(gltf.scene);

            const floorGeo = new THREE.PlaneGeometry(20, 20);

            floorGeo.rotateX(-Math.PI / 2);

            floorPlane = new THREE.Mesh( floorGeo, new THREE.MeshBasicMaterial({ visible: false }));
            scene.add(floorPlane);
        }
    );

//RAYCASTER
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    
    //AUDIO PRELOADING
    await preloadIR();
    await preloadHRTFs();
    pseudoCentralBRIR = await buildPseudoBRIR(); //BUILD PSEUDO-BRIR
    await loadDemoAudio(); //LOAD DEMO AUDIO

    //MIX SLIDER
    const slider = document.getElementById('mixSlider');

    if (slider) {

        slider.value = 1;

        slider.addEventListener('input', (e) => {

            const val = parseFloat(e.target.value);

            if (activeWetChain) { activeWetChain.gainNode.gain .setTargetAtTime( val, audioCtx.currentTime, 0.05 );}
        });
    }
//EVENT LISTENERS
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    window.addEventListener('resize', onResize);
//UPLOAD INPUT
    document
        .getElementById('audioInput')
        .addEventListener('change', handleFileUpload);
//PLAY / STOP 
    document
        .getElementById('playButton')
        .addEventListener('click', toggleAudio);
//MODE BUTTONS
    document
        .querySelectorAll('.mode-btn')
        .forEach(btn => {

            btn.addEventListener('click',
                async (e) => {
                    document
                        .querySelectorAll('.mode-btn')
                        .forEach(b =>
                            b.classList.remove('active')
                        );
                    e.target.classList.add('active');

                    currentMode = e.target.id.replace('btn-', '');
                    setPseudoView(currentMode === 'pseudo');
                    if (currentMode === 'pseudo') {
                        currentGridPos = { x: 2, z: 2 };
                            updatePlayerPosition();
                            if (isPlaying) {
                                updateConvolver();
                            }
                        }
                    console.log("Modo:", currentMode);

                    if (isPlaying) {
                        stopAudio();
                        await toggleAudio();
                    }
                }
            );
        });
}

function setPseudoView(enabled){
    // grid
    gridDots.forEach(dot => {dot.visible = !enabled;});
}

//DEMO AUDIO
async function loadDemoAudio() {

    try {

        const response = await fetch('Audio/Demo-ogan-Praeludium in a minor BWV 543 (Stereo).wav');

        const arrayBuffer = await response.arrayBuffer();

        demoAudioData = arrayBuffer;

        demoAudioBuffer = await audioCtx.decodeAudioData( arrayBuffer.slice(0));

        userAudioBuffer = demoAudioBuffer;

        const demoId = 'demo-auto';

        audioLibrary.push({id: demoId, name: 'Orgue (Demo)', data: arrayBuffer });

        selectedAudioId = demoId;

        renderAudioList();

        const startAudioOnInteraction =
            async () => {
                if (autoPlayStarted) return;
                autoPlayStarted = true;
                if ( audioCtx.state === 'suspended') {
                    await audioCtx.resume();
                }
                if (!isPlaying) { toggleAudio(); }
                window.removeEventListener('click', startAudioOnInteraction);
                window.removeEventListener('pointerdown',startAudioOnInteraction);
            };

        window.addEventListener('click', startAudioOnInteraction);

        window.addEventListener('pointerdown', startAudioOnInteraction);

    } catch(e) {

        console.error("Error cargando demo:", e );
    }
}

//TAKE ALL THE IR
async function setIR(folder, mode, buffers) {

    const total = 25;
    let loaded = 0;

    const progressEl = document.getElementById('load-progress');

    const promises = [];

    for (let f = 1; f <= 5; f++) {

        for (let a = 1; a <= 5; a++) {
            const label = `${f}F-${a}A`;
            const p = fetch(`${folder}/${mode}-${label}.wav`)
            .then(r => r.arrayBuffer())
            .then(ab =>
                audioCtx.decodeAudioData(ab)
            )
            .then(buf => {
                buffers[label] = buf;
                loaded++;
                if (progressEl) {progressEl.innerText = `${Math.round((loaded / total) * 100)}%`;}
            })

            .catch((e) => {
                console.warn("Error IR:", label, e);
                loaded++;
            });

            promises.push(p);
        }
    }

    await Promise.all(promises);

    const overlay =
    document.getElementById('loading-overlay');

    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
            const modal = document.getElementById('welcomeModal');
            if (modal) {
                modal.style.display = 'flex';
            }

        }, 800);
    }
}

//TAKE ALL THE IR AND PUT TO EACH BUFFER
async function preloadIR() {

    await setIR("IRs/MONO-REAPER", "IR_MONO", irBuffersMono);

    await setIR("IRs/STEREO-REAPER","IR_STEREO",irBuffersStereo);

    await setIR("IRs/BINAURAL-REAPER","IR_BIN",irBuffersBinaural);
}


// LOAD HRTFs
async function preloadHRTFs() {

    const angles = [0, 30, 45, 60, 90, 120, 135, 150, 180];

    for (const angle of angles) {
        try {
            const response = await fetch(`HRTF/${angle}.wav`);

            const ab = await response.arrayBuffer();

            const buffer = await audioCtx.decodeAudioData(ab);

            hrtfBuffers[angle] = buffer;

            console.log("HRTF cargada:", angle );
        } catch(e) {
            console.warn("Error HRTF:", angle, e );
        }
    }
}

// PSEUDO BRIR ANGLES 
const pseudoNeighbours = [

    {x:1,z:1,angle:-45},
    {x:2,z:1,angle:0},
    {x:3,z:1,angle:45},

    {x:1,z:2,angle:-90},
    {x:3,z:2,angle:90},

    {x:1,z:3,angle:-135},
    {x:2,z:3,angle:180},
    {x:3,z:3,angle:135}
];

//Build full pseudo-BRIR dataset by combining IR + HRTF
async function buildPseudoBRIR() {
    const sampleRate = audioCtx.sampleRate;

    const renderedBuffers = [];

    for(const n of pseudoNeighbours)
    {
        const label = `${n.x + 1}F-${n.z + 1}A`;

        const roomIR = irBuffersMono[label];

        if(!roomIR) continue;

        const angle = n.angle;
        const brir = await generatePseudoBRIR( roomIR, angle );
        renderedBuffers.push(brir);
    }

    return sumBuffers(renderedBuffers);
}

//SUM BUFFERS 
function sumBuffers(buffers){
    if(buffers.length === 0) return null;

    const length =
        Math.max(...buffers.map(b => b.length));

    const out =
        audioCtx.createBuffer(2, length, audioCtx.sampleRate);

    const L = out.getChannelData(0);
    const R = out.getChannelData(1);

    buffers.forEach(buffer => {

        const bL = buffer.getChannelData(0);
        const bR = buffer.getChannelData(1);

        const gain = 1 / Math.sqrt(buffers.length);

        for (let i = 0; i < buffer.length; i++)
        {
            L[i] += bL[i] * gain;
            R[i] += bR[i] * gain;
        }
    });

    return out;
}

//PSEUDO BRIR 
async function generatePseudoBRIR(
    roomIR,
    angle
) {

    const availableAngles =
        [0, 30, 45, 60, 90, 120, 135, 150, 180];

    const closestAngle =
        availableAngles.reduce((prev, curr) =>
            Math.abs(curr - angle) <
            Math.abs(prev - angle)
                ? curr
                : prev
        );

    const hrtf = hrtfBuffers[closestAngle];

    if (!hrtf) {
        console.warn("HRTF no encontrada:",closestAngle);
        return roomIR;
    }

    const offlineCtx =new OfflineAudioContext( 2, roomIR.length + hrtf.length, roomIR.sampleRate );
    const source = offlineCtx.createBufferSource();
    source.buffer = roomIR;
    const convolver = offlineCtx.createConvolver();
    convolver.normalize = false;
    convolver.buffer = hrtf;
    source.connect(convolver);
    convolver.connect(offlineCtx.destination);
    source.start();
    const rendered = await offlineCtx.startRendering();
    return rendered;
}


// PLAYER POSITION
function updatePlayerPosition() {

    player.position.x = OFFSET_X + currentGridPos.x * GRID_SIZE;
    player.position.y = 1.22;
    player.position.z = OFFSET_Z - currentGridPos.z * GRID_SIZE;
}


// AUDIO ENGINE
async function updateConvolver() {

    if (!isPlaying ||!sourceNode ||!masterGain) {
        return;
    }
    const label =`${currentGridPos.x + 1}F-${currentGridPos.z + 1}A`;
    console.log( "Posición:", currentGridPos.x, currentGridPos.z, "IR:", label)

    let rawBuffer;

    if (currentMode === 'mono') {
        rawBuffer = irBuffersMono[label];
    }

    else if (currentMode === 'stereo') {

        rawBuffer = irBuffersStereo[label];
    }

    else if (currentMode === 'binaural') {

        rawBuffer = irBuffersBinaural[label];
    }

    else if (currentMode === 'pseudo') {
        const monoIR = irBuffersMono[label];
    if (!monoIR) return;

    // calculate azimut 
    const relX = currentGridPos.x - 2;
    const relZ = 2 - currentGridPos.z;

    let angle = Math.atan2(relX, relZ) * 180 / Math.PI;

    // normalize
    if (angle < 0) angle += 360;

    // take the HRTFs available
    const availableAngles = [0, 30, 45, 60, 90, 120, 135, 150, 180];

    const closestAngle = availableAngles.reduce((prev, curr) =>
        Math.abs(curr - angle) < Math.abs(prev - angle)
            ? curr
            : prev
    );

    const cacheKey = `${label}_${closestAngle}`;

    if (!pseudoBRIRCache[cacheKey]) {
        pseudoBRIRCache[cacheKey] = await generatePseudoBRIR(monoIR, closestAngle);
    }

    rawBuffer = pseudoBRIRCache[cacheKey];}
    if (!rawBuffer) {
        console.warn("IR no encontrada:", label, currentMode );
        return;
    }

    const now = audioCtx.currentTime;
    const userMix = parseFloat( document.getElementById('mixSlider').value || 1);
    const nextWetGain = audioCtx.createGain();
    const nextConv = audioCtx.createConvolver();
    nextConv.normalize = false;
    nextConv.buffer = rawBuffer;
    nextWetGain.gain.setValueAtTime(0,now);

    try {
        sourceNode.disconnect();
    
    } catch(e){}

    sourceNode.connect(nextConv);

    if (currentMode === 'mono') {

        const monoOutput = createMono(nextConv);
        monoOutput.connect(nextWetGain);

    } else {

        nextConv.connect(nextWetGain);
    }

    nextWetGain.connect(masterGain);

    nextWetGain.gain.linearRampToValueAtTime( userMix, now + FADE_TIME);


    if (activeWetChain) {
        const oldG = activeWetChain.gainNode;
        const oldC = activeWetChain.convNode;
        oldG.gain.linearRampToValueAtTime( 0, now + FADE_TIME);

        setTimeout(() => {
            try {
                oldC.disconnect();
                oldG.disconnect();

            } catch(e) {}

        }, FADE_TIME * 1000);
    }

    activeWetChain = {
        convNode: nextConv,
        gainNode: nextWetGain
    };
}

//AUDIO CONTROL PLAY / STOP 
async function toggleAudio() {

    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }

    if (!isPlaying) {
        if (!userAudioBuffer) return;

        masterGain = audioCtx.createGain();

        masterGain.connect( audioCtx.destination);
        sourceNode = audioCtx.createBufferSource();
        sourceNode.buffer = userAudioBuffer;
        sourceNode.loop = true;
        sourceNode.start();
        isPlaying = true;
        await updateConvolver();
        const btn = document.getElementById('playButton');
        if (btn) {
            btn.textContent = "STOP AUDIO";
            btn.classList.add("playing");
        }

    } else {
        stopAudio();
    }
}

//CREATE MONO TO CONVERT STEREO AUDIO TO MONO FOR MONO MODE
function createMono(convolverOutput) {

    const splitter = audioCtx.createChannelSplitter(2);
    const merger = audioCtx.createChannelMerger(2);
    const monoGain = audioCtx.createGain();

    monoGain.gain.value = 0.5;

    convolverOutput.connect(splitter);

    splitter.connect(monoGain, 0, 0);
    splitter.connect(monoGain, 1, 0);

    monoGain.connect(merger, 0, 0);
    monoGain.connect(merger, 0, 1);

    return merger;
}

// FUNTION TO STOP THE AUDIO 
function stopAudio() {

    if (sourceNode) {
        try {
            sourceNode.stop();
        } catch(e) {}
        sourceNode.disconnect();
        sourceNode = null;
    }

    if (activeWetChain) {
        try {
            activeWetChain.gainNode.disconnect();
            activeWetChain.convNode.disconnect();
        } catch(e) {}
        activeWetChain = null;
    }

    if (masterGain) {
        try {
            masterGain.disconnect();
        } catch(e) {}
        masterGain = null;
    }

    isPlaying = false;
    const btn = document.getElementById('playButton');
    
    if (btn) { btn.textContent ="PLAY AUDIO";
        btn.classList.remove("playing");
    }
}

//FILE UPLOAD 
async function handleFileUpload(e) {

    const file = e.target.files[0];

    if (!file) return;

    const buffer = await file.arrayBuffer();
    audioLibrary.push({id: Date.now(), name: file.name, data: buffer});

    renderAudioList();
    e.target.value = "";
}

//RENDER AUDIO LIST
function renderAudioList() {

    const container = document.getElementById( "audioList");

    if (!container) return;

    container.innerHTML = "";

    audioLibrary.forEach(audio => {

        const div = document.createElement("div");
        div.className = `audio-item ${selectedAudioId === audio.id ? 'active': ''}`;

        div.innerHTML =`<span class="audio-name"> ${audio.name}</span><button class="delete-btn">✕ </button>`;

        div.querySelector('.audio-name').onclick = () => selectAudio(audio);

        div.querySelector('.delete-btn').onclick = (e) => {e.stopPropagation(); deleteAudio(audio.id); };
        container.appendChild(div);
    });
}

//SELECT AUDIO OF THE LIST 
async function selectAudio(audio) {

    const wasPlaying = isPlaying;
    stopAudio();
    selectedAudioId = audio.id;
    userAudioBuffer = await audioCtx.decodeAudioData( audio.data.slice(0));
    renderAudioList();

    if (wasPlaying) {
        await toggleAudio();
    }
}

//DELETE AUDIO
function deleteAudio(id) {

    if (id === 'demo-auto') return;
    audioLibrary = audioLibrary.filter(a => a.id !== id);
    renderAudioList();
}

//USER- USE MOUSE DOWN
function onDown(e) {
    updatePointer(e);

    raycaster.setFromCamera(pointer, camera);

    if (raycaster.intersectObject(player).length > 0) {

        isDragging = true;
        controls.enabled = false;
    }
}

//USER - USE MOUSE
function onMove(e) {

    if(currentMode === 'pseudo'){
        return;
    }

    updatePointer(e);

    if (!isDragging) return;

    raycaster.setFromCamera(pointer, camera);

    const plane = new THREE.Plane( new THREE.Vector3(0, 1, 0), -1.22 );

    const target = new THREE.Vector3();

    if (raycaster.ray.intersectPlane( plane, target)) {

        let gx = Math.round((target.x - OFFSET_X)/ GRID_SIZE);

        let gz = Math.round((OFFSET_Z - target.z)/ GRID_SIZE);

        gx = Math.max(0, Math.min(4, gx));
        gz = Math.max(0, Math.min(4, gz));

        if (gx !== currentGridPos.x || gz !== currentGridPos.z ) {

            currentGridPos = {x: gx, z: gz};

            updatePlayerPosition();

            if (!convolverUpdatePending) {

                convolverUpdatePending = true;
            
                setTimeout(async () => { await updateConvolver(); convolverUpdatePending = false;}, 100);
            
            }
        }
    }
}

//USER - USE MOUSE 
function onUp() {

    isDragging = false;
    controls.enabled = true;
}

// WINDOW SIZE
function onResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight);
}

//POINTER NORMALIZATION 
function updatePointer(e) {

    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y =  -(e.clientY / window.innerHeight) * 2 + 1;
}

//ANIMATE - RENDER LOOP
function animate() {

    requestAnimationFrame(animate);

    controls.update();

    renderer.render(scene, camera);
}


//CLOSE WELCOME MODAL WHEN BUTTON IS CLICKED
document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("welcomeModal");
    const closeBtn = document.getElementById("closeModal");

    closeBtn.addEventListener("click", () => {
        modal.style.display = "none";
    });
});