import {
  Color,
  DepthTexture,
  DirectionalLight,
  DoubleSide,
  Group,
  HalfFloatType,
  LightProbe,
  MeshLambertMaterial,
  Scene,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import {
  DISTANT_RADIUS,
  DISTANT_TILE,
  DISTANT_INSET,
  DISTANT_CACHE_TILES,
  DISTANT_CACHE_BYTES,
} from './distant-config.js';
import { applySkylight } from './skylight.js';
import { distantMesh } from './distant-mesh.js';
import { applyDistantFoliage } from './distant-foliage.js';
import { DistantCache } from './distant-cache.js';

let epoch = 0;
export class DistantTerrain {
  constructor(scene, textures, uniforms, atmosphere) {
    this.scene = new Scene();
    this.scene.fog = scene.fog;
    this.group = new Group();
    this.group.name = 'DistantTerrain';
    this.scene.add(this.group);
    this.sun = new DirectionalLight();
    this.probe = new LightProbe();
    this.scene.add(this.sun, this.sun.target, this.probe);
    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      depthTexture: new DepthTexture(1, 1, UnsignedIntType),
    });
    this.atmosphere = atmosphere;
    this.frameId = 0;
    this.captureKey = null;
    const previous = scene.onBeforeRender;
    scene.onBeforeRender = (renderer, renderScene, camera, ...args) => {
      previous.call(scene, renderer, renderScene, camera, ...args);
      this.render(renderer, camera);
    };
    this.textures = textures;
    this.material = new MeshLambertMaterial({
      vertexColors: true,
      map: textures.atlas,
      alphaTest: 0.5,
      side: DoubleSide,
      toneMapped: false,
    });
    this.material.userData.distantTerrain = true;
    this.material.surfaceAtlas = textures.materials;
    applySkylight(this.material, uniforms, true);
    this.glassMaterial = this.material.clone();
    this.glassMaterial.transparent = true;
    this.glassMaterial.depthWrite = false;
    this.glassMaterial.alphaTest = 0.01;
    this.glassMaterial.surfaceAtlas = textures.materials;
    applySkylight(this.glassMaterial, uniforms, true);
    this.materials = [this.material, this.glassMaterial];
    this.tiles = new Map();
    this.cache = new DistantCache(DISTANT_CACHE_TILES, DISTANT_CACHE_BYTES);
    this.wanted = new Set();
    this.generations = new Map();
    this.completed = [];
    this.ready = false;
    this.active = false;
    this.job = null;
    this.stats = {
      generated: 0,
      maxResidentChunks: 0,
      maxResidentBlocks: 0,
      generationMs: 0,
      cacheHits: 0,
    };
  }
  reset(world) {
    this.captureKey = null;
    this.worker?.terminate();
    this.worker = null;
    for (const entry of this.tiles.values()) {
      this.group.remove(entry.mesh);
      entry.mesh.geometry.dispose();
    }
    this.tiles.clear();
    this.cache.clear();
    this.stats.cacheHits = 0;
    this.wanted.clear();
    this.generations.clear();
    this.completed.length = 0;
    this.world = world;
    this.epoch = ++epoch;
    this.ready = this.active = false;
    this.job = null;
    this.workerReady = false;
    this.error = null;
    this.center = null;
    this.editClock = 0;
    this.edits = new Map(world.edits);
    this.states = new Map(world.blockStates);
    this.fluids = new Map(world.fluids.edits);
    this.version = world.editVersion;
    this.fluidVersion = world.fluids.editVersion;
    this.group.visible = world.dimension === 'overworld';
    if (!this.group.visible) return;
    const worker = (this.worker = new Worker(
      new URL('./distant-worker.js', import.meta.url),
      { type: 'module' },
    ));
    const fail = (error) => {
      this.error = String(error);
      this.ready = false;
      this.workerReady = false;
      this.worker?.terminate();
      this.worker = null;
      console.error('Distant terrain: ' + this.error);
    };
    worker.onerror = (event) => fail(event.message);
    worker.onmessage = ({ data }) => {
      if (data.epoch !== this.epoch) return;
      if (data.type === 'error') {
        fail(data.error);
        return;
      }
      if (data.type === 'ready') this.workerReady = true;
      if (data.type === 'tile') {
        this.job = null;
        this.stats.generated++;
        this.stats.generationMs += data.duration;
        this.stats.maxResidentChunks = Math.max(
          this.stats.maxResidentChunks,
          data.tile.residentChunks,
        );
        this.stats.maxResidentBlocks = Math.max(
          this.stats.maxResidentBlocks,
          data.tile.residentBlocks,
        );
        if ((this.generations.get(data.id) || 0) === data.generation) {
          if (this.wanted.has(data.id)) this.completed.push(data);
          else this.cache.put(data);
        }
      }
    };
    worker.postMessage({
      type: 'init',
      epoch: this.epoch,
      snapshot: {
        seed: world.seed,
        dimension: world.dimension,
        edits: [...this.edits],
        blockStates: [...this.states],
        fluids: [...this.fluids],
        villageExclusions: [...world.villageExclusions],
      },
    });
  }
  synchronizeEdits(dt, force = false) {
    this.editClock += dt;
    if (
      (this.editClock < 0.25 && !force) ||
      (this.version === this.world.editVersion &&
        this.fluidVersion === this.world.fluids.editVersion)
    )
      return;
    this.editClock = 0;
    const changed = new Set(),
      next = [
        this.world.edits,
        this.world.blockStates,
        this.world.fluids.edits,
      ],
      old = [this.edits, this.states, this.fluids];
    next.forEach((map, i) => {
      for (const [key, value] of map)
        if (old[i].get(key) !== value) changed.add(key);
      for (const key of old[i].keys()) if (!map.has(key)) changed.add(key);
    });
    const cells = [...changed].map((key) => ({
      key,
      edit: next[0].get(key),
      state: next[1].get(key),
      fluid: next[2].get(key),
    }));
    this.edits = new Map(next[0]);
    this.states = new Map(next[1]);
    this.fluids = new Map(next[2]);
    this.version = this.world.editVersion;
    this.fluidVersion = this.world.fluids.editVersion;
    if (!cells.length) return;
    this.worker?.postMessage({ type: 'patch', epoch: this.epoch, cells });
    const affected = new Set();
    for (const key of changed) {
      const [q, , r] = key.split(',').map(Number),
        tq = Math.floor(q / DISTANT_TILE),
        tr = Math.floor(r / DISTANT_TILE),
        qs = [tq],
        rs = [tr];
      if (q - tq * DISTANT_TILE < 8) qs.push(tq - 1);
      if (r - tr * DISTANT_TILE < 8) rs.push(tr - 1);
      for (const a of qs) for (const b of rs) affected.add(a + ',' + b);
    }
    for (const id of affected) {
      this.generations.set(id, (this.generations.get(id) || 0) + 1);
      this.cache.delete(id);
    }
  }
  frame(q, r, dt) {
    this.frameId++;
    if (!this.worker) return;
    const tq = Math.floor((q - DISTANT_INSET) / DISTANT_TILE),
      tr = Math.floor((r - DISTANT_INSET) / DISTANT_TILE),
      center = tq + ',' + tr;
    this.synchronizeEdits(dt, this.center !== center);
    if (this.center !== center) {
      this.center = center;
      this.wanted.clear();
      for (let a = -DISTANT_RADIUS; a <= DISTANT_RADIUS; a++)
        for (let b = -DISTANT_RADIUS; b <= DISTANT_RADIUS; b++)
          this.wanted.add(tq + a + ',' + (tr + b));
      // Promote wanted data before retiring the old display, otherwise the
      // outgoing window could evict the returning window from the bounded LRU.
      const promoted = [];
      for (const id of this.wanted) {
        const data = this.cache.take(id, this.generations.get(id) || 0);
        if (data) {
          promoted.push(data);
          this.stats.cacheHits++;
        }
      }
      const retained = [];
      for (const data of this.completed) {
        if (data.generation !== (this.generations.get(data.id) || 0)) continue;
        if (this.wanted.has(data.id)) retained.push(data);
        else this.cache.put(data);
      }
      for (const [id, entry] of this.tiles)
        if (!this.wanted.has(id)) {
          if (entry.generation === (this.generations.get(id) || 0))
            this.cache.put(entry);
          this.group.remove(entry.mesh);
          entry.mesh.geometry.dispose();
          this.tiles.delete(id);
        }
      this.completed = [
        ...new Map(
          [...retained, ...promoted].map((data) => [data.id, data]),
        ).values(),
      ];
      this.completed.sort(
        (a, b) =>
          Math.hypot(a.tile.tq - tq, a.tile.tr - tr) -
          Math.hypot(b.tile.tq - tq, b.tile.tr - tr),
      );
    }
    // Limit main-thread geometry uploads; source generation stays in the worker.
    for (let i = 0; i < 2 && this.completed.length; i++) {
      const data = this.completed.shift();
      if (
        !this.wanted.has(data.id) ||
        (this.generations.get(data.id) || 0) !== data.generation
      )
        continue;
      const old = this.tiles.get(data.id);
      if (old) {
        this.group.remove(old.mesh);
        old.mesh.geometry.dispose();
      }
      const mesh = this.mesh(data.tile);
      this.group.add(mesh);
      this.tiles.set(data.id, { ...data, mesh });
    }
    if (!this.active && [...this.wanted].every((id) => this.tiles.has(id)))
      this.active = true;
    this.ready = this.active;
    if (this.ready) {
      // A teleport can outrun the retained reserve. Hide the transition until
      // the entire visible core has data, rather than displaying absent tiles.
      const radius = (DISTANT_RADIUS - 1) * DISTANT_TILE;
      for (
        let a = Math.floor((q - DISTANT_INSET - radius) / DISTANT_TILE);
        a <= Math.floor((q - DISTANT_INSET + radius) / DISTANT_TILE);
        a++
      )
        for (
          let b = Math.floor((r - DISTANT_INSET - radius) / DISTANT_TILE);
          b <= Math.floor((r - DISTANT_INSET + radius) / DISTANT_TILE);
          b++
        )
          if (!this.tiles.has(a + ',' + b)) this.ready = false;
    }
    if (!this.workerReady || this.job) return;
    const queued = new Set(
      this.completed
        .filter(
          (data) => data.generation === (this.generations.get(data.id) || 0),
        )
        .map((data) => data.id),
    );
    const pending = [...this.wanted].filter(
      (id) =>
        !queued.has(id) &&
        (!this.tiles.has(id) ||
          this.tiles.get(id).generation !== (this.generations.get(id) || 0)),
    );
    pending.sort((a, b) => {
      const [aq, ar] = a.split(',').map(Number),
        [bq, br] = b.split(',').map(Number);
      return Math.hypot(aq - tq, ar - tr) - Math.hypot(bq - tq, br - tr);
    });
    const id = pending[0];
    if (!id) return;
    const [a, b] = id.split(',').map(Number);
    this.job = id;
    this.worker.postMessage({
      type: 'tile',
      epoch: this.epoch,
      id,
      generation: this.generations.get(id) || 0,
      tq: a,
      tr: b,
    });
  }
  connect(sun, probe, clouds, foliage) {
    this.sourceSun = sun;
    this.sourceProbe = probe;
    this.clouds = clouds;
    for (const material of this.materials) {
      applyDistantFoliage(material, foliage);
      this.atmosphere.apply(material);
    }
    clouds.attach(this.scene);
  }
  render(renderer, camera) {
    const u = this.atmosphere.uniforms;
    if (!this.ready || u.airDistantBlend.value <= 0 || !this.sourceSun) return;
    const previous = renderer.getRenderTarget(),
      size = previous
        ? new Vector2(previous.width, previous.height)
        : renderer.getDrawingBufferSize(new Vector2()),
      key = [
        this.frameId,
        size.x,
        size.y,
        ...camera.matrixWorld.elements,
        ...camera.projectionMatrix.elements,
      ].join(',');
    if (key === this.captureKey) return;
    this.captureKey = key;
    if (this.target.width !== size.x || this.target.height !== size.y)
      this.target.setSize(size.x, size.y);
    u.airDistantColor.value = this.target.texture;
    u.airDistantDepth.value = this.target.depthTexture;
    u.airDistantResolution.value.copy(size);
    u.airProjectionMatrix.value.copy(camera.projectionMatrix);
    this.sun.color.copy(this.sourceSun.color);
    this.sun.intensity = this.sourceSun.intensity;
    this.sun.position.copy(this.sourceSun.position);
    this.sun.target.position.copy(this.sourceSun.target.position);
    this.probe.sh.copy(this.sourceProbe.sh);
    this.probe.intensity = this.sourceProbe.intensity;
    const auto = renderer.autoClear,
      color = renderer.getClearColor(new Color()),
      alpha = renderer.getClearAlpha(),
      shadowAuto = renderer.shadowMap.autoUpdate,
      shadow = renderer.shadowMap.needsUpdate;
    try {
      renderer.autoClear = true;
      renderer.shadowMap.autoUpdate = renderer.shadowMap.needsUpdate = false;
      renderer.setClearColor(0, 0);
      renderer.setRenderTarget(this.target);
      renderer.render(this.scene, camera);
    } finally {
      renderer.setRenderTarget(previous);
      renderer.setClearColor(color, alpha);
      renderer.autoClear = auto;
      renderer.shadowMap.autoUpdate = shadowAuto;
      renderer.shadowMap.needsUpdate = shadow;
    }
  }
  mesh(tile) {
    const mesh = distantMesh(tile, this.textures, this.world, this.materials);
    this.clouds?.attach(mesh);
    return mesh;
  }
  refreshColors() {
    this.captureKey = null;
    for (const entry of this.tiles.values()) {
      this.group.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.mesh = this.mesh(entry.tile);
      this.group.add(entry.mesh);
    }
  }
  dispose() {
    this.epoch = ++epoch;
    this.worker?.terminate();
    this.worker = null;
    for (const entry of this.tiles.values()) entry.mesh.geometry.dispose();
    this.tiles.clear();
    this.cache.clear();
    this.completed.length = 0;
    this.ready = false;
    this.wanted.clear();
    this.generations.clear();
    this.job = null;
    this.group.removeFromParent();
    for (const material of this.materials) material.dispose();
    this.target.dispose();
  }
}
