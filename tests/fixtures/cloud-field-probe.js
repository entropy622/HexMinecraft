import {
  ShaderMaterial,
  WebGLRenderTarget,
  HalfFloatType,
  Vector3,
  GLSL3,
  DataUtils,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { cloudFieldGLSL } from '../../src/cloud-field.js';

// Inspect the production GPU density/shadow field at positions recovered from
// actual cloud integration, without replacing the game's rendering pipeline.
export function probeCloudField(g, points = null) {
  if (!points) {
    const history = g.composer.passes[0].clouds.histories.get(
      g.composer.passes[0].target,
    ).history[0];
    const data = new Uint16Array(history.width * history.height * 4);
    g.renderer.readRenderTargetPixels(
      history,
      0,
      0,
      history.width,
      history.height,
      data,
      undefined,
      1,
    );
    points = [];
    for (let y = 2; y < history.height - 2 && points.length < 32; y += 7)
      for (let x = 2; x < history.width - 2 && points.length < 32; x += 7) {
        const i = (y * history.width + x) * 4,
          distance = DataUtils.fromHalfFloat(data[i]);
        if (!(distance > 0 && distance < 3000)) continue;
        const direction = new Vector3(
          ((x + 0.5) / history.width) * 2 - 1,
          ((y + 0.5) / history.height) * 2 - 1,
          1,
        )
          .unproject(g.camera)
          .sub(g.camera.position)
          .normalize();
        points.push(
          g.camera.position
            .clone()
            .addScaledVector(direction, distance)
            .toArray(),
        );
      }
  }
  if (points.length === 0)
    throw Error(
      'No actual integrated cloud positions for world anchoring probe',
    );
  const material = new ShaderMaterial({
    glslVersion: GLSL3,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      ...g.cloudSystem.uniforms,
      probePoints: { value: points.map((p) => new Vector3(...p)) },
    },
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: `${cloudFieldGLSL}
    uniform vec3 probePoints[${points.length}];
    layout(location=0) out vec4 value;
    void main(){
      vec3 p=probePoints[int(gl_FragCoord.x)];
      vec3 ground=vec3(p.x,10.0,p.z);
      if(gl_FragCoord.y<1.0){value=vec4(hexCloudLayerDensity(p,0),hexCloudLayerDensity(p,1),hexCloudLayerDensity(p,2),hexCloudShadow(ground));return;}
      vec3 transmission=vec3(1.0);
      for(int layer=0;layer<3;layer++){
        vec2 span=hexCloudInterval(ground,cloudLightDirection,layer,cloudFar);
        if(span.y>span.x)transmission[layer]=exp(-hexCloudExtinction*hexCloudLayerOpticalDepth(ground+cloudLightDirection*span.x,cloudLightDirection,span.y-span.x,layer));
      }
      value=vec4(transmission,cloudShade*smoothstep(0.04,0.18,cloudLightDirection.y));
    }`,
  });
  const target = new WebGLRenderTarget(points.length, 2, {
      type: HalfFloatType,
      depthBuffer: false,
    }),
    quad = new FullScreenQuad(material);
  const previous = g.renderer.getRenderTarget(),
    autoClear = g.renderer.autoClear;
  const output = new Uint16Array(points.length * 2 * 4);
  try {
    g.renderer.autoClear = false;
    g.renderer.setRenderTarget(target);
    quad.render(g.renderer);
    g.renderer.readRenderTargetPixels(target, 0, 0, points.length, 2, output);
  } finally {
    g.renderer.setRenderTarget(previous);
    g.renderer.autoClear = autoClear;
    target.dispose();
    material.dispose();
    quad.dispose();
  }
  const values = Array.from(output, DataUtils.fromHalfFloat);
  return {
    points,
    density: values.slice(0, points.length * 4),
    transmission: values.slice(points.length * 4),
  };
}
