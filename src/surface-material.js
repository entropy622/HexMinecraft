import { MeshLambertMaterial } from 'three';
import { applySkylight } from './skylight.js';

// Three's class uploads host texture/light uniforms. The registered surface
// program owns material decoding, lighting, feature stages and record output.
export function createSurfaceMaterial(parameters, sharedUniforms) {
  const material = new MeshLambertMaterial(parameters);
  material.name = 'HexSurface';
  const uniforms = applySkylight(material, sharedUniforms, true);
  return { material, uniforms };
}
