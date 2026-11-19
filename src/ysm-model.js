import * as T from 'three';
import { unzipSync, strFromU8 } from 'three/addons/libs/fflate.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const limit = 24 * 1024 * 1024;
const deg = Math.PI / 180;
const axes = new T.Vector3(1, 1, -1);
const vec = (a) => new T.Vector3(...a).multiply(axes);
const angles = ([x, y, z]) => new T.Euler(x * deg, -y * deg, -z * deg, 'ZYX');
const zero = [0, 0, 0];
export function readYsm(bytes) {
  if (bytes.length > limit || bytes[0] !== 80 || bytes[1] !== 75)
    throw Error('请选择未加密的 YSM ZIP 模型包。');
  let total = 0,
    entries = 0;
  const files = unzipSync(bytes, {
    filter(f) {
      if (++entries > 4096) throw Error('模型包条目过多。');
      if (!/\.(json|png)$/i.test(f.name)) return false;
      total += f.originalSize;
      if (total > limit) throw Error('几何、动画与贴图合计需小于 24 MiB。');
      return true;
    },
  });
  const manifests = Object.keys(files).filter(
    (p) => /(^|\/)ysm\.json$/i.test(p) && !p.startsWith('__MACOSX/'),
  );
  if (manifests.length !== 1) throw Error('每个包需要一份 ysm.json。');
  const base = manifests[0].slice(0, -8);
  const file = (p) => {
    const b = files[base + p];
    if (!b) throw Error('模型包缺少 ' + p);
    return b;
  };
  const json = (p) => JSON.parse(strFromU8(file(p)).replace(/^\uFEFF/, ''));
  const m = json('ysm.json'),
    p = m.files?.player;
  if (!p?.model?.main || !p.texture?.length)
    throw Error('缺少玩家几何或贴图。');
  // Ordinary YSM readers use the same silhouette in the PNG alpha. In Hexwild
  // the authored boundary supplies real vertices and continuous cheek normals.
  const cuts = m.hexwild?.surface_cuts ? json(m.hexwild.surface_cuts) : null;
  const geo = (path) => {
    const g = json(path)['minecraft:geometry']?.[0];
    if (
      !g?.bones?.length ||
      g.bones.length > 2048 ||
      g.bones.reduce((n, b) => n + (b.cubes?.length || 0), 0) > 16000
    )
      throw Error('需要 Bedrock 方块骨骼模型（最多 16000 个方块）。');
    if (!(g.description.texture_width > 0 && g.description.texture_height > 0))
      throw Error('模型缺少 UV 尺寸。');
    if (cuts)
      for (const bone of g.bones)
        for (const cube of bone.cubes || []) {
          const face = cube.uv?.north;
          const key = Array.isArray(face?.uv) ? face.uv.join(',') : null;
          const polygon = key && cuts[key];
          if (!polygon || Object.keys(cube.uv).length !== 1) continue;
          if (
            !Array.isArray(polygon) ||
            polygon.length < 3 ||
            polygon.length > 32 ||
            !polygon.every(
              (v) =>
                Array.isArray(v) &&
                (v.length === 3 || v.length === 6) &&
                v.every(Number.isFinite),
            )
          )
            throw Error('模型面片的顶点无效。');
          cube.surfaceCut = polygon;
        }
    return g;
  };
  const skins = p.texture
    .map((t) => (typeof t === 'string' ? t : t.uv || t.texture))
    .filter((t) => typeof t === 'string');
  const skin =
    skins.find(
      (t) =>
        t
          .split('/')
          .pop()
          .replace(/\.png$/i, '') === m.properties?.default_texture,
    ) || skins[0];
  const png = file(skin),
    dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  if (
    png.length < 24 ||
    dv.getUint32(0) !== 0x89504e47 ||
    dv.getUint32(16) * dv.getUint32(20) > 16777216
  )
    throw Error('需要有效的 PNG 贴图（最多 1600 万像素）。');
  return {
    name: m.metadata?.name || 'YSM',
    geometry: geo(p.model.main),
    arm: p.model.arm ? geo(p.model.arm) : null,
    png,
    animations: p.animation?.main
      ? json(p.animation.main).animations || {}
      : {},
    height: Number(m.properties?.height_scale) || 1,
    width: Number(m.properties?.width_scale) || 1,
  };
}

