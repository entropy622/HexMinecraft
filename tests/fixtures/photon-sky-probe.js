import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export function probePhotonSky(graphics, groups) {
  const a = graphics.skyEnvironment.atmosphere,
    r = graphics.renderer,
    original = a.scatter,
    previous = r.getRenderTarget(),
    output = [],
    target = new THREE.WebGLRenderTarget(groups[0].views.length, 1, {
      type: THREE.FloatType,
      depthBuffer: false,
    }),
    directions = new THREE.DataTexture(
      new Float32Array(groups[0].views.length * 4),
      groups[0].views.length,
      1,
      THREE.RGBAFormat,
      THREE.FloatType,
    ),
    mode = { value: 0 },
    material = new THREE.ShaderMaterial({
      vertexShader: original.vertexShader,
      fragmentShader: original.fragmentShader
        .replace(
          'void main() {',
          `
        uniform sampler2D probeDirections; uniform int probeMode; uniform float probeHeight;
        void main() {`,
        )
        .replace(
          'gl_FragColor = vec4(photonSkyRadiance(skyDirection(vUv)),1.0);',
          `
          vec3 d=normalize(texture2D(probeDirections,vUv).xyz);
          vec3 su=photonScatteringUv(clamp(dot(d,skySunDirection),-1.0,1.0),d.y,skySunDirection.y);
          vec3 mu=photonScatteringUv(clamp(dot(d,-skySunDirection),-1.0,1.0),d.y,-skySunDirection.y);
          vec3 value=photonSkyRadiance(d);
          if(probeMode==0)value=su;
          if(probeMode==1)value=mu;
          if(probeMode==2)value=textureLod(skyMultipleScatteringMap,vec3(su.x*0.5,su.yz),0.0).rgb;
          if(probeMode==3)value=textureLod(skyMultipleScatteringMap,vec3(su.x*0.5+0.5,su.yz),0.0).rgb;
          if(probeMode==5)value=photonDirectLight();
          if(probeMode==6)value=vec3(photonSunExposure(),photonMoonExposure(),photonSkylightBoost());
          if(probeMode==7)value=photonAtmosphereTransmittance(d.y,SKY_RADIUS+probeHeight);
          if(probeMode==8)value=photonSunColor();
          if(probeMode==9)value=photonMoonColor();
          gl_FragColor=vec4(value,1.0);`,
        ),
      uniforms: {
        ...a.work,
        skySunDirection: { value: new THREE.Vector3() },
        skyMoonIllumination: { value: 1 },
        skyMoonPhase: { value: 0 },
        skyAerosol: { value: 1 },
        probeDirections: { value: directions },
        probeMode: mode,
        probeHeight: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
    quad = new FullScreenQuad(material);
  if (!material.fragmentShader.includes('vec3 d=normalize'))
    throw new Error('Production sky probe injection failed');
  try {
    for (const group of groups) {
      group.views.forEach((v, i) =>
        directions.image.data.set([...v, 1], i * 4),
      );
      directions.needsUpdate = true;
      material.uniforms.skySunDirection.value.fromArray(group.sun);
      material.uniforms.skyAerosol.value = 1 + 5 * group.rain;
      material.uniforms.skyMoonIllumination.value = group.moon;
      material.uniforms.skyMoonPhase.value = group.phase;
      material.uniforms.probeHeight.value = group.height;
      const maps = [];
      for (mode.value = 0; mode.value < 10; mode.value++) {
        r.setRenderTarget(target);
        quad.render(r);
        const pixels = new Float32Array(group.views.length * 4);
        r.readRenderTargetPixels(target, 0, 0, group.views.length, 1, pixels);
        maps.push(
          Array.from({ length: group.views.length }, (_, i) =>
            Array.from(pixels.slice(i * 4, i * 4 + 3)),
          ),
        );
      }
      output.push({
        sunUv: maps[0],
        moonUv: maps[1],
        rayleighMultiple: maps[2],
        mie: maps[3],
        radiance: maps[4],
        direct: maps[5],
        exposures: maps[6],
        transmission: maps[7],
        sunColor: maps[8],
        moonColor: maps[9],
      });
    }
    return {
      groups: output,
      gl: r.getContext().getError(),
      texture: {
        width: a.multipleScattering.image.width,
        height: a.multipleScattering.image.height,
        depth: a.multipleScattering.image.depth,
        bytes: a.multipleScattering.image.data.byteLength,
      },
    };
  } finally {
    r.setRenderTarget(previous);
    target.dispose();
    directions.dispose();
    material.dispose();
    quad.dispose();
  }
}
