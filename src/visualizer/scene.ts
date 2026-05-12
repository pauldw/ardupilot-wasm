import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { Terrain } from './terrain';
import { Environment } from './environment';

function createSplat(renderer: THREE.WebGLRenderer, targetScene: THREE.Scene, lodSplatCount?: number) {
  const spark = new SparkRenderer({
    renderer,
    sortRadial: false,
    blurAmount: 0.3,
    ...(lodSplatCount != null && { lodSplatCount }),
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

function createLights(targetScene: THREE.Scene): void {
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
  sunLight.position.set(50, 80, 30);
  targetScene.add(sunLight);

  const ambientLight = new THREE.AmbientLight(0x6688aa, 0.6);
  targetScene.add(ambientLight);

  const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x556633, 0.4);
  targetScene.add(hemisphereLight);
}

export function createScene(): {
  scene: THREE.Scene;
  pipScene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  terrain: Terrain;
  environment: Environment;
} {
  const scene = new THREE.Scene();

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
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 1);
  document.getElementById('canvas-container')!.appendChild(renderer.domElement);

  createLights(scene);
  createSplat(renderer, scene);

  // Separate PIP scene with its own splat sort order and lower LOD budget
  const pipScene = new THREE.Scene();
  createLights(pipScene);
  createSplat(renderer, pipScene, 500_000);

  const terrain = new Terrain(scene);
  terrain.setRenderer(renderer);
  const environment = new Environment(scene, terrain);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, pipScene, camera, renderer, terrain, environment };
}
