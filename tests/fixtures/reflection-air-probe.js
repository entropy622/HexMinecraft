import { FloatType, ShaderMaterial, WebGLRenderTarget } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { worldToAxial } from '../../src/core.js';

// Probe the real pass immediately after it draws, while its current-frame input
// is still valid. Only expose its actual ray hit/raw color/transported color.
export function probeReflectionAir(g) {
  const pass = g.composer.effects.wet,
    render = pass.render;
  return new Promise((resolve, reject) => {
    pass.render = function (...args) {
      render.apply(this, args);
      pass.render = render;
      const r = g.renderer,
        previous = r.getRenderTarget(),
        target = new WebGLRenderTarget(240, 180, {
          type: FloatType,
          depthBuffer: false,
        }),
        quad = new FullScreenQuad(),
        mode = { value: 0 };
      const source = pass.material;
      const fragment = source.fragmentShader
        .replace(
          '// HEX_REFLECTION_AIR_READY',
          `
        if(airProbeMode==1)return vec4(color.rgb,confidence*color.a);
        if(airProbeMode==2)return vec4(airOrigin,confidence*color.a);
        if(airProbeMode==3)return vec4(airHit,confidence*color.a);
        // HEX_REFLECTION_AIR_READY`,
        )
        .replace(
          'void main() {',
          `void main(){
        vec3 probePosition=wetViewPosition(vUv,texture2D(sceneDepth,vUv).r);
        vec3 probeView=normalize(-probePosition);
        vec3 probeNormal=normalize(mat3(wetView)*surfaceDecodeNormal(texture2D(surfaceGeometry,vUv).xy));
        if(dot(probeNormal,probeView)<0.0)probeNormal=-probeNormal;
        gl_FragColor=reflectedScene(probePosition+probeNormal*0.045,reflect(-probeView,probeNormal),environmentSteps,-1.0,0.5);return;
      `,
        );
      const material = new ShaderMaterial({
        uniforms: {
          ...source.uniforms,
          airProbeMode: mode,
          airDensity: { value: source.uniforms.airDensity.value },
          airCameraSky: { value: source.uniforms.airCameraSky.value },
        },
        vertexShader: source.vertexShader,
        fragmentShader: 'uniform int airProbeMode;\n' + fragment,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      quad.material = material;
      function read(n) {
        mode.value = n;
        r.setRenderTarget(target);
        quad.render(r);
        const data = new Float32Array(240 * 180 * 4);
        r.readRenderTargetPixels(target, 0, 0, 240, 180, data);
        return data;
      }
      try {
        const actual = read(0),
          raw = read(1),
          origin = read(2),
          end = read(3);
        material.uniforms.airDensity.value = 0;
        const bypass = read(0);
        material.uniforms.airDensity.value = source.uniforms.airDensity.value;
        material.uniforms.airCameraSky.value = 0;
        const dark = read(0);
        const u = source.uniforms,
          coeff = {
            rayleigh: u.airRayleigh.value.toArray(),
            mieExtinction: u.airMieExtinction.value,
            mieScattering: u.airMieScattering.value,
            base: [u.airRayleighBaseHeight.value, u.airBaseHeight.value],
            falloff: [u.airRayleighFalloff.value, u.airFalloff.value],
            skyMean: u.airSkyMean.value.toArray(),
            ambient: u.airAmbient.value,
            sunColor: u.airSunColor.value.toArray(),
            sunPower: u.airSunPower.value,
            sunDirection: u.airSunDirection.value.toArray(),
            sky: u.airCameraSky.value,
            direct: u.airDirectMultiplier.value,
            scatter: u.airScatterMultiplier.value,
          };
        const samples = [];
        let hits = 0;
        for (let i = 0; i < raw.length; i += 4) {
          if (raw[i + 3] < 0.1) continue;
          const delta = [0, 1, 2].map((c) => end[i + c] - origin[i + c]),
            length = Math.hypot(...delta),
            point = [0, 1, 2].map(
              (c) => end[i + c] + (delta[c] / length) * 0.005,
            ),
            cell = worldToAxial(point[0], point[2]),
            type = g.world.get(cell.q, Math.floor(point[1]), cell.r);
          if (!['redWool', 'blueWool'].includes(type)) continue;
          hits++;
          if (hits % 7 !== 0 || samples.length >= 512) continue;
          const take = (data) => Array.from(data.slice(i, i + 3));
          samples.push({
            type,
            origin: take(origin),
            end: take(end),
            raw: take(raw),
            actual: take(actual),
            bypass: take(bypass),
            dark: take(dark),
          });
        }
        resolve({ coeff, samples, hits, gl: r.getContext().getError() });
      } catch (error) {
        reject(error);
      } finally {
        r.setRenderTarget(previous);
        quad.dispose();
        material.dispose();
        target.dispose();
      }
    };
  });
}
