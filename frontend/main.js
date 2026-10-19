import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---------- Scene setup ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 5000);
camera.position.set(5, 5, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// Soft studio lighting, similar to Blender's material preview
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(10, 20, 10); 
scene.add(sun);

// ---------- Light on/off + brightness ----------
const ambient = scene.children.find((o) => o.isAmbientLight);
const BASE = { ambient: ambient.intensity, sun: sun.intensity, env: 1 };
const modelMaterials = [];   // filled when the model loads
let lightOn = true;
let brightness = 1;          // 1 = 100%

function applyLights() {
  const k = lightOn ? brightness : 0;
  ambient.intensity = BASE.ambient * k;
  sun.intensity = BASE.sun * k;
  modelMaterials.forEach((m) => { m.envMapIntensity = BASE.env * k; });
}

const toggleBtn = document.getElementById('light-toggle');

toggleBtn.addEventListener('click', () => {
  lightOn = !lightOn;
  toggleBtn.textContent = lightOn ? 'Room Light: ON' : 'Room Light: OFF';
  toggleBtn.classList.toggle('off', !lightOn);
  applyLights();
});

// ---------- Grow lights (the two light bars on the rack) ----------
const growLights = [];       // { material, light } filled when the model loads
let growOn = true;
let growBrightness = 1;      // 1 = 100%
const GROW_INTENSITY = 1.5;  // how strongly each bar lights the plants below

function applyGrowLights() {
  const k = growOn ? growBrightness : 0;
  growLights.forEach(({ material, light }) => {
    material.emissive.set(0xffffff);
    material.emissiveIntensity = k;
    light.intensity = GROW_INTENSITY * k;
  });
}

const growSlider = document.getElementById('grow-brightness');
const growLabel = document.getElementById('grow-value');
growSlider.addEventListener('input', () => {
  growBrightness = growSlider.value / 100;
  growLabel.textContent = growSlider.value;
  applyGrowLights();
});

const growBtn = document.getElementById('grow-toggle');

function setGrowLights(on) {
  growOn = on;
  growBtn.textContent = growOn ? 'Grow Lights: ON' : 'Grow Lights: OFF';
  growBtn.classList.toggle('off', !growOn);
  applyGrowLights();
}

// Actions from the IoT "result" part, e.g. { "status": "SUCCESS", "action": "LIGHTS_ON" }
const ACTIONS = {
  LIGHTS_ON: () => setGrowLights(true),
  LIGHTS_OFF: () => setGrowLights(false),
};

// Follow the real grow light: poll the latest IoT action result and
// apply it to the 3D model only when its status is SUCCESS.
let lastGrowMessageId = null;

async function syncGrowLightFromIoT() {
  try {
    const data = await (await fetch('/api/grow-light')).json();
    if (!data.message_id || data.message_id === lastGrowMessageId) return;  // nothing new
    lastGrowMessageId = data.message_id;

    if (data.status === 'SUCCESS' && ACTIONS[data.action]) {
      ACTIONS[data.action]();
    } else {
      console.warn('IoT action not applied:', data);
    }
  } catch (err) {
    console.error('Could not read grow light state:', err);
  }
}
syncGrowLightFromIoT();
setInterval(syncGrowLightFromIoT, 2000);

const controls = new OrbitControls(camera, renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- Load the model ----------
const MATERIAL_COLORS = {
  PGR_Wood_Raw: 0xc8955a,
  PGR_Aloe_Leaf: 0x4f9a4a,
  PGR_Seedling_Leaf: 0x6fc45a,
  PGR_Soil: 0x3b2a1e,
};

new GLTFLoader().load(
  encodeURI('/models/plant-growing rack.glb'),
  (gltf) => {
    const model = gltf.scene;
    scene.add(model);

    // Print object names to the console (to help find the names)
    const names = [];
    model.traverse((o) => {
      if (o.name) names.push(o.name);
      // Give every mesh its own material (so colors can be changed individually)
      if (o.isMesh) {
        o.material = o.material.clone();
        // The exported GLB has no color for these materials, so set them here
        const color = MATERIAL_COLORS[o.material.name];
        if (color !== undefined) o.material.color.set(color);
        modelMaterials.push(o.material);
      }
    });
    applyLights();

    // Make each grow light bar glow and shine down on the plants
    model.updateMatrixWorld(true);
    model.traverse((o) => {
      if (o.isMesh && /^Grow_Light_\d+_Housing$/.test(o.name)) {
        const b = new THREE.Box3().setFromObject(o);
        const light = new THREE.PointLight(0xffffff, GROW_INTENSITY);
        light.position.set((b.min.x + b.max.x) / 2, b.min.y - 0.05, (b.min.z + b.max.z) / 2);
        scene.add(light);
        growLights.push({ material: o.material, light });
      }
    });
    applyGrowLights();
    console.log('Object names in the model:', names);

    // Automatically frame the camera on the model
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    controls.target.copy(center);
    camera.position.set(center.x + size, center.y + size * 0.7, center.z + size);
    controls.update();

  },
  undefined,
  (err) => {
    console.error(err);
  }
);

// ---------- Backend data ----------
const statusEl = document.getElementById('status');

async function refreshStatus() {
  try {
    const data = await (await fetch('/api/status')).json();
    statusEl.innerHTML = Object.entries(data)
      .map(([name, value]) => `${name}: ${value}`)
      .join('<br>');
  } catch (err) {
    statusEl.textContent = 'Backend: offline';
  }
}
refreshStatus();
setInterval(refreshStatus, 2000);

// ---------- Render loop ----------
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});