// HOTSPOTS
window.addEventListener("DOMContentLoaded", () => {

    const viewer = document.querySelector("#viewer");
  
    let index = 1;
  
    for (let x = 0; x < 6; x++) {
      for (let z = 0; z < 7; z++) {
  
        const btn = document.createElement("button");
  
        btn.className = "Hotspot";
        btn.slot = `hotspot-${index}`;
  
        const posX = -0.16 + x * 0.6;
        const posZ = 2.05 - z * 0.65;
  
        btn.setAttribute("data-position", `${posX}m 1.225m ${posZ}m`);
  
        const label = `${x + 1}F-${z + 1}A`;
        btn.innerHTML = `<div class="HotspotAnnotation">${label}</div>`;
  
        viewer.appendChild(btn);
  
        index++;
      }
    }
  
    // IR change - click 
    viewer.addEventListener("click", (event) => {
  
      const hotspot = event.target.closest(".Hotspot");
      if (!hotspot) return;
  
      const label = hotspot.innerText.trim();
  
      changeIR(label);
    });
  
  });

  let userAudioBuffer = null;

const fileInput = document.querySelector("#audioUpload");

fileInput.addEventListener("change", async (event) => {

  const file = event.target.files[0];
  if (!file) return;

  try {
    const arrayBuffer = await file.arrayBuffer();
    userAudioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    console.log("Audio cargado:", file.name);

  } catch (err) {
    alert("Error al cargar el audio");
  }
});
  
  
  // AUDIO ENGINE
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  let source = null;
  let convolver = null;
  let gainDirect = null;
  let gainReverb = null;
  let panner = null;
  let filter = null;
  
  let isPlaying = false;
  
  // LOADERS
  async function loadSound(url) {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    return await audioCtx.decodeAudioData(buffer);
  }
  
  async function loadIR(url) {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    return await audioCtx.decodeAudioData(buffer);
  }
  
  
  // PLAY
  async function playAudio() {

    if (!userAudioBuffer) {
      alert("Por favor, sube un audio primero");
      return;
    }
  
    const irBuffer = await loadIR("IRs/1F-1A.wav");
  
    source = audioCtx.createBufferSource();
    source.buffer = userAudioBuffer;
    source.loop = true;
  
    convolver = audioCtx.createConvolver();
    convolver.buffer = irBuffer;
  
    gainDirect = audioCtx.createGain();
    gainReverb = audioCtx.createGain();
    panner = audioCtx.createStereoPanner();
    filter = audioCtx.createBiquadFilter();
  
    filter.type = "lowpass";
  
    // valores iniciales
    gainDirect.gain.value = 0.7;
    gainReverb.gain.value = 0.3;
    panner.pan.value = 0;
    filter.frequency.value = 20000;
  
    // conexiones
    source.connect(gainDirect);
    source.connect(convolver);
  
    convolver.connect(gainReverb);
  
    gainDirect.connect(panner);
    gainReverb.connect(panner);
  
    panner.connect(filter);
    filter.connect(audioCtx.destination);
  
    source.start();
  
    isPlaying = true;
  
    console.log("▶️ PLAY con audio del usuario");
  }
  
  
  // STOP
  function stopAudio() {
  
    if (source) {
      source.stop();
      source.disconnect();
      source = null;
    }
  
    isPlaying = false;
  
    console.log("STOP");
  }
  
  
  // IR change 
  async function changeIR(label) {
  
    if (!convolver) return;
  
    try {
  
      const file = `IRs/${label}.wav`;
      const irBuffer = await loadIR(file);
  
      convolver.buffer = irBuffer;
  
      
      // Position
      const fila = parseInt(label.split("F")[0]);
      const asiento = parseInt(label.split("-")[1]);
  
      // PAN 
      const pan = ((asiento - 1) / 6) * 2 - 1;
      panner.pan.value = -pan * 0.3;
  
      
      // Distance 
      
      const distancia = fila;
  
      gainDirect.gain.value = 1.2 - distancia * 0.15;
      gainReverb.gain.value = 0.2 + distancia * 0.15;
  
      
      // filter
      filter.frequency.value = 20000 - distancia * 2500;
  
      
      // ajusts
      if (fila === 1) {
        gainDirect.gain.value += 0.2;
      }
  
      if (fila === 6) {
        gainReverb.gain.value += 0.2;
      }
  
      console.log(`${label} | pan: ${panner.pan.value}`);
  
    } catch (err) {
      console.error("Error cargando IR:", label, err);
    }
  }
  
  
  // Button play - stop 
  const button = document.querySelector("#playButton");
  
  button.addEventListener("click", async () => {
  
    await audioCtx.resume();
  
    if (!isPlaying) {
      await playAudio();
      button.textContent = "Stop";
    } else {
      stopAudio();
      button.textContent = "Play";
    }
  
  });