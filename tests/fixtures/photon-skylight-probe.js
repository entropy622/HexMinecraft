import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { SkyAtmosphere } from '../../src/sky-atmosphere.js';
import { applySkylight } from '../../src/skylight.js';
import {
  hostCoefficients,
  sampleSkyMap,
  sourceSkyProject,
  sourceSkyIrradiance,
} from './photon-skylight-oracle.js';

export async function probePhotonSkylight(g) {
  const r = g.renderer,
    previous = r.getRenderTarget(),
    a = new SkyAtmosphere(),
    quad = new FullScreenQuad(),
    fields = [];
  const material = new THREE.ShaderMaterial({
    uniforms: { field: { value: null } },
    vertexShader:
      'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0,1);}',
    fragmentShader:
      'uniform sampler2D field;varying vec2 vUv;void main(){gl_FragColor=texture2D(field,vUv);}',
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const output = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
    }),
    pixels = new Uint16Array(4),
    scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10),
    geometry = new THREE.PlaneGeometry(2, 2),
    surface = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      toneMapped: false,
    });
  for (const [name, size] of [
    ['skylight', 1],
    ['rainExposure', 1],
    ['surfacePorosity', 1],
    ['blocklight', 3],
  ])
    geometry.setAttribute(
      name,
      new THREE.Float32BufferAttribute(new Float32Array(4 * size), size),
    );
  applySkylight(surface, {
    ...g.dynamicLight.uniforms,
    terrainWetness: { value: 0 },
  });
  camera.position.z = 2;
  scene.add(new THREE.Mesh(geometry, surface), a.probe);
  let input = null;
  try {
    a.allocate(r, 1.7);
    a.work.skySunDirection.value.set(0, 1, 0);
    for (const mode of ['upper', 'lower-changed', 'directional', 'hdr']) {
      const width = a.targets[1].width,
        height = a.targets[1].height,
        data = new Uint16Array(width * height * 4);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const v = ((y + 0.5) / height) * 2 - 1,
            elevation = (Math.sign(v) * v * v * Math.PI) / 2,
            phi = ((x + 0.5) / width - 0.5) * Math.PI * 2,
            d = [
              Math.cos(phi) * Math.cos(elevation),
              Math.sin(elevation),
              Math.sin(phi) * Math.cos(elevation),
            ];
          let rgb = [0.18, 0.5, 1];
          if (mode === 'hdr') rgb = [16, 4, 2];
          if (mode === 'directional')
            rgb = rgb.map(
              (v, c) =>
                v +
                0.08 * d[0] +
                0.06 * d[1] +
                0.12 * d[0] * d[2] +
                0.05 * (c + 1) * (d[0] * d[0] - d[1] * d[1]),
            );
          if (d[1] < 0)
            rgb = mode === 'lower-changed' ? [0, 12, 30] : [8, 0, 0];
          data.set(
            [...rgb, 1].map(THREE.DataUtils.toHalfFloat),
            (y * width + x) * 4,
          );
        }
      input = new THREE.DataTexture(
        data,
        width,
        height,
        THREE.RGBAFormat,
        THREE.HalfFloatType,
      );
      input.minFilter = input.magFilter = THREE.NearestFilter;
      input.needsUpdate = true;
      material.uniforms.field.value = input;
      quad.material = material;
      r.setRenderTarget(a.targets[1]);
      quad.render(r);
      r.setRenderTarget(previous);
      const actualPixels = new Uint16Array(data.length);
      r.readRenderTargetPixels(a.targets[1], 0, 0, width, height, actualPixels);
      const radiance = Array.from(actualPixels, THREE.DataUtils.fromHalfFloat),
        source = sourceSkyProject((d) =>
          sampleSkyMap(radiance, width, height, d),
        );
      await a.project(r);
      const samples = [];
      for (const normal of [
        [0, 1, 0],
        [0, -1, 0],
        [1, 0, 0],
        [-1, 0, 0],
        [0, 0, 1],
        [0, 0, -1],
        [Math.SQRT1_2, Math.SQRT1_2, 0],
      ])
        for (const gate of [0, 1]) {
          for (let i = 0; i < 4; i++) {
            geometry.attributes.normal.setXYZ(i, ...normal);
            geometry.attributes.skylight.setX(i, gate);
          }
          geometry.attributes.normal.needsUpdate =
            geometry.attributes.skylight.needsUpdate = true;
          r.setRenderTarget(output);
          r.render(scene, camera);
          r.readRenderTargetPixels(output, 0, 0, 1, 1, pixels);
          const expected = sourceSkyIrradiance(source, normal).map(
            (v) => (0.025 + gate * Math.max(0, v)) / Math.PI,
          );
          samples.push({
            normal,
            gate,
            actual: Array.from(pixels, THREE.DataUtils.fromHalfFloat).slice(
              0,
              3,
            ),
            expected,
          });
        }
      fields.push({
        mode,
        coefficients: a.probe.sh.toArray(),
        expected: hostCoefficients(source),
        samples,
      });
      input.dispose();
      input = null;
    }
    return {
      fields,
      gl: r.getContext().getError(),
      targets: a.targets.map((t) => [t.width, t.height]),
    };
  } finally {
    r.setRenderTarget(previous);
    input?.dispose();
    a.dispose();
    material.dispose();
    output.dispose();
    geometry.dispose();
    surface.dispose();
    quad.dispose();
  }
}

const legacy = /* glsl */ `
float legacySkyBasis(int index,vec3 d){
 if(index==0)return .282094792;if(index==1)return .488602512*d.y;if(index==2)return .488602512*d.z;if(index==3)return .488602512*d.x;
 if(index==4)return 1.092548431*d.x*d.y;if(index==5)return 1.092548431*d.y*d.z;if(index==6)return .315391565*(3.0*d.z*d.z-1.0);if(index==7)return 1.092548431*d.x*d.z;return .546274215*(d.x*d.x-d.y*d.y);
}
vec3 legacySkyProject(int band,sampler2D map){vec3 result=vec3(0);for(int i=0;i<512;i++){float y=1.0-2.0*(float(i/32)+.5)/16.0,phi=(float(i-(i/32)*32)+.5)*(2.0*SKY_PI/32.0);vec3 d=vec3(cos(phi)*sqrt(1.0-y*y),y,sin(phi)*sqrt(1.0-y*y));result+=textureLod(map,skyUv(d),0.0).rgb*legacySkyBasis(band,d)*(4.0*SKY_PI/512.0)*photonSkylightBoost();}return result;}
`;
export async function setSkylightControl(g, enabled) {
  const a = g.skyEnvironment.atmosphere;
  await a.pending;
  a.reduction.userData.sourceFragment ??= a.reduction.fragmentShader;
  const original = a.reduction.userData.sourceFragment;
  a.reduction.fragmentShader = enabled
    ? original
    : original
        .replace('void main() {', legacy + '\nvoid main() {')
        .replace(
          'result=photonSkyProject(index,skyRadianceMap);',
          'result=legacySkyProject(index,skyRadianceMap);',
        );
  a.reduction.needsUpdate = true;
  a.key = null;
  a.updated = null;
}
