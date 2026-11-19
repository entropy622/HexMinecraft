import * as T from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { SceneFramePass } from '../../src/scene-frame.js';

export function probeSharedWater() {
  const renderer = new T.WebGLRenderer();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.BasicShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new T.Scene();
  scene.background = new T.Color('#334856');
  const camera = new T.PerspectiveCamera(68, 257 / 149, 0.1, 24);
  camera.position.set(0, 1.75, 3.5);
  camera.lookAt(0, 0.1, -1);
  scene.add(camera);
  scene.add(new T.AmbientLight(0xffffff, 0.9));
  const sun = new T.DirectionalLight(0xffffff, 1.5);
  sun.position.set(-3, 5, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(128, 128);
  scene.add(sun);
  const add = (parent, geometry, material, x, y, z) => {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  const solid = (color) => new T.MeshLambertMaterial({ color });
  const glass = (color) =>
    new T.MeshLambertMaterial({
      color,
      transparent: true,
      opacity: 0.47,
      depthWrite: false,
      side: T.DoubleSide,
    });
  const ground = add(scene, box(7, 0.22, 7), solid('#3a7a2a'), 0, -0.72, -2);
  ground.receiveShadow = true;
  const islands = add(
    scene,
    box(0.9, 1.5, 1.4),
    solid('#9f6626'),
    -1.1,
    0,
    -1.8,
  );
  islands.castShadow = true;
  let terrainDraws = 0;
  islands.onBeforeRender = () => {
    terrainDraws++;
  };
  const mixed = [
    solid('#c5a843'),
    glass('#51dca0'),
    solid('#5e53ec'),
    glass('#f33564'),
    solid('#f36e2f'),
    glass('#535df1'),
  ];
  const stained = add(scene, box(0.85, 1.16, 0.58), mixed, 0.08, 0.19, -0.8);
  stained.castShadow = true;
  const nearGlass = add(
    scene,
    new T.PlaneGeometry(2.5, 0.7),
    glass('#f24266'),
    0.1,
    0.53,
    1,
  );
  nearGlass.castShadow = true;
  const farGlass = add(
    scene,
    new T.PlaneGeometry(3, 1),
    glass('#194cff'),
    0.1,
    0.51,
    -2.5,
  );
  farGlass.castShadow = true;
  farGlass.material.depthWrite = true;
  const held = new T.Group();
  held.userData.skipOcclusion = true;
  camera.add(held);
  const equipped = add(
    held,
    box(0.12, 0.19, 0.1),
    solid('#feeb1f'),
    0.12,
    -0.1,
    -0.48,
  );
  equipped.castShadow = true;
  add(held, box(0.15, 0.13, 0.05), glass('#3bc0ef'), -0.12, -0.08, -0.51);
  // An opaque object after the held mesh in sorted order also uses both tails.
  add(scene, box(0.26, 1.45, 0.24), solid('#7c288f'), 0.6, 0.1, -1.5);

  const handOccluder = add(
    scene,
    box(0.065, 0.17, 0.12),
    solid('#72502c'),
    0,
    0,
    0,
  );
  handOccluder.position.copy(
    camera.localToWorld(new T.Vector3(0.11, -0.08, -0.45)),
  );
  handOccluder.visible = false;

  const uniform = (value) => ({ value });
  const waterUniforms = {
    waterSceneReady: uniform(0),
    waterSceneColor: uniform(null),
    waterSceneDepth: uniform(null),
    waterResolution: uniform(new T.Vector2()),
    waterProjection: uniform(new T.Matrix4()),
    waterInverseProjection: uniform(new T.Matrix4()),
  };
  const water = new T.ShaderMaterial({
    glslVersion: T.GLSL3,
    uniforms: waterUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader:
      'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `
      uniform sampler2D waterSceneColor, waterSceneDepth;
      uniform float waterSceneReady; out vec4 color;
      void main(){
        if(waterSceneReady<0.5){color=vec4(0.,.4,.6,.45);return;}
        ivec2 pixel=ivec2(gl_FragCoord.xy);
        vec3 reflection=texelFetch(waterSceneColor,pixel,0).rgb;
        float d=texelFetch(waterSceneDepth,pixel,0).r;
        color=vec4(reflection*.45+vec3(0.,.1,.2)*d,.8);
      }`,
  });
  const group = new T.Group();
  scene.add(group);
  const lake = add(group, new T.PlaneGeometry(5.3, 5), water, 0, 0, -1);
  lake.rotation.x = -Math.PI / 2;
  lake.userData.liquid = 'water';
  const fluids = { group, waterUniforms, materials: { water }, medium: null };
  const frame = new SceneFramePass(
    scene,
    camera,
    fluids,
    Object.fromEntries(
      [
        'cloudSeedNoise',
        'cloudNoise',
        'cloudNoiseScale',
        'cloudCoverageReady',
        'cloudShadowReady',
        'cloudVolumetric',
      ].map((key) => [key, uniform(0)]),
    ),
  );
  const work = new T.WebGLRenderTarget(1, 1, {
    type: T.HalfFloatType,
    depthBuffer: false,
  });
  const depthTarget = new T.WebGLRenderTarget(1, 1, {
    type: T.FloatType,
    depthBuffer: false,
  });
  const depth = new T.ShaderMaterial({
    glslVersion: T.GLSL3,
    uniforms: { source: uniform(null) },
    depthTest: false,
    depthWrite: false,
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:
      'uniform sampler2D source;out vec4 color;void main(){color=vec4(texelFetch(source,ivec2(gl_FragCoord.xy),0).r,0.,0.,1.);}',
  });
  const quad = new FullScreenQuad(depth);
  const resize = (w, h) => {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    frame.setSize(w, h);
    work.setSize(w, h);
    depthTarget.setSize(w, h);
  };
  const read = (target) => {
    const { width: w, height: h } = target;
    const rgba = new Uint16Array(w * h * 4),
      z = new Float32Array(w * h * 4);
    renderer.readRenderTargetPixels(target, 0, 0, w, h, rgba);
    depth.uniforms.source.value = target.depthTexture;
    renderer.setRenderTarget(depthTarget);
    quad.render(renderer);
    renderer.readRenderTargetPixels(depthTarget, 0, 0, w, h, z);
    return { rgba, z };
  };
  const render = (shared) => {
    terrainDraws = 0;
    frame.shareWaterOpaque = shared;
    renderer.shadowMap.needsUpdate = true;
    frame.render(renderer, work, work);
    const captured = waterUniforms.waterSceneReady.value === 1;
    return {
      draws: terrainDraws,
      captured,
      main: read(frame.target),
      water: captured && read(frame.opaque),
      projection: camera.projectionMatrix.toArray(),
      inverse: camera.projectionMatrixInverse.toArray(),
      captureScale:
        waterUniforms.waterProjection.value.elements[0] /
        camera.projectionMatrix.elements[0],
      cleared: renderer.autoClear && frame.beauty.clear,
      overlay: held.visible && equipped.castShadow,
    };
  };
  const compare = (a, b) => ({
    color: a.rgba.reduce(
      (count, value, i) => count + Number(value !== b.rgba[i]),
      0,
    ),
    depth: a.z.reduce((count, value, i) => count + Number(value !== b.z[i]), 0),
  });
  const cases = [];
  try {
    for (const [name, w, h, medium, visible] of [
      ['shore', 257, 149, null, true],
      ['resized', 222, 135, null, true],
      ['near-hand', 222, 135, null, true],
      ['submerged', 222, 135, 'water', true],
      ['dry', 222, 135, null, false],
    ]) {
      resize(w, h);
      fluids.medium = medium;
      lake.visible = visible;
      handOccluder.visible = name === 'near-hand';
      const old = render(false),
        next = render(true);
      cases.push({
        name,
        oldDraws: old.draws,
        draws: next.draws,
        pixels: w * h,
        captureScale: next.captureScale,
        captured: next.captured,
        captureMatches: old.captured === next.captured,
        main: compare(old.main, next.main),
        water: old.captured && compare(old.water, next.water),
        state:
          next.cleared &&
          next.overlay &&
          next.projection.every((v, i) => v === old.projection[i]) &&
          next.inverse.every((v, i) => v === old.inverse[i]),
      });
    }
    lake.visible = true;
    const gl = renderer.getContext(),
      originalBlit = gl.blitFramebuffer;
    const before = render(false);
    let restored = false;
    frame.shareWaterOpaque = true;
    try {
      gl.blitFramebuffer = () => {
        throw new Error('fixture blit failure');
      };
      frame.render(renderer, work, work);
    } catch (error) {
      if (error.message !== 'fixture blit failure') throw error;
      restored =
        renderer.autoClear &&
        frame.beauty.clear &&
        scene.background?.isColor &&
        held.visible &&
        equipped.castShadow &&
        lake.visible &&
        waterUniforms.waterSceneReady.value === 0;
    } finally {
      gl.blitFramebuffer = originalBlit;
    }
    const after = render(true);
    const recovered = [
      compare(before.main, after.main),
      compare(before.water, after.water),
    ].every(({ color, depth }) => color === 0 && depth === 0);
    return { cases, restored, recovered, gl: gl.getError() };
  } finally {
    frame.dispose();
    work.dispose();
    depth.dispose();
    quad.dispose();
    depthTarget.dispose();
    sun.shadow.map?.dispose();
    scene.traverse((object) => {
      object.geometry?.dispose();
      for (const m of [object.material].flat()) m?.dispose();
    });
    renderer.dispose();
  }
}
