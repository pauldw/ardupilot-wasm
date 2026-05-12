import * as THREE from 'three';
import { Terrain } from './terrain';
import { Environment } from './environment';

export function createScene(): {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  terrain: Terrain;
  environment: Environment;
  sky: THREE.Mesh;
} {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x87ceeb, 200, 2500);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    5000
  );
  camera.position.set(-3, 2, 3);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.getElementById('canvas-container')!.appendChild(renderer.domElement);

  // Lighting
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
  sunLight.position.set(50, 80, 30);
  sunLight.castShadow = true;
  scene.add(sunLight);

  const ambientLight = new THREE.AmbientLight(0x6688aa, 0.6);
  scene.add(ambientLight);

  const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x556633, 0.4);
  scene.add(hemisphereLight);

  // Sky sphere
  const loader = new THREE.TextureLoader();
  const skyTex = loader.load(`${import.meta.env.BASE_URL}textures/sky_panorama.jpg`);
  skyTex.mapping = THREE.EquirectangularReflectionMapping;
  const skyGeo = new THREE.SphereGeometry(4000, 32, 16);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  const terrain = new Terrain(scene);
  terrain.setRenderer(renderer);
  const environment = new Environment(scene, terrain);

  // Resize handler
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, terrain, environment, sky };
}
