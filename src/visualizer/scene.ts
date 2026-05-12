import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { Terrain } from './terrain';
import { Environment } from './environment';

function createSplat(renderer: THREE.WebGLRenderer, targetScene: THREE.Scene) {
  const spark = new SparkRenderer({
    renderer,
    focalAdjustment: 2.0,
  });
  targetScene.add(spark);

  const splat = new SplatMesh({
    url: `${import.meta.env.BASE_URL}models/splat.sog`,
  });
  splat.rotation.x = Math.PI;
  splat.scale.setScalar(4);
  splat.position.y = -1.7;
  splat.frustumCulled = false;
  targetScene.add(splat);
}

function createSkyAndLights(targetScene: THREE.Scene): THREE.Mesh {
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
  sunLight.position.set(50, 80, 30);
  targetScene.add(sunLight);

  const ambientLight = new THREE.AmbientLight(0x6688aa, 0.6);
  targetScene.add(ambientLight);

  const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x556633, 0.4);
  targetScene.add(hemisphereLight);

  const loader = new THREE.TextureLoader();
  const skyTex = loader.load(`${import.meta.env.BASE_URL}textures/sky_panorama.jpg`);
  skyTex.mapping = THREE.EquirectangularReflectionMapping;
  const skyGeo = new THREE.SphereGeometry(4000, 32, 16);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  targetScene.add(sky);
  return sky;
}

export function createScene(): {
  scene: THREE.Scene;
  pipScene: THREE.Scene;
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

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.NoToneMapping;
  document.getElementById('canvas-container')!.appendChild(renderer.domElement);

  const sky = createSkyAndLights(scene);
  createSplat(renderer, scene);

  // Separate PIP scene with its own splat sort order
  const pipScene = new THREE.Scene();
  pipScene.fog = new THREE.Fog(0x87ceeb, 200, 2500);
  createSkyAndLights(pipScene);
  createSplat(renderer, pipScene);

  const terrain = new Terrain(scene);
  terrain.setRenderer(renderer);
  const environment = new Environment(scene, terrain);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, pipScene, camera, renderer, terrain, environment, sky };
}