function boxUV([u, v], [x, y, z]) {
  return {
    west: [u, v + z, z, y],
    north: [u + z, v + z, x, y],
    east: [u + z + x, v + z, z, y],
    south: [u + 2 * z + x, v + z, x, y],
    up: [u + z, v, x, z],
    down: [u + z + x, v + z, x, -z],
  };
}
function cutGeometry(c, desc) {
  const geometry = new T.BufferGeometry(),
    positions = [],
    normals = [],
    uvs = [],
    index = [];
  const [w, h, d] = c.size,
    {
      uv: [x, y],
      uv_size: [uw, vh],
    } = c.uv.north;
  for (const [u, v, z, nx = 0, ny = 0, nz = 1] of c.surfaceCut) {
    positions.push((u - 0.5) * w, (0.5 - v) * h, d / 2 + z);
    normals.push(nx, ny, nz);
    uvs.push(
      (x + u * uw) / desc.texture_width,
      1 - (y + v * vh) / desc.texture_height,
    );
  }
  // Convex sections and triangular wing gores. Front points toward local +Z.
  for (let j = 1; j < c.surfaceCut.length - 1; j++) {
    const [ax, ay] = c.surfaceCut[0],
      [bx, by] = c.surfaceCut[j],
      [cx, cy] = c.surfaceCut[j + 1];
    if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) > 0)
      index.push(0, j + 1, j);
    else index.push(0, j, j + 1);
  }
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

function boxGeometry(c, b, desc) {
  const { origin, size } = c,
    inflate = c.inflate ?? b.inflate ?? 0;
  const mesh = new T.BoxGeometry(
    ...size.map((x) => Math.max(0.001, x + 2 * inflate)),
  );
  const uv = mesh.attributes.uv,
    box = Array.isArray(c.uv),
    mirror = box && (c.mirror ?? b.mirror);
  const rect = box ? boxUV(c.uv, size) : null,
    indices = [];
  ['west', 'east', 'up', 'down', 'north', 'south'].forEach((side, i) => {
    const face = mirror && i < 2 ? ['east', 'west'][i] : side;
    const def = c.uv?.[face];
    if (!box && !def) return;
    const r = box
      ? rect[face]
      : [
          ...def.uv,
          ...(def.uv_size || [
            i < 2 ? size[2] : size[0],
            i === 2 || i === 3 ? size[2] : size[1],
          ]),
        ];
    let [x, y, w, h] = r;
    // BoxGeometry's top points backward; Bedrock's unfolded top starts there as well.
    if (mirror) {
      x += w;
      w = -w;
    }
    const corners = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    for (let j = 0; j < 4; j++) {
      let [s, t] = corners[j];
      for (let k = 0; k < (def?.uv_rotation || 0) / 90; k++)
        [s, t] = [t, 1 - s];
      uv.setXY(
        4 * i + j,
        (x + s * w) / desc.texture_width,
        1 - (y + t * h) / desc.texture_height,
      );
    }
    for (let j = 6 * i; j < 6 * i + 6; j++) indices.push(mesh.index.array[j]);
  });
  mesh.clearGroups();
  mesh.setIndex(indices);
  return mesh;
}
function geometry(c, b, desc) {
  const { origin, size } = c;
  const mesh = c.surfaceCut ? cutGeometry(c, desc) : boxGeometry(c, b, desc);
  const center = vec(origin.map((v, i) => v + size[i] / 2));
  mesh.translate(...center.toArray());
  if (c.rotation) {
    const pv = vec(c.pivot || zero);
    mesh.translate(-pv.x, -pv.y, -pv.z);
    mesh.applyMatrix4(
      new T.Matrix4().makeRotationFromEuler(angles(c.rotation)),
    );
    mesh.translate(...pv.toArray());
  }
  const bp = vec(b.pivot || zero);
  mesh.translate(-bp.x, -bp.y, -bp.z);
  return mesh;
}
// A textured Bedrock patch uses one cube face. Build a bone's whole batch at
// once: no five unused faces per patch, no thousands of transient box meshes.
function northBatch(cubes, bone, desc) {
  const n = cubes.length,
    position = new Float32Array(n * 12),
    normal = new Float32Array(n * 12),
    uv = new Float32Array(n * 8),
    indices = [],
    bp = vec(bone.pivot || zero),
    p = new T.Vector3(),
    q = new T.Quaternion(),
    front = new T.Vector3();
  for (let i = 0; i < n; i++) {
    const c = cubes[i],
      center = vec(c.origin.map((x, j) => x + c.size[j] / 2)),
      pivot = vec(c.pivot || zero),
      inflate = c.inflate ?? bone.inflate ?? 0,
      [w, h, d] = c.size.map((x) => Math.max(0.001, x + 2 * inflate)),
      face = c.uv.north,
      [x, y] = face.uv,
      [sw, sh] = face.uv_size || c.size;
    q.setFromEuler(angles(c.rotation || zero));
    front.set(0, 0, 1).applyQuaternion(q);
    for (let j = 0; j < 4; j++) {
      const s = j % 2,
        t = j >> 1,
        at = 4 * i + j;
      p.set((s - 0.5) * w, (0.5 - t) * h, d / 2)
        .add(center)
        .sub(pivot)
        .applyQuaternion(q)
        .add(pivot)
        .sub(bp)
        .toArray(position, 3 * at);
      front.toArray(normal, 3 * at);
      uv[2 * at] = (x + s * sw) / desc.texture_width;
      uv[2 * at + 1] = 1 - (y + t * sh) / desc.texture_height;
    }
    const k = i * 4;
    indices.push(k, k + 2, k + 1, k + 2, k + 3, k + 1);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(position, 3));
  g.setAttribute('normal', new T.BufferAttribute(normal, 3));
  g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  g.setIndex(indices);
  return g;
}

