import { Color } from 'three';

// Analytical ripples and sky reflection; no extra scene pass or displaced collision surface.
export function shadeWater(material) {
  const uniforms = {
    waterTime: { value: 0 },
    waterSky: { value: new Color('#79b6ee') },
    waterHorizon: { value: new Color('#c2dbee') },
  };
  material.shininess = 110;
  material.specular.set('#a3d3e6');
  const lightShader = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    lightShader(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      `varying vec3 waterPosition; varying float waterTop;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        waterPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        waterTop = max(0.0, normal.y);`,
      );
    shader.fragmentShader =
      `uniform float waterTime; uniform vec3 waterSky; uniform vec3 waterHorizon;
      varying vec3 waterPosition; varying float waterTop;\n${shader.fragmentShader}`
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
        vec2 wave = vec2(cos(waterPosition.x * 2.7 + waterPosition.z * 1.3 + waterTime * 1.5),
          sin(waterPosition.z * 3.1 - waterPosition.x * 0.8 + waterTime * 1.1));
        normal = normalize(normal + (viewMatrix * vec4(wave.x * 0.10, 0.0, wave.y * 0.10, 0.0)).xyz * waterTop);`,
        )
        .replace(
          '#include <opaque_fragment>',
          `
        float fresnel = 0.03 + 0.52 * pow(1.0 - max(0.0, dot(normal, normalize(vViewPosition))), 4.0);
        vec3 viewDirection = normalize(cameraPosition - waterPosition);
        vec3 reflectedSky = mix(waterHorizon, waterSky, clamp(viewDirection.y, 0.0, 1.0));
        outgoingLight = mix(outgoingLight, reflectedSky * vSkylight, fresnel * waterTop * vSkylight);
        diffuseColor.a = min(0.94, diffuseColor.a + fresnel * waterTop);
        #include <opaque_fragment>`,
        );
  };
  material.customProgramCacheKey = () => 'hex-water-voxel-v2';
  return uniforms;
}
