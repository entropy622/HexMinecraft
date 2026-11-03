import { waterLightingGLSL } from './water-lighting.js';
import { surfaceIndirectGLSL } from './surface-indirect.js';
import { photonSpecularGLSL } from './photon-specular.js';
import {
  materialPackGLSL,
  materialPackFragment,
} from './material-pack-shader.js';
import { biomeTintGLSL } from './biome-tint-shader.js';
import { wetCoverageGLSL, wetMaterialGLSL } from './wet-material.js';
import {
  surfaceDataGLSL,
  surfaceRecordParsGLSL,
  surfaceRecordOutputGLSL,
} from './surface-data.js';
import { surfaceLightingPars, surfaceLighting } from './surface-lighting.js';
import { surfaceVertex, surfaceFragment } from './surface-template.js';

const programs = new WeakMap();
const slots = new Set([
  'defines',
  'vertex_pars',
  'vertex_begin',
  'vertex_project',
  'fragment_pars',
  'shadow_pars',
  'shadow_helpers',
  'after_alpha',
  'sky_irradiance',
  'directional_filter',
  'directional_capture',
  'after_indirect',
  'after_diffuse',
  'output',
]);
const exclusive = new Set(['shadow_pars', 'sky_irradiance']);

export const hasSurfaceProgram = (material) => programs.has(material);
export function surfaceProgramKey(material) {
  const state = programs.get(material);
  return state
    ? `surface-v1/${state.output}/${Number(!!material.userData.wetSurface)}/${Number(!!(state.source || material).transparent)}/${[
        ...state.features.values(),
      ]
        .map((f) => f.id + '@' + f.version)
        .sort()
        .join('/')}`
    : null;
}
export function addSurfaceFeature(material, feature) {
  const state = programs.get(material);
  if (!state) return false;
  if (!feature.id || !feature.version)
    throw Error('Surface features require an id and version');
  for (const slot of Object.keys(feature.stages || {}))
    if (!slots.has(slot)) throw Error('Unknown surface stage: ' + slot);
  const old = state.features.get(feature.id);
  if (old) {
    if (old === feature) return true;
    throw Error('Duplicate surface feature: ' + feature.id);
  }
  state.features.set(feature.id, feature);
  material.needsUpdate = true;
  return true;
}

function expand(source, stages) {
  return source.replace(/#include <(hex_\w+)>/g, (_, key) => {
    if (!(key in stages)) throw Error('Missing surface stage: ' + key);
    return expand(stages[key], stages);
  });
}

export function buildSurfaceProgram(material) {
  const state = programs.get(material);
  if (!state) throw Error('Material has no surface program');
  const features = [...state.features.values()].sort(
      (a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id),
    ),
    stages = Object.fromEntries([...slots].map((key) => ['hex_' + key, ''])),
    source = state.source || material;
  stages.hex_shadow_pars = '#include <shadowmap_pars_fragment>';
  stages.hex_sky_irradiance =
    'irradiance += surfaceSkyLevel * surfaceSkyCone(geometryNormal,lightProbe,vAmbientOcclusion);';
  const claimed = new Set();
  for (const feature of features)
    for (const [slot, code] of Object.entries(feature.stages || {})) {
      const key = 'hex_' + slot;
      if (exclusive.has(slot)) {
        if (claimed.has(slot))
          throw Error('Multiple surface providers for ' + slot);
        stages[key] = code;
        claimed.add(slot);
      } else stages[key] += '\n' + code;
    }
  if (source.userData.wetSurface)
    stages.hex_defines += '\n#define HEX_WET_SURFACE';
  if (!source.transparent) {
    stages.hex_defines += '\n#define HEX_WATER_RECEIVER';
    stages.hex_material_pars = waterLightingGLSL;
  } else stages.hex_material_pars = '';
  stages.hex_material_pars +=
    surfaceIndirectGLSL +
    photonSpecularGLSL +
    wetCoverageGLSL +
    wetMaterialGLSL +
    materialPackGLSL +
    biomeTintGLSL +
    surfaceDataGLSL +
    surfaceLightingPars;
  stages.hex_material_decode = materialPackFragment;
  stages.hex_lighting = surfaceLighting;
  stages.hex_record_pars =
    state.output === 'records' ? surfaceRecordParsGLSL : '';
  stages.hex_record_output =
    state.output === 'records' ? surfaceRecordOutputGLSL : '';
  if (state.output === 'records')
    stages.hex_defines += '\n#define HEX_SURFACE_RECORD_PASS';
  return {
    vertexShader: expand(surfaceVertex, stages),
    fragmentShader: expand(surfaceFragment, stages),
    key: surfaceProgramKey(material),
  };
}

function bind(material, state) {
  programs.set(material, state);
  material.userData.surfaceProgram = true;
  material.onBeforeCompile = function (shader, renderer) {
    const program = buildSurfaceProgram(material);
    shader.vertexShader = program.vertexShader;
    shader.fragmentShader = program.fragmentShader;
    for (const uniforms of state.uniforms)
      Object.assign(shader.uniforms, uniforms);
    for (const feature of state.features.values())
      Object.assign(
        shader.uniforms,
        typeof feature.uniforms === 'function'
          ? feature.uniforms(renderer)
          : feature.uniforms,
      );
  };
  material.customProgramCacheKey = () => surfaceProgramKey(material);
}
export function installSurfaceProgram(material, uniforms, vision) {
  if (programs.has(material)) throw Error('Surface program already installed');
  bind(material, {
    output: 'beauty',
    features: new Map(),
    uniforms: [uniforms, vision],
  });
}

export function createSurfaceRecordMaterial(
  original,
  uniforms,
  flags,
  specular,
) {
  const source = programs.get(original);
  if (!source) throw Error('Surface records require an owned material program');
  const material = original.clone();
  material.defaultAttributeValues = { ...original.defaultAttributeValues };
  material.transparent = false;
  material.depthTest =
    material.depthWrite =
    material.toneMapped =
    material.fog =
      false;
  if (specular)
    material.defines = { ...material.defines, HEX_PACK_SPECULAR_OUTPUT: 1 };
  bind(material, {
    output: 'records',
    source: original,
    features: new Map(source.features),
    uniforms: [
      ...source.uniforms,
      uniforms,
      { surfaceChannels: { value: flags.clone() } },
    ],
  });
  return material;
}
