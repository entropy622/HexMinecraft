import { ShaderMaterial, WebGLRenderTarget, Vector2 } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { materialPackGLSL } from '../../src/material-pack-shader.js';
import { Mesh, Raycaster, Vector3, NearestMipmapLinearFilter } from 'three';
function equalAxisNormal(g) {
  const atlas = g.textures.materials,
    r = g.renderer,
    old = r.getRenderTarget();
  const target = new WebGLRenderTarget(4, 4, { depthBuffer: false });
  const mat = new ShaderMaterial({
    uniforms: {
      ...atlas.uniforms,
      grid: { value: new Vector2(8, atlas.layout.height / atlas.layout.cell) },
    },
    vertexShader:
      'varying vec2 testUv; varying vec3 vViewPosition;void main(){testUv=uv; vViewPosition=vec3(uv,1); gl_Position=vec4(position.xy,0,1);}',
    fragmentShader: `varying vec2 testUv; varying vec3 vViewPosition; uniform vec2 grid;
      ${materialPackGLSL}
      void main(){vec3 n=surfacePackPerturb(vec3(0,0,1),vec3(testUv,0),testUv/grid,vec2(.65),1.0);gl_FragColor=vec4(n*.5+.5,1);}`,
  });
  const quad = new FullScreenQuad(mat),
    rgba = new Uint8Array(4);
  try {
    r.setRenderTarget(target);
    quad.render(r);
    r.readRenderTargetPixels(target, 2, 2, 1, 1, rgba);
    return [...rgba];
  } finally {
    r.setRenderTarget(old);
    quad.dispose();
    mat.dispose();
    target.dispose();
  }
}
export function readCanopyInputs(g) {
  const atlas = g.textures.materials,
    u = g.atmosphere.uniforms;
  // Find the last cosmetic triangle and launch a ray just above its centroid.
  let canopy;
  g.terrain.traverse((o) => {
    if (
      !canopy &&
      o.material === g.leafMaterials.material &&
      Object.hasOwn(o, 'raycast')
    )
      canopy = o;
  });
  const p = canopy.geometry.attributes.position,
    last = p.count - 3;
  const hitAt = (index) => {
    const verts = [0, 1, 2].map((i) =>
      new Vector3()
        .fromBufferAttribute(p, index + i)
        .applyMatrix4(canopy.matrixWorld),
    );
    const n = verts[1]
      .clone()
      .sub(verts[0])
      .cross(verts[2].clone().sub(verts[0]))
      .normalize();
    const center = verts[0]
      .clone()
      .add(verts[1])
      .add(verts[2])
      .multiplyScalar(1 / 3);
    const ray = new Raycaster(
      center.addScaledVector(n, 0.005),
      n.negate(),
      0,
      0.009,
    );
    const all = [],
      pick = [];
    Mesh.prototype.raycast.call(canopy, ray, all);
    canopy.raycast(ray, pick);
    return [all, pick].map((list) =>
      list.some((h) => h.faceIndex === index / 3),
    );
  };
  const mask = atlas.tile('leaves:sprig');
  const rgba = mask
    .getContext('2d')
    .getImageData(0, 0, mask.width, mask.height).data;
  const covered = rgba.filter((v, i) => i % 4 === 3 && v >= 128).length;
  return {
    equalAxes: equalAxisNormal(g),
    cosmetic: hitAt(last),
    block: hitAt(0),
    covered,
    area: mask.width * mask.height,
    mip:
      atlas.uniforms.surfacePackNormal.value.minFilter ===
      NearestMipmapLinearFilter,
    fog: [u.airRayleighBaseHeight.value, u.airBaseHeight.value],
    extent: g.sun.shadow.camera.right,
  };
}
