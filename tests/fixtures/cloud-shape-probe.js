import {
  DataUtils,
  HalfFloatType,
  ShaderMaterial,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { cloudFieldGLSL } from '../../src/cloud-field.js';

// Sample the real world-anchored density, not a CPU reimplementation. These
// are physical cloud volumes; connected components are measured by the test.
export function readCloudShape(g) {
  const width = 64,
    levels = 32,
    spacing = 5;
  const band = g.cloudSystem.uniforms.cloudLayers.value[0];
  const material = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      ...g.cloudSystem.uniforms,
      shapeCenter: { value: g.camera.position },
    },
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: `${cloudFieldGLSL}
      uniform vec3 shapeCenter;
      void main(){
        float row=floor(gl_FragCoord.y), z=mod(row,64.0), y=floor(row/64.0);
        vec3 p=vec3(shapeCenter.x+(gl_FragCoord.x-32.0)*5.0,
          cloudLayers[0].x+(y+0.5)*cloudLayers[0].y/32.0,
          shapeCenter.z+(z-31.5)*5.0);
        gl_FragColor=vec4(hexCloudLayerDensity(p,0),0.0,0.0,1.0);
      }`,
  });
  const target = new WebGLRenderTarget(width, width * levels, {
    type: HalfFloatType,
    depthBuffer: false,
  });
  const quad = new FullScreenQuad(material),
    previous = g.renderer.getRenderTarget();
  const data = new Uint16Array(width * width * levels * 4);
  try {
    g.renderer.setRenderTarget(target);
    quad.render(g.renderer);
    g.renderer.readRenderTargetPixels(
      target,
      0,
      0,
      target.width,
      target.height,
      data,
    );
  } finally {
    g.renderer.setRenderTarget(previous);
    quad.dispose();
    material.dispose();
    target.dispose();
  }
  const density = [];
  for (let i = 0; i < data.length; i += 4)
    density.push(DataUtils.fromHalfFloat(data[i]));
  return {
    width,
    levels,
    spacing,
    verticalSpacing: band.y / levels,
    band: band.toArray(),
    density,
  };
}