export function makeSkeleton(g, material) {
  const root = new T.Group(),
    nodes = new Map(),
    parents = new Map();
  for (const b of g.bones) {
    if (nodes.has(b.name)) throw Error('重复的骨骼名：' + b.name);
    const n = new T.Group();
    n.name = b.name;
    nodes.set(b.name, n);
    parents.set(b.name, b.parent);
    n.position.copy(vec(b.pivot || zero));
    n.rotation.copy(angles(b.rotation || zero));
    const patches = [],
      shapes = [];
    for (const c of b.cubes || []) {
      if (
        !c.surfaceCut &&
        c.uv?.north &&
        Object.keys(c.uv).length === 1 &&
        !c.uv.north.uv_rotation
      )
        patches.push(c);
      else shapes.push(geometry(c, b, g.description));
    }
    if (patches.length) shapes.push(northBatch(patches, b, g.description));
    if (shapes.length) {
      const combined =
        shapes.length === 1 ? shapes[0] : mergeGeometries(shapes);
      if (shapes.length > 1) shapes.forEach((v) => v.dispose());
      const mesh = new T.Mesh(combined, material);
      mesh.castShadow = mesh.receiveShadow = true;
      n.add(mesh);
    }
  }
  for (const [name, parent] of parents) {
    let p = parent,
      depth = 0;
    while (p) {
      if (!nodes.has(p) || ++depth > 128)
        throw Error('模型骨骼层级无效：' + name);
      p = parents.get(p);
    }
  }
  for (const b of g.bones) {
    const n = nodes.get(b.name),
      p = nodes.get(b.parent);
    if (p) {
      const parentBone = g.bones.find((v) => v.name === b.parent);
      n.position.sub(vec(parentBone.pivot || zero));
    }
    (p || root).add(n);
  }
  return root;
}
const triple = (v) =>
  Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
function track(value) {
  if (typeof value === 'number') value = [value, value, value];
  if (triple(value)) return () => value;
  if (!value || typeof value !== 'object') return null;
  const keys = Object.entries(value)
    .map(([t, v]) => ({
      t: Number(t),
      pre: v?.pre ?? v?.post ?? v,
      post: v?.post ?? v?.pre ?? v,
    }))
    .filter((k) => Number.isFinite(k.t) && triple(k.pre) && triple(k.post))
    .sort((a, b) => a.t - b.t);
  if (!keys.length) return null;
  return (t) => {
    if (t < keys[0].t) return keys[0].pre;
    const i = keys.findIndex((k) => k.t > t);
    if (i < 0) return keys.at(-1).post;
    const a = keys[i - 1],
      b = keys[i],
      u = (t - a.t) / (b.t - a.t);
    return a.post.map((v, j) => v + (b.pre[j] - v) * u);
  };
}
export function animator(root, clips) {
  const actions = {},
    rest = new Map();
  for (const [name, c] of Object.entries(clips)) {
    const tracks = [];
    for (const [bone, props] of Object.entries(c.bones || {})) {
      const n = root.getObjectByName(bone);
      if (!n) continue;
      for (const key of ['scale', 'position', 'rotation']) {
        const sample = track(props[key]);
        if (!sample) continue;
        if (!rest.has(n))
          rest.set(n, [
            n.position.clone(),
            n.rotation.clone(),
            n.scale.clone(),
          ]);
        tracks.push([n, key, sample]);
      }
    }
    actions[name] = {
      tracks,
      duration: c.animation_length || 1,
      loop: c.loop === true,
    };
  }
  return {
    reset() {
      for (const [n, [p, r, s]] of rest) {
        n.position.copy(p);
        n.rotation.copy(r);
        n.scale.copy(s);
      }
    },
    play(name, time, weight = 1) {
      const a = actions[name];
      if (!a || !weight) return false;
      const t = a.loop ? time % a.duration : Math.min(time, a.duration);
      for (const [n, key, sample] of a.tracks) {
        const [x, y, z] = sample(t);
        if (key === 'position') {
          n.position.x += x * weight;
          n.position.y += y * weight;
          n.position.z -= z * weight;
        } else if (key === 'rotation') {
          n.rotation.x += x * weight * deg;
          n.rotation.y -= y * weight * deg;
          n.rotation.z -= z * weight * deg;
        } else {
          n.scale.x *= 1 + (x - 1) * weight;
          n.scale.y *= 1 + (y - 1) * weight;
          n.scale.z *= 1 + (z - 1) * weight;
        }
      }
      return true;
    },
  };
}
