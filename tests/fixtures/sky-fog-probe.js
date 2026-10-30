import {
  DataUtils,
  HalfFloatType,
  ShaderMaterial,
  Vector2,
  Vector4,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Clone the actual environment shader, retaining texture identities. Texture
// cloning would allocate invalid copies of render-target attachments.
export function probeSkyFog(g) {
  const a = g.skyEnvironment.atmosphere,
    r = g.renderer,
    source = a.cloudSky.material,
    uniforms = Object.fromEntries(
      Object.entries(source.uniforms).map(([k, u]) => [
        k,
        {
          value: u.value?.isTexture
            ? u.value
            : u.value?.clone
              ? u.value.clone()
              : u.value,
        },
      ]),
    ),
    target = new WebGLRenderTarget(96, 48, {
      type: HalfFloatType,
      depthBuffer: false,
    }),
    quad = new FullScreenQuad(),
    previous = r.getRenderTarget(),
    auto = r.autoClear,
    material = new ShaderMaterial({
      uniforms,
      defines: { ...source.defines },
      glslVersion: source.glslVersion,
      vertexShader: source.vertexShader,
      fragmentShader: source.fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  uniforms.skyRadianceMap.value = a.uniforms.skyRadianceMap.value;
  const read = (t) => {
    const pixels = new Uint16Array(t.width * t.height * 4);
    r.readRenderTargetPixels(t, 0, 0, t.width, t.height, pixels);
    return { width: t.width, height: t.height, pixels: [...pixels] };
  };
  try {
    r.autoClear = true;
    quad.material = material;
    const environment = [...a.targets, ...a.cloudSky.targets].find(
        (t) => t.texture === a.uniforms.skyEnvironmentMap.value,
      ),
      clear = a.targets.find(
        (t) => t.texture === a.uniforms.skyRadianceMap.value,
      ),
      native = read(environment),
      raw = read(clear);
    const maps = [];
    for (const enabled of [1, 0]) {
      uniforms.skyFogEnabled.value = enabled;
      r.setRenderTarget(target);
      quad.render(r);
      maps.push(read(target));
    }
    return {
      native,
      raw,
      clonedFog: maps[0],
      noFog: maps[1],
      parameters: a.fogSnapshot.parameters,
      ambient: a.fogSnapshot.ambient.toArray(),
      skylight: a.fogSnapshot.skylight,
      distance: a.fogSnapshot.distance,
      position: uniforms.skyCloudOrigin.value.toArray(),
      lightDirection: uniforms.cloudLightDirection.value.toArray(),
      direct: a.directLight.toArray(),
      gl: r.getContext().getError(),
    };
  } finally {
    r.setRenderTarget(previous);
    r.autoClear = auto;
    quad.dispose();
    material.dispose();
    target.dispose();
  }
}

export function probeAirHorizon(g) {
  const r = g.renderer,
    p = g.composer.passes.find((p) => p.constructor.name === 'AtmospherePass'),
    previous = r.getRenderTarget(),
    auto = r.autoClear,
    uv = new Vector2(0.5, 0.5),
    // Use an actual volume texel centre and the current projection. The caller
    // allows FP16 quantization and the frame's small temporal-jitter difference.
    width = p.target.width,
    height = p.target.height;
  uv.set(
    (Math.floor(width / 2) + 0.5) / width,
    (Math.floor(height / 2) + 0.5) / height,
  );
  const end = new Vector4(uv.x * 2 - 1, uv.y * 2 - 1, 1, 1).applyMatrix4(
    p.volume.uniforms.inverseProjection.value,
  );
  end.divideScalar(end.w).applyMatrix4(p.volume.uniforms.airCameraWorld.value);
  const origin = g.atmosphere.uniforms.airCameraPosition.value,
    delta = [end.x - origin.x, end.y - origin.y, end.z - origin.z],
    length = Math.hypot(...delta),
    target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      depthBuffer: false,
    }),
    quad = new FullScreenQuad(),
    material = new ShaderMaterial({
      uniforms: {
        columns: { value: p.target.textures[1] },
        depth: { value: p.sceneFrame.depthTexture },
        sampleUV: { value: uv },
      },
      vertexShader: 'void main(){gl_Position=vec4(position.xy,0,1);}',
      fragmentShader:
        'uniform sampler2D columns,depth;uniform vec2 sampleUV;void main(){gl_FragColor=vec4(texture2D(columns,sampleUV).rg,texture2D(depth,sampleUV).r,1);}',
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  try {
    r.autoClear = true;
    quad.material = material;
    r.setRenderTarget(target);
    quad.render(r);
    const raw = new Uint16Array(4);
    r.readRenderTargetPixels(target, 0, 0, 1, 1, raw);
    return {
      height: origin.y,
      rayY: delta[1] / length,
      length: Math.min(length, g.atmosphere.uniforms.airFogDistance.value),
      values: Array.from(raw, DataUtils.fromHalfFloat),
      fogRange: [g.scene.fog.near, g.scene.fog.far],
      gl: r.getContext().getError(),
    };
  } finally {
    r.setRenderTarget(previous);
    r.autoClear = auto;
    quad.dispose();
    material.dispose();
    target.dispose();
  }
}

export async function timeAirHorizon(g) {
  const r = g.renderer,
    gl = r.getContext(),
    ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return { supported: false };
  const p = g.composer.passes.find(
      (p) => p.constructor.name === 'AtmospherePass',
    ),
    previous = r.getRenderTarget(),
    source = { texture: p.composite.uniforms.sceneColor.value },
    output = new WebGLRenderTarget(r.domElement.width, r.domElement.height, {
      type: HalfFloatType,
      depthBuffer: false,
    }),
    flag = g.atmosphere.uniforms.airSkyFogActive,
    original = flag.value,
    windows = [];
  try {
    for (const enabled of [false, true, false]) {
      const samples = [];
      for (let i = 0; i < 8; i++) {
        // Assign immediately before the synchronous pass; ordinary game frames
        // between queries continue with their real dimension/fog state.
        flag.value = enabled ? 1 : 0;
        const query = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        try {
          p.render(r, output, source);
        } finally {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          flag.value = original;
        }
        while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE))
          await new Promise(requestAnimationFrame);
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT),
          ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(query);
        if (disjoint) throw Error('Disjoint atmosphere timing');
        if (i >= 2) samples.push(ms);
      }
      windows.push({ enabled, samples });
    }
    return {
      supported: true,
      windows,
      size: [r.domElement.width, r.domElement.height],
      scope:
        'Only the actual atmosphere volume and bilateral composite, new sky/far branch off/on/off with current identical inputs; two warm-ups and six samples per window. Not whole frames or a previous-release benchmark.',
      gl: gl.getError(),
    };
  } finally {
    flag.value = original;
    r.setRenderTarget(previous);
    output.dispose();
  }
}
