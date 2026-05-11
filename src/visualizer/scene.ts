import * as THREE from 'three';

export function createScene(): {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
} {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x87ceeb, 50, 200);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    500
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
  const skyTex = loader.load('/textures/sky_panorama.jpg');
  skyTex.mapping = THREE.EquirectangularReflectionMapping;
  const skyGeo = new THREE.SphereGeometry(300, 32, 16);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Ground plane
  const grassTex1 = loader.load('/textures/ground_grass.jpg');
  grassTex1.wrapS = grassTex1.wrapT = THREE.RepeatWrapping;
  grassTex1.repeat.set(40, 40);
  const grassTex2 = loader.load('/textures/ground_grass2.jpg');
  grassTex2.wrapS = grassTex2.wrapT = THREE.RepeatWrapping;
  grassTex2.repeat.set(17, 17);

  const groundGeo = new THREE.PlaneGeometry(400, 400);
  const groundMat = new THREE.MeshStandardMaterial({
    map: grassTex1,
    roughness: 0.95,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Resize handler
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer };
}
