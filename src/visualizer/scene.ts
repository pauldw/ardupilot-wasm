import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';

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
  targetScene.environment = skyTex;
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
  composer: EffectComposer;
  sky: THREE.Mesh;
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

  // FXAA post-processing (cheap screen-space AA for mesh edges)
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const fxaaPass = new ShaderPass(FXAAShader);
  const pixelRatio = renderer.getPixelRatio();
  fxaaPass.material.uniforms['resolution'].value.set(
    1 / (window.innerWidth * pixelRatio),
    1 / (window.innerHeight * pixelRatio),
  );
  composer.addPass(fxaaPass);

  const sky = createSkyAndLights(scene);
  createSplat(renderer, scene);

  // Separate PIP scene with its own splat sort order and lower LOD budget
  const pipScene = new THREE.Scene();
  createSkyAndLights(pipScene);
  createSplat(renderer, pipScene, 500_000);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    const pr = renderer.getPixelRatio();
    fxaaPass.material.uniforms['resolution'].value.set(
      1 / (window.innerWidth * pr),
      1 / (window.innerHeight * pr),
    );
  });

  return { scene, pipScene, camera, renderer, composer, sky };
}
