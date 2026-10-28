import * as THREE from 'three';
import { lightVolumeGLSL } from '../../src/light-volume-shader.js';

// Isolated GPU contract check. Vite resolves the same Three module as the app;
// the decoder and volume are production objects, never reimplemented in a fake.
export function readVolumeCells(graphics, cells) {
  const renderer = graphics.renderer,
    previous = renderer.getRenderTarget();
  const target = new THREE.WebGLRenderTarget(cells.length, 1, {
    depthBuffer: false,
  });
  const scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...graphics.dynamicLight.uniforms,
      probeCells: { value: cells.map((p) => new THREE.Vector3(...p)) },
    },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `${lightVolumeGLSL}\nuniform vec3 probeCells[${cells.length}];\nvoid main() { vec4 p = readLightCell(ivec3(probeCells[int(gl_FragCoord.x)])); gl_FragColor = vec4(p.rgb, floor(p.a / 16.0)) / 15.0; }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  try {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const bytes = new Uint8Array(cells.length * 4);
    renderer.readRenderTargetPixels(target, 0, 0, cells.length, 1, bytes);
    return cells.map((_, i) =>
      Array.from(bytes.slice(i * 4, i * 4 + 4), (n) => Math.round(n / 17)),
    );
  } finally {
    renderer.setRenderTarget(previous);
    geometry.dispose();
    material.dispose();
    target.dispose();
  }
}
