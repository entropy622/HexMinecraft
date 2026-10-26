import { applySkylight, visionUniforms } from './skylight.js';
import {
  foliageUniforms,
  applyFoliageWind,
  leafMaterials,
} from './foliage-shader.js';
import { LeafParticles } from './leaf-particles.js';
import { pillarFace } from './pillar-faces.js';
import { isDoor, isTrapdoor } from './building-data.js';
import { BrewingModels } from './brewing-graphics.js';
import { CampfireModels } from './campfire-graphics.js';
import { FallingModels } from './gravity-graphics.js';
import { MiningEffects } from './mining-graphics.js';
import { netherSheet } from './nether-portal-graphics.js';
import { isCampfire } from './campfire-data.js';
import { isFurnace } from './processing-data.js';
import { animateSawMaterial, sawClock } from './processing-graphics.js';
import { VoxelLight } from './voxel-light.js';
import { DynamicLight } from './dynamic-light.js';
import { ChestModels } from './chest-graphics.js';
import { isStorage } from './chests.js';
import { createHeldItem, disposeHeldItem } from './held-item.js';
import { createShield } from './shield-graphics.js';
import { Atmosphere } from './atmosphere.js';
import { HexClouds } from './clouds.js';
import { SkyEnvironment, moonPhase } from './sky-environment.js';
import { fluidHeight } from './fluids.js';
import { EnchantingModels, applyEnchantGlow } from './enchanting-graphics.js';
import { SmithingModels } from './smithing-graphics.js';
import { isSmithingStation } from './smithing-data.js';
import { WeatherEffects } from './weather-graphics.js';
import { createPlant, plantStage } from './plant-graphics.js';
import { buildingMesh } from './building-graphics.js';
import {
  createPostprocessing,
  setPostprocessingOptions,
  disposePostprocessing,
} from './postprocessing.js';
import { postSettings } from './render-settings.js';
import { FluidRenderer } from './fluid-graphics.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bowImage, effectImage } from './texture-pack.js';
import { createTextures } from './textures.js';
import {
  BLOCKS,
  ITEMS,
  DIRECTIONS,
  axialToWorld,
  hash,
  worldToAxial,
} from './core.js';
import { DIMENSIONS, VIEW_RADIUS, WORLD_HEIGHT } from './world.js';
const corners = Array.from({ length: 6 }, (_, i) => [
  Math.cos(((i * 60 - 30) * Math.PI) / 180),
  Math.sin(((i * 60 - 30) * Math.PI) / 180),
]);
let sharedTextures;
// Counter-clockwise axial neighbors correspond to the outward side normals.
export class Graphics {
  constructor(canvas) {
    this.quality = 1;
    this.postOptions = postSettings();
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.scene = new THREE.Scene();
    this.dynamicLight = new DynamicLight();
    this.scene.background = new THREE.Color('#b5d9cf');
    this.scene.fog = new THREE.Fog('#b5d9cf', 22, 44);
    this.camera = new THREE.PerspectiveCamera(
      72,
      innerWidth / innerHeight,
      0.08,
      220,
    );
    this.camera.rotation.order = 'YXZ';
    this.atmosphere = new Atmosphere(this.camera);
    this.hemi = new THREE.HemisphereLight('#d7f2ea', '#a8b7c5', 2.3);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffe3ad', 2.7);
    this.sun.position.set(30, 55, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, {
      left: -24,
      right: 24,
      top: 24,
      bottom: -24,
      near: 1,
      far: 150,
    });
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 2;
    this.sun.shadow.bias = -0.0002;
    this.scene.add(this.sun, this.sun.target);
    this.textures = createTextures();
    this.leafParticles = new LeafParticles(this.scene, this.textures);
    this.chestModels = new ChestModels(this.textures);
    this.enchantingModels = new EnchantingModels(this.textures);
    this.smithingModels = new SmithingModels(this.textures);
    this.brewingModels = new BrewingModels(this.textures);
    this.campfireModels = new CampfireModels(this.scene);
    this.fallingModels = new FallingModels(this.scene, this.textures);
    this.miningEffects = new MiningEffects(this.scene, this.textures, [
      this.chestModels,
      this.enchantingModels,
      this.smithingModels,
      this.brewingModels,
    ]);
    this.netherPortalTexture = new THREE.Texture(
      effectImage('mcl_portals_portal'),
    );
    this.netherPortalTexture.colorSpace = THREE.SRGBColorSpace;
    this.netherPortalTexture.magFilter = this.netherPortalTexture.minFilter =
      THREE.NearestFilter;
    this.netherPortalTexture.generateMipmaps = false;
    this.netherPortalTexture.repeat.set(1, 1 / 8);
    this.netherPortalTexture.needsUpdate = true;
    sharedTextures = this.textures;
    this.fluidRenderer = new FluidRenderer(this.scene, this.textures);
    this.terrain = new THREE.Group();
    this.scene.add(this.terrain);
    this.chunks = new Map();
    this.material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: this.textures.atlas,
    });
    this.weatherUniforms = applySkylight(this.material);
    this.doorMaterial = new THREE.MeshLambertMaterial({
      map: this.textures.atlas,
      vertexColors: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      shadowSide: THREE.DoubleSide,
    });
    applySkylight(this.doorMaterial, this.weatherUniforms);
    animateSawMaterial(this.doorMaterial);
    this.leafUniforms = foliageUniforms();
    this.leafMaterials = leafMaterials(
      this.textures.atlas,
      this.weatherUniforms,
      this.leafUniforms,
    );
    this.weatherEffects = new WeatherEffects(this.scene);
    this.foliageMaterial = new THREE.MeshLambertMaterial({
      map: this.textures.atlas,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    this.glassMaterial = new THREE.MeshPhongMaterial({
      vertexColors: true,
      map: this.textures.atlas,
      transparent: true,
      opacity: 0.38,
      shininess: 95,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    applySkylight(this.foliageMaterial, this.weatherUniforms);
    applyFoliageWind(this.foliageMaterial, this.leafUniforms, true);
    applySkylight(this.glassMaterial, this.weatherUniforms);
    this.ray = new THREE.Raycaster();
    this.ray.far = 7;
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(
        new THREE.CylinderGeometry(1.009, 1.009, 1.009, 6),
      ),
      new THREE.LineBasicMaterial({
        color: '#172019',
        transparent: true,
        opacity: 0.95,
      }),
    );
    this.outline.visible = false;
    this.scene.add(this.outline);
    this.shapeOutline = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      this.outline.material,
    );
    this.shapeOutline.matrixAutoUpdate = false;
    this.shapeOutline.visible = false;
    this.scene.add(this.shapeOutline);
    this.skyEnvironment = new SkyEnvironment(this.scene);
    this.sky = this.skyEnvironment.dome;
    this.skyObjects = this.skyEnvironment.objects;
    this.sunDisk = this.skyEnvironment.sunDisk;
    this.moonDisk = this.skyEnvironment.moonDisk;
    this.stars = this.skyEnvironment.stars;
    this.cloudSystem = new HexClouds(this.scene);
    this.clouds = this.cloudSystem.mesh;
    this.decor = new THREE.Group();
    this.scene.add(this.decor);
    this.particles = [];
    this.cropMeshes = new Map();
    this.lights = new Map();
    this.torchMaterial = new THREE.MeshLambertMaterial({
      map: this.textures.atlas,
      vertexColors: true,
      emissive: '#8c470e',
      emissiveIntensity: 0.45,
    });
    applySkylight(this.torchMaterial, this.weatherUniforms);
    this.hand = new THREE.Group();
    this.hand.userData.skipOcclusion = true;
    const sleeve = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.22, 0.48),
      new THREE.MeshLambertMaterial({ color: '#436e65' }),
    );
    sleeve.rotation.x = -0.25;
    this.hand.add(sleeve);
    const palm = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.18, 0.18),
      new THREE.MeshLambertMaterial({ color: '#d7b68d' }),
    );
    palm.position.set(0, 0.03, -0.3);
    this.hand.add(palm);
    this.hand.scale.setScalar(0.64);
    this.hand.position.set(0.38, -0.32, -0.65);
    this.camera.add(this.hand);
    this.offhandHand = this.hand.clone();
    this.offhandHand.scale.x *= -1;
    this.offhandHand.position.x *= -1;
    this.camera.add(this.offhandHand);
    this.shield = createShield(this.textures);
    this.shield.userData.skipOcclusion = true;
    this.camera.add(this.shield);
    this.mainShield = createShield(this.textures);
    this.mainShield.userData.skipOcclusion = true;
    this.camera.add(this.mainShield);
    this.scene.add(this.camera);
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.resizeRendering();
    });
  }
  setQuality(value) {
    value = [0.65, 1, 1.7].includes(value) ? value : 1;
    this.quality = value;
    this.weatherEffects.quality = value;
    this.usePost = value >= 1.7;
    if (this.usePost && !this.composer)
      this.composer = createPostprocessing(
        this.renderer,
        this.scene,
        this.camera,
        this.sun,
        this.atmosphere,
        this.dynamicLight.uniforms,
        this.postOptions,
        this.cloudSystem.uniforms,
      );
    if (!this.usePost && this.composer) {
      disposePostprocessing(this.composer);
      this.composer = null;
    }
    const shadowSize = value >= 1.7 ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== shadowSize) {
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.resizeRendering();
    this.renderer.shadowMap.enabled = value >= 1;
    this.renderer.shadowMap.needsUpdate = true;
    this.scene.traverse((object) => {
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials)
        if (material) material.needsUpdate = true;
    });
  }
  resizeRendering() {
    // Keep the canvas and every post-process buffer at the same pixel density.
    const ratio = Math.min(
      devicePixelRatio,
      this.usePost ? 1.25 : this.quality,
    );
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer?.setPixelRatio(ratio);
    this.composer?.setSize(innerWidth, innerHeight);
  }
  setPostOptions(settings) {
    this.postOptions = postSettings(settings);
    if (this.composer)
      setPostprocessingOptions(this.composer, this.postOptions);
  }
  chunkKey(q, r) {
    return `${Math.floor(q / 8)},${Math.floor(r / 8)}`;
  }
  build(world, q = 0, r = 0) {
    this.cloudSystem.clear();
    this.leafParticles.clear();
    this.campfireModels.reset();
    this.fallingModels.clear();
    this.miningEffects.clear();
    this.stepOffset = 0;
    this.shapeOutline.visible = false;
    this.world = world;
    this.voxelLight = new VoxelLight(world);
    this.voxelLight.update(0, true);
    this.dynamicLight.upload(this.voxelLight);
    this.fluidRenderer.voxelLight = this.voxelLight;
    this.relightQueue = new Set();
    this.caveSky = null;
    this.composer?.effects.exposure.reset();
    this.fluidRenderer.clear();
    this.chestModels.openKey = null;
    for (const mesh of this.chunks.values()) {
      this.chestModels.release(mesh);
      this.enchantingModels.release(mesh);
      this.smithingModels.release(mesh);
      this.brewingModels.release(mesh);
      this.campfireModels.release(mesh);
      mesh.traverse((o) => o.geometry?.dispose());
      this.terrain.remove(mesh);
    }
    this.chunks.clear();
    this.queue = [];
    this.streamCenter = null;
    for (const child of [...this.decor.children]) {
      child.traverse((o) => {
        o.geometry?.dispose();
        if (Array.isArray(o.material))
          new Set(o.material).forEach((material) => material.dispose());
        else o.material?.dispose?.();
      });
      this.decor.remove(child);
    }
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    this.particles = [];
    this.cropMeshes.clear();
    this.lights.clear();
    this.portalMeshes = new Map();
    this.sync(q, r, true);
    this.clouds.visible = world.dimension === 'overworld';
    this.sky.visible = world.dimension === 'overworld';
    this.skyObjects.visible = world.dimension !== 'nether';
    this.sunDisk.visible = world.dimension === 'overworld';
    this.moonDisk.visible = world.dimension === 'overworld';
    this.scene.fog.near = world.dimension === 'nether' ? 15 : 22;
    this.scene.fog.far = world.dimension === 'nether' ? 39 : 44;
  }
  sync(q, r, immediate = false) {
    const cq = Math.floor(q / 8),
      cr = Math.floor(r / 8),
      center = cq + ',' + cr;
    if (center !== this.streamCenter) {
      this.streamCenter = center;
      const wanted = new Set();
      for (let dq = -VIEW_RADIUS; dq <= VIEW_RADIUS; dq++)
        for (let dr = -VIEW_RADIUS; dr <= VIEW_RADIUS; dr++)
          wanted.add(cq + dq + ',' + (cr + dr));
      for (const [k, mesh] of this.chunks)
        if (!wanted.has(k)) {
          this.chestModels.release(mesh);
          this.enchantingModels.release(mesh);
          this.smithingModels.release(mesh);
          this.brewingModels.release(mesh);
          this.campfireModels.release(mesh);
          mesh.traverse((o) => o.geometry?.dispose());
          this.terrain.remove(mesh);
          this.chunks.delete(k);
        }
      this.queue = [...wanted]
        .filter((k) => !this.chunks.has(k))
        .sort((a, b) => {
          const [x, z] = a.split(',').map(Number),
            [u, v] = b.split(',').map(Number);
          return Math.hypot(x - cq, z - cr) - Math.hypot(u - cq, v - cr);
        });
      for (const [k] of this.cropMeshes) {
        const [x, , z] = k.split(',').map(Number);
        if (!wanted.has(this.chunkKey(x, z))) this.removeCrop(k);
      }
      for (const [k, g] of this.lights) {
        const [x, , z] = k.split(',').map(Number);
        if (!wanted.has(this.chunkKey(x, z))) {
          this.lights.delete(k);
        }
      }
      for (const [k, g] of this.portalMeshes) {
        const [x, , z] = k.split(',').map(Number);
        if (!wanted.has(this.chunkKey(x, z))) {
          g.traverse((o) => {
            o.geometry?.dispose();
            if (Array.isArray(o.material))
              o.material.forEach((m) => m.dispose());
            else o.material?.dispose();
          });
          this.decor.remove(g);
          this.portalMeshes.delete(k);
        }
      }
      for (const ck of wanted)
        for (const [k, t] of this.world.editChunks.get(ck) || []) {
          const [x, y, z] = k.split(',').map(Number);
          if (BLOCKS[t]?.light || isFurnace(t)) this.updateLight(x, y, z);
          if (t === 'portal' || t === 'endportal') this.portal(x, y, z, t);
        }
    }
    const count = immediate ? this.queue.length : 2;
    for (let n = 0; n < count && this.queue.length; n++)
      this.buildChunk(this.queue.shift());
  }
  portal(q, y, r, type) {
    const k = q + ',' + y + ',' + r;
    if (this.portalMeshes.has(k)) return;
    if (type === 'portal') {
      const sheet = netherSheet(this.world, q, y, r, this.netherPortalTexture);
      this.decor.add(sheet);
      this.portalMeshes.set(k, sheet);
      return;
    }
    const p = axialToWorld(q, r),
      g = new THREE.Group(),
      color = type === 'portal' ? '#c48aff' : '#86f6dd';
    g.position.set(p.x, y, p.z);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.66, 0.8, 0.18, 6),
      new THREE.MeshLambertMaterial({ color: '#494257' }),
    );
    base.position.y = 0.09;
    g.add(base);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.96, 0.115, 4, 6),
      new THREE.MeshLambertMaterial({ color: '#534965' }),
    );
    rim.rotation.y = Math.PI / 2;
    rim.position.y = 1.15;
    g.add(rim);
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.83 - i * 0.13, 0.025, 4, 6),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.85 - i * 0.2,
        }),
      );
      ring.rotation.y = Math.PI / 2;
      ring.position.y = 1.15;
      ring.userData.spin = i ? -0.7 : 0.7;
      g.add(ring);
    }
    const surface = new THREE.Mesh(
      new THREE.CircleGeometry(0.83, 6),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.33,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    surface.rotation.y = Math.PI / 2;
    surface.position.y = 1.15;
    surface.userData.shimmer = true;
    g.add(surface);
    g.traverse((o) => (o.userData.block = { q, y, r, type }));
    this.decor.add(g);
    this.portalMeshes.set(k, g);
  }
  swing(hand = 'main') {
    if (hand === 'offhand') this.offhandSwingTime = 0.28;
    else this.swingTime = 0.28;
  }
  miningFeedback(target, progress, dt) {
    return this.miningEffects.update(this.world, target, progress, dt);
  }
  blockBreak(target) {
    this.miningEffects.shatter(this.world, target);
  }
  setHeld(id) {
    if (this.heldKey === id) return;
    this.heldKey = id;
    this.bowStage = -2;
    disposeHeldItem(this.held);
    this.held = createHeldItem(id === 'shield' ? null : id, this.textures);
    this.hand.add(this.held);
    this.fishingTip = this.held.fishingTip || null;
  }
  setOffhand(id) {
    if (this.offhandKey === id) return;
    this.offhandKey = id;
    this.offhandBowStage = -2;
    disposeHeldItem(this.offhandHeld);
    this.offhandHeld = createHeldItem(
      id === 'shield' ? null : id,
      this.textures,
    );
    this.offhandHand.add(this.offhandHeld);
  }
  buildChunk(k) {
    const [cq, cr] = k.split(',').map(Number),
      world = this.world,
      origin = axialToWorld(cq * 8, cr * 8);
    const solid = { p: [], c: [], uv: [], sky: [], rain: [] },
      leaves = { p: [], c: [], uv: [], sky: [], rain: [] },
      glass = { p: [], c: [], uv: [], sky: [], rain: [] },
      plants = { p: [], c: [], uv: [], sky: [], rain: [] },
      torches = { p: [], c: [], uv: [], sky: [], rain: [] };
    let out = solid,
      rainExposure = 0;
    const shaped = [];
    const chestCells = [];
    const enchantCells = [];
    const smithCells = [];
    const brewCells = [];
    const rainRoofs = new Map();
    for (let q = cq * 8; q < cq * 8 + 8; q++)
      for (let r = cr * 8; r < cr * 8 + 8; r++) {
        for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
          const type = world.get(q, y, r);
          if (type && !BLOCKS[type].nonSolid) {
            rainRoofs.set(q + ',' + r, y);
            break;
          }
        }
      }
    const tri = (verts, uvs, tile, shade = 1, ao = [1, 1, 1]) => {
      for (let i = 0; i < 3; i++) {
        out.p.push(...verts[i]);
        out.sky.push(1);
        out.rain.push(rainExposure);
        out.uv.push(...this.textures.uv(tile, ...uvs[i]));
        out.c.push(shade * ao[i], shade * ao[i], shade * ao[i]);
      }
    };
    const opaque = (q, y, r) => {
      const t = world.get(q, y, r);
      return (
        t &&
        t !== 'glass' &&
        !isStorage(t) &&
        t !== 'enchantingTable' &&
        !isSmithingStation(t) &&
        t !== 'brewingStand' &&
        !BLOCKS[t]?.nonSolid &&
        !BLOCKS[t]?.foliage &&
        !BLOCKS[t]?.shape
      );
    };
    for (let q = cq * 8; q < cq * 8 + 8; q++)
      for (let r = cr * 8; r < cr * 8 + 8; r++)
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const type = world.get(q, y, r);
          if (!type) continue;
          if (isStorage(type)) {
            chestCells.push([q, y, r]);
            continue;
          }
          if (type === 'enchantingTable') {
            enchantCells.push([q, y, r]);
            this.updateLight(q, y, r);
            continue;
          }
          if (isSmithingStation(type)) {
            smithCells.push([q, y, r]);
            continue;
          }
          if (type === 'brewingStand') {
            brewCells.push([q, y, r]);
            this.updateLight(q, y, r);
            continue;
          }
          if (BLOCKS[type].shape) {
            shaped.push([q, y, r]);
            if (BLOCKS[type].light) this.updateLight(q, y, r);
            continue;
          }
          rainExposure =
            world.dimension === 'overworld' &&
            rainRoofs.get(q + ',' + r) === y &&
            !['沙漠', '雪原'].includes(world.biome(q, r))
              ? 1
              : 0;
          if (BLOCKS[type].light || isFurnace(type)) this.updateLight(q, y, r);
          if (type === 'torch') {
            out = torches;
            const p = axialToWorld(q, r),
              x = p.x - origin.x,
              z = p.z - origin.z;
            for (const [radius, bottom, top, tile] of [
              [0.07, 0, 0.55, 'wood:side'],
              [0.115, 0.55, 0.75, 'lantern:top'],
            ]) {
              for (let i = 0; i < 6; i++) {
                const a = corners[i],
                  b = corners[(i + 1) % 6];
                const v0 = [x + a[0] * radius, y + bottom, z + a[1] * radius],
                  v1 = [x + b[0] * radius, y + bottom, z + b[1] * radius],
                  v2 = [x + b[0] * radius, y + top, z + b[1] * radius],
                  v3 = [x + a[0] * radius, y + top, z + a[1] * radius];
                tri(
                  [v0, v2, v1],
                  [
                    [0, 0],
                    [1, 1],
                    [1, 0],
                  ],
                  tile,
                );
                tri(
                  [v0, v3, v2],
                  [
                    [0, 0],
                    [0, 1],
                    [1, 1],
                  ],
                  tile,
                );
                tri(
                  [[x, y + top, z], v2, v3],
                  [
                    [0.5, 0.5],
                    [1, 0],
                    [0, 0],
                  ],
                  tile,
                );
              }
            }
            continue;
          }
          if (BLOCKS[type].nonSolid) continue;
          out = BLOCKS[type].foliage
            ? leaves
            : type === 'glass'
              ? glass
              : solid;
          const abs = axialToWorld(q, r),
            x = abs.x - origin.x,
            z = abs.z - origin.z;
          const axis = BLOCKS[type].pillar ? world.state(q, y, r).axis || 0 : 0;
          const blockFace = (vertices, uv, side, shade = 1, ao = [1, 1, 1]) => {
            let tile = type + (side < 0 ? ':top' : ':side');
            if (axis) {
              const mapped = pillarFace(
                axis,
                side,
                vertices.map(([a, b, c]) => [a - x, b - y, c - z]),
              );
              tile = type + ':' + mapped.face;
              uv = mapped.uv;
            } else if (isFurnace(type) && side >= 0) {
              tile =
                side === world.state(q, y, r).facing
                  ? world.furnaces.get(q + ',' + y + ',' + r)?.burn > 0
                    ? type + 'Lit:side'
                    : type + ':side'
                  : type + 'Casing:side';
            }
            tri(vertices, uv, tile, shade, ao);
          };
          const visible = (q, y, r) =>
            !opaque(q, y, r) &&
            (type !== 'glass' || world.get(q, y, r) !== 'glass');
          const tint = 0.94 + hash(q, y, r) * 0.06;
          const capUV = (i) => [
            (corners[i][0] + 1) / 2,
            (corners[i][1] + 1) / 2,
          ];
          const cornerAO = (i, level) => {
            const a = DIRECTIONS[i],
              b = DIRECTIONS[(i + 5) % 6];
            return (
              1 -
              0.18 *
                (Number(!!opaque(q + a[0], level, r + a[1])) +
                  Number(!!opaque(q + b[0], level, r + b[1])))
            );
          };
          if (visible(q, y + 1, r))
            for (let i = 0; i < 6; i++) {
              const j = (i + 1) % 6,
                a = corners[i],
                b = corners[j];
              blockFace(
                [
                  [x, y + 1, z],
                  [x + b[0], y + 1, z + b[1]],
                  [x + a[0], y + 1, z + a[1]],
                ],
                [[0.5, 0.5], capUV(j), capUV(i)],
                -1,
                tint,
                [1, cornerAO(j, y + 1), cornerAO(i, y + 1)],
              );
            }
          if (y > 0 && visible(q, y - 1, r))
            for (let i = 0; i < 6; i++) {
              const j = (i + 1) % 6,
                a = corners[i],
                b = corners[j];
              blockFace(
                [
                  [x, y, z],
                  [x + a[0], y, z + a[1]],
                  [x + b[0], y, z + b[1]],
                ],
                [[0.5, 0.5], capUV(i), capUV(j)],
                -2,
                tint * 0.65,
              );
            }
          for (let i = 0; i < 6; i++) {
            const [dq, dr] = DIRECTIONS[i];
            if (!visible(q + dq, y, r + dr)) continue;
            const j = (i + 1) % 6,
              a = corners[i],
              b = corners[j],
              v0 = [x + a[0], y, z + a[1]],
              v1 = [x + b[0], y, z + b[1]],
              v2 = [x + b[0], y + 1, z + b[1]],
              v3 = [x + a[0], y + 1, z + a[1]];
            const bottom = opaque(q + dq, y - 1, r + dr) ? 0.78 : 1;
            const shade = tint * (0.82 + Math.cos((i * Math.PI) / 3) * 0.07);
            blockFace(
              [v0, v2, v1],
              [
                [0, 0],
                [1, 1],
                [1, 0],
              ],
              i,
              shade,
              [bottom, cornerAO(j, y + 1), bottom],
            );
            blockFace(
              [v0, v3, v2],
              [
                [0, 0],
                [0, 1],
                [1, 1],
              ],
              i,
              shade,
              [bottom, cornerAO(i, y + 1), cornerAO(j, y + 1)],
            );
          }
          if (
            type === 'grass' &&
            !world.get(q, y + 1, r) &&
            hash(q, 71, r) > 0.65
          ) {
            out = plants;
            const tile = hash(q, 92, r) > 0.9 ? 'flower' : 'tuft';
            for (let i = 0; i < 3; i++) {
              const angle = (i * Math.PI) / 3,
                a = Math.cos(angle) * 0.5,
                b = Math.sin(angle) * 0.5,
                h = 0.45 + hash(q, 82, r) * 0.35;
              const v0 = [x - a, y + 1, z - b],
                v1 = [x + a, y + 1, z + b],
                v2 = [x + a, y + 1 + h, z + b],
                v3 = [x - a, y + 1 + h, z - b];
              tri(
                [v0, v1, v2],
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                ],
                tile,
              );
              tri(
                [v0, v2, v3],
                [
                  [0, 0],
                  [1, 1],
                  [0, 1],
                ],
                tile,
              );
            }
          }
        }
    const geometry = (data) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(data.p, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(data.c, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
      g.setAttribute('skylight', new THREE.Float32BufferAttribute(data.sky, 1));
      g.setAttribute(
        'rainExposure',
        new THREE.Float32BufferAttribute(data.rain, 1),
      );
      g.computeVertexNormals();
      g.computeBoundingSphere();
      return g;
    };
    let mesh = this.chunks.get(k);
    if (mesh) {
      this.chestModels.release(mesh);
      this.enchantingModels.release(mesh);
      this.smithingModels.release(mesh);
      this.brewingModels.release(mesh);
      this.campfireModels.release(mesh);
      mesh.geometry.dispose();
      for (const child of [...mesh.children]) {
        child.traverse((o) => o.geometry?.dispose());
        mesh.remove(child);
      }
    } else {
      mesh = new THREE.Mesh();
      this.terrain.add(mesh);
      this.chunks.set(k, mesh);
    }
    mesh.geometry = geometry(solid);
    mesh.material = this.material;
    mesh.position.set(origin.x, 0, origin.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (const [q, y, r] of chestCells)
      mesh.add(this.chestModels.create(world, q, y, r, origin));
    for (const [q, y, r] of enchantCells)
      mesh.add(this.enchantingModels.create(q, y, r, origin));
    for (const [q, y, r] of smithCells)
      mesh.add(this.smithingModels.create(world, q, y, r, origin));
    for (const [q, y, r] of brewCells)
      mesh.add(this.brewingModels.create(world, q, y, r, origin));
    const cuts = [];
    for (const [q, y, r] of shaped) {
      if (isCampfire(world.get(q, y, r)))
        mesh.add(this.campfireModels.create(world, q, y, r, origin));
      const building = buildingMesh(
        world,
        q,
        y,
        r,
        origin,
        this.textures,
        isDoor(world.get(q, y, r)) ||
          isTrapdoor(world.get(q, y, r)) ||
          world.get(q, y, r) === 'stonecutter'
          ? this.doorMaterial
          : this.material,
      );
      if (['slab', 'stairs'].includes(BLOCKS[world.get(q, y, r)].shape))
        cuts.push(building.geometry);
      else mesh.add(building);
    }
    if (cuts.length) {
      const batch = new THREE.Mesh(mergeGeometries(cuts), this.material);
      batch.castShadow = batch.receiveShadow = true;
      batch.userData.cutBlocks = true;
      mesh.add(batch);
      cuts.forEach((geometry) => geometry.dispose());
    }
    if (torches.p.length)
      mesh.add(new THREE.Mesh(geometry(torches), this.torchMaterial));
    if (glass.p.length)
      mesh.add(new THREE.Mesh(geometry(glass), this.glassMaterial));
    if (leaves.p.length) {
      const canopy = new THREE.Mesh(
        geometry(leaves),
        this.leafMaterials.material,
      );
      canopy.customDepthMaterial = this.leafMaterials.depth;
      canopy.castShadow = canopy.receiveShadow = true;
      mesh.add(canopy);
    }
    if (plants.p.length) {
      const foliage = new THREE.Mesh(geometry(plants), this.foliageMaterial);
      foliage.raycast = () => {};
      foliage.receiveShadow = true;
      mesh.add(foliage);
    }
    this.voxelLight.relight(mesh);
    this.renderer.shadowMap.needsUpdate = true;
  }
  updateBlock(q, y, r) {
    this.updateCells([[q, y, r]]);
  }
  updateCells(cells) {
    const chunks = new Set();
    for (const [q, y, r] of cells) {
      chunks.add(this.chunkKey(q, r));
      for (const [dq, dr] of DIRECTIONS)
        chunks.add(this.chunkKey(q + dq, r + dr));
      this.updatePortal(q, y, r);
    }
    for (const k of chunks) if (this.chunks.has(k)) this.buildChunk(k);
  }
  updatePortal(q, y, r) {
    const pk = q + ',' + y + ',' + r,
      t = this.world.get(q, y, r);
    if (this.portalMeshes.has(pk)) {
      const g = this.portalMeshes.get(pk);
      g.traverse((o) => {
        o.geometry?.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material?.dispose();
      });
      this.decor.remove(g);
      this.portalMeshes.delete(pk);
    }
    if (t === 'portal' || t === 'endportal') this.portal(q, y, r, t);
    this.updateLight(q, y, r);
  }
  updateLight(q, y, r) {
    const k = q + ',' + y + ',' + r,
      type = this.world.get(q, y, r),
      color =
        isCampfire(type) && !this.world.campfires.get(k)?.lit
          ? null
          : isFurnace(type) && this.world.furnaces.get(k)?.burn > 0
            ? '#ff9d47'
            : BLOCKS[type]?.light;
    if (this.lights.get(k)?.color !== color) this.voxelLight.dirty = true;
    if (!color) {
      this.lights.delete(k);
      return;
    }
    const p = axialToWorld(q, r);
    this.lights.set(k, {
      position: new THREE.Vector3(p.x, y + 0.85, p.z),
      color,
      type,
    });
  }
  target(includeLiquids = false) {
    this.shapeOutline.visible = false;
    this.ray.setFromCamera(new THREE.Vector2(), this.camera);
    const hit = this.ray.intersectObjects(
      [
        ...this.terrain.children,
        ...this.portalMeshes.values(),
        ...this.cropMeshes.values(),
        ...(includeLiquids ? this.fluidRenderer.group.children : []),
      ],
      true,
    )[0];
    if (!hit) {
      this.outline.visible = false;
      return null;
    }
    if (hit.object.userData.plant) {
      const plant = hit.object.userData.plant;
      const p = axialToWorld(plant.q, plant.r);
      this.outline.position.set(p.x, plant.y + 1 + plant.height / 2, p.z);
      this.outline.scale.set(0.7, plant.height, 0.7);
      this.outline.visible = true;
      return {
        q: plant.q,
        y: plant.y,
        r: plant.r,
        type: this.world.get(plant.q, plant.y, plant.r),
        crop: plant.k,
        place: { q: plant.q, y: plant.y + 1, r: plant.r },
        distance: hit.distance,
      };
    }
    if (hit.object.userData.chest || hit.object.userData.station) {
      const block = hit.object.userData.chest || hit.object.userData.station,
        p = axialToWorld(block.q, block.r);
      const height =
        block.type === 'enchantingTable'
          ? 1.6
          : block.type === 'brewingStand'
            ? 1.2
            : 1;
      this.outline.position.set(p.x, block.y + height / 2, p.z);
      this.outline.scale.set(1, height, 1);
      this.outline.visible = true;
      const normal = hit.face.normal
        .clone()
        .transformDirection(hit.object.matrixWorld);
      let place;
      if (Math.abs(normal.y) > 0.5)
        place = { q: block.q, y: block.y + Math.sign(normal.y), r: block.r };
      else {
        const directions = DIRECTIONS.map(([q, r]) => ({
          q,
          r,
          p: axialToWorld(q, r),
        }));
        directions.sort(
          (a, b) =>
            b.p.x * normal.x +
            b.p.z * normal.z -
            a.p.x * normal.x -
            a.p.z * normal.z,
        );
        place = {
          q: block.q + directions[0].q,
          y: block.y,
          r: block.r + directions[0].r,
        };
      }
      return {
        ...block,
        place,
        distance: hit.distance,
        point: hit.point.clone(),
        normal,
        renderObject: hit.object,
      };
    }
    let shaped = hit.object.userData.shaped;
    if (hit.object.userData.cutBlocks) {
      const inside = hit.point.clone().addScaledVector(hit.face.normal, -0.003),
        cell = worldToAxial(inside.x, inside.z),
        y = Math.floor(inside.y);
      shaped = { ...cell, y, type: this.world.get(cell.q, y, cell.r) };
    }
    if (shaped) {
      const block = shaped,
        p = axialToWorld(block.q, block.r);
      const height = ['gate', 'fence'].includes(BLOCKS[block.type]?.shape)
        ? 1.5
        : 1;
      this.outline.position.set(p.x, block.y + height / 2, p.z);
      this.outline.scale.set(1, height, 1);
      this.outline.visible = true;
      const outlineKey = `${hit.object.geometry.uuid}/${block.q},${block.y},${block.r}`;
      if (this.shapeOutlineKey !== outlineKey) {
        this.shapeOutlineKey = outlineKey;
        this.shapeOutline.geometry.dispose();
        const source = hit.object.userData.cutBlocks
          ? buildingMesh(
              this.world,
              block.q,
              block.y,
              block.r,
              { x: 0, z: 0 },
              this.textures,
              this.material,
            ).geometry
          : hit.object.geometry.clone();
        source.computeBoundingBox();
        const center = source.boundingBox.getCenter(new THREE.Vector3());
        source
          .translate(-center.x, -center.y, -center.z)
          .scale(1.004, 1.004, 1.004)
          .translate(center.x, center.y, center.z);
        this.shapeOutline.geometry = new THREE.EdgesGeometry(source, 20);
        source.dispose();
      }
      hit.object.updateWorldMatrix(true, false);
      if (hit.object.userData.cutBlocks) this.shapeOutline.matrix.identity();
      else this.shapeOutline.matrix.copy(hit.object.matrixWorld);
      this.shapeOutline.visible = true;
      this.outline.visible = false;
      const normal = hit.face.normal,
        outside = hit.point.clone().addScaledVector(normal, 0.04),
        a = worldToAxial(outside.x, outside.z);
      let place = { ...a, y: Math.floor(outside.y) };
      if (normal.y > 0.5)
        place = {
          q: block.q,
          y: Math.max(block.y + 1, Math.floor(outside.y)),
          r: block.r,
        };
      else if (normal.y < -0.5)
        place = { q: block.q, y: block.y - 1, r: block.r };
      else if (a.q === block.q && a.r === block.r) {
        const closest = DIRECTIONS.map(([q, r]) => ({
          q,
          r,
          p: axialToWorld(q, r),
        })).sort(
          (a, b) =>
            b.p.x * normal.x +
            b.p.z * normal.z -
            a.p.x * normal.x -
            a.p.z * normal.z,
        )[0];
        place = {
          q: block.q + closest.q,
          y: Math.floor(outside.y),
          r: block.r + closest.r,
        };
      }
      return {
        ...block,
        distance: hit.distance,
        point: hit.point.clone(),
        normal: normal.clone(),
        hitHeight: hit.point.y - Math.floor(hit.point.y),
        renderObject: hit.object,
        place,
      };
    }
    if (hit.object.userData.liquid) {
      const pt = hit.point.clone().addScaledVector(hit.face.normal, -0.02),
        a = worldToAxial(pt.x, pt.z),
        y = Math.floor(pt.y),
        outside = hit.point.clone().addScaledVector(hit.face.normal, 0.05),
        b = worldToAxial(outside.x, outside.z);
      const f = this.world.fluids.get(a.q, y, a.r);
      if (!f) return null;
      const p = axialToWorld(a.q, a.r);
      this.outline.position.set(p.x, y + 0.5, p.z);
      this.outline.scale.set(1, 1, 1);
      this.outline.visible = true;
      return {
        ...a,
        y,
        type: f.type,
        fluid: true,
        source: f.source,
        place: { ...b, y: Math.floor(outside.y) },
        distance: hit.distance,
      };
    }
    const portal = hit.object.userData.block;
    if (portal) {
      const p = axialToWorld(portal.q, portal.r);
      const height = portal.type === 'portal' ? 1 : 2;
      this.outline.position.set(p.x, portal.y + height / 2, p.z);
      this.outline.scale.set(1, height, 1);
      this.outline.visible = true;
      const normal = hit.face.normal
        .clone()
        .transformDirection(hit.object.matrixWorld);
      const direction = DIRECTIONS.map(([q, r]) => ({
        q,
        r,
        p: axialToWorld(q, r),
      })).sort(
        (a, b) =>
          b.p.x * normal.x +
          b.p.z * normal.z -
          a.p.x * normal.x -
          a.p.z * normal.z,
      )[0];
      return {
        ...portal,
        place:
          portal.type === 'portal'
            ? {
                q: portal.q + direction.q,
                y: portal.y,
                r: portal.r + direction.r,
              }
            : { q: portal.q, y: portal.y + 2, r: portal.r },
        distance: hit.distance,
        point: hit.point.clone(),
        normal,
      };
    }
    this.outline.scale.set(1, 1, 1);
    const pt = hit.point.clone().addScaledVector(hit.face.normal, -0.035),
      a = worldToAxial(pt.x, pt.z),
      y = Math.floor(pt.y);
    const outside = hit.point.clone().addScaledVector(hit.face.normal, 0.045),
      b = worldToAxial(outside.x, outside.z);
    const p = axialToWorld(a.q, a.r);
    this.outline.position.set(p.x, y + 0.5, p.z);
    this.outline.visible = true;
    return {
      ...a,
      y,
      type: this.world.get(a.q, y, a.r),
      place: { ...b, y: Math.floor(outside.y) },
      distance: hit.distance,
      point: hit.point.clone(),
      normal: hit.face.normal.clone(),
      hitHeight: hit.point.y - Math.floor(hit.point.y),
      renderObject: hit.object,
    };
  }
  burst(q, y, r, color) {
    const p = axialToWorld(q, r);
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.09, 0.09),
        new THREE.MeshBasicMaterial({ color }),
      );
      mesh.position.set(p.x, y + 0.6, p.z);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        v: new THREE.Vector3(
          (Math.random() - 0.5) * 3,
          Math.random() * 4,
          (Math.random() - 0.5) * 3,
        ),
        life: 0.7,
      });
    }
  }
  crop(k, plant) {
    const g = this.cropMeshes.get(k);
    if (
      g &&
      g.userData.kind === plant.kind &&
      g.userData.stage === plantStage(plant)
    )
      return;
    if (g) this.removeCrop(k);
    const group = createPlant(k, plant);
    this.decor.add(group);
    this.cropMeshes.set(k, group);
  }
  removeCrop(k) {
    const g = this.cropMeshes.get(k);
    if (g) {
      g.traverse((m) => {
        m.geometry?.dispose();
        if (Array.isArray(m.material))
          new Set(m.material).forEach((material) => material.dispose());
        else m.material?.dispose();
      });
      this.decor.remove(g);
      this.cropMeshes.delete(k);
    }
  }
  frame(
    dt,
    time,
    playing,
    moving,
    mining,
    weather = null,
    columns = null,
    renderDt = dt,
    heldLight = playing ? this.heldKey : null,
    offhandLight = playing ? this.offhandKey : null,
  ) {
    sawClock.value = time;
    this.voxelLight.setHeld([heldLight, offhandLight], this.camera.position);
    if (this.voxelLight.update(renderDt)) {
      this.dynamicLight.upload(this.voxelLight);
      for (const k of this.chunks.keys()) this.relightQueue.add(k);
    }
    let relit = 0;
    for (const k of this.relightQueue) {
      this.relightQueue.delete(k);
      const mesh = this.chunks.get(k);
      if (mesh) this.voxelLight.relight(mesh);
      const fluid = this.fluidRenderer.meshes.get(k);
      if (fluid) this.voxelLight.relight(fluid);
      if (++relit >= 6) break;
    }
    this.weatherEffects.frame(
      dt,
      time,
      this.world,
      this.camera,
      weather,
      columns,
    );
    const rain = this.world.dimension === 'overworld' ? weather?.rain || 0 : 0;
    const storm =
      this.world.dimension === 'overworld' ? weather?.storm || 0 : 0;
    const flash = this.weatherEffects.flashes ? this.weatherEffects.flash : 0;
    this.fluidRenderer.sync(this.world, new Set(this.chunks.keys()));
    const phase = (time % 600) / 600,
      day = Math.max(0.08, Math.sin(phase * Math.PI * 2)),
      sky =
        this.world?.dimension === 'overworld'
          ? new THREE.Color('#122c47').lerp(new THREE.Color('#79b6ee'), day)
          : new THREE.Color(
              DIMENSIONS[this.world?.dimension || 'overworld'].fog,
            );
    const horizon =
      this.world?.dimension === 'overworld'
        ? new THREE.Color('#132239').lerp(new THREE.Color('#c2dbee'), day)
        : sky;
    const overworld = this.world?.dimension === 'overworld';
    const elevation = Math.sin(phase * Math.PI * 2);
    const dusk = overworld ? Math.max(0, 1 - Math.abs(elevation) * 3.5) : 0;
    if (overworld) horizon.lerp(new THREE.Color('#e49a69'), dusk * 0.22);
    if (overworld) {
      const grey = new THREE.Color('#263444').lerp(
        new THREE.Color('#7e919b'),
        day,
      );
      sky.lerp(grey, rain * 0.85);
      horizon.lerp(grey, rain * 0.8);
      sky.lerp(new THREE.Color('#c7d8eb'), flash * 0.5);
      horizon.lerp(new THREE.Color('#c7d8eb'), flash * 0.35);
      this.scene.fog.near = 22 - rain * 6;
      this.scene.fog.far = 44 - rain * 7 - storm * 3;
    }
    this.weatherUniforms.terrainWetness.value = overworld
      ? weather?.wetness || 0
      : 0;
    this.weatherUniforms.wetSky.value.copy(horizon);
    this.sun.color.set(overworld ? '#fff3d2' : '#dac4ff');
    if (overworld) this.sun.color.lerp(new THREE.Color('#ff9857'), dusk * 0.8);
    this.hemi.groundColor.set(overworld ? '#77715b' : '#514353');
    this.fluidRenderer.frame(time, sky, horizon);
    this.scene.background.copy(horizon);
    this.scene.fog.color.copy(horizon);
    // Outdoor distance haze must not turn a sealed cave sky-blue.
    const localSky = this.voxelLight.atPosition(this.camera.position);
    this.caveSky = THREE.MathUtils.damp(
      this.caveSky ?? localSky,
      localSky,
      3,
      renderDt,
    );
    visionUniforms.nightVision.value = THREE.MathUtils.damp(
      visionUniforms.nightVision.value,
      this.nightVision || 0,
      4,
      renderDt,
    );
    const perceivedSky = Math.max(
      this.caveSky,
      visionUniforms.nightVision.value * 0.75,
    );
    this.scene.fog.color.multiplyScalar(0.035 + perceivedSky * 0.965);
    this.sky.position.copy(this.camera.position);
    this.sky.material.uniforms.zenith.value.copy(sky);
    this.sky.material.uniforms.horizon.value.copy(horizon);
    this.hemi.intensity =
      this.world?.dimension === 'overworld' ? 0.5 + day * 1.1 : 1.15;
    this.hemi.color.set(
      this.world?.dimension === 'nether'
        ? '#fbb099'
        : this.world?.dimension === 'end'
          ? '#c9b5ec'
          : '#daeaff',
    );
    this.sun.intensity =
      this.world?.dimension === 'overworld'
        ? 2.25 * THREE.MathUtils.smoothstep(elevation, 0, 0.16)
        : 0.5;
    this.sun.position.set(
      this.camera.position.x + Math.cos(phase * Math.PI * 2) * 50,
      this.camera.position.y + Math.max(15, Math.sin(phase * Math.PI * 2) * 60),
      this.camera.position.z + 25,
    );
    // Align shadows with the visible sun; after sunset use cool moonlight.
    if (overworld) {
      const side = elevation >= 0 ? 1 : -1;
      this.sun.position.set(
        this.camera.position.x + Math.cos(phase * Math.PI * 2) * 78 * side,
        this.camera.position.y + Math.max(8, Math.abs(elevation) * 78),
        this.camera.position.z - 45 * side,
      );
      if (elevation < 0) {
        this.sun.color.set('#a6bfff');
        this.sun.intensity =
          (0.08 + moonPhase(time).illumination * 0.22) *
          THREE.MathUtils.smoothstep(-elevation, 0, 0.18);
      }
    }
    this.sun.target.position.copy(this.camera.position);
    this.sun.intensity *= 1 - rain * 0.78;
    this.leafUniforms.leafTime.value = time;
    this.leafUniforms.leafViewer.value.copy(this.camera.position);
    this.leafUniforms.leafWind.value = overworld
      ? 0.018 + rain * 0.012 + storm * 0.014
      : 0;
    this.leafUniforms.leafSunDirection.value
      .copy(this.sun.position)
      .sub(this.sun.target.position)
      .normalize();
    this.leafUniforms.leafSunColor.value
      .copy(this.sun.color)
      .multiplyScalar(
        overworld && elevation > 0 ? this.sun.intensity * 0.2 : 0,
      );
    this.leafParticles.frame(dt, time, this.leafUniforms.leafWind.value);
    this.hemi.intensity = this.hemi.intensity * (1 - rain * 0.2) + flash * 0.85;
    this.shadowTimer = (this.shadowTimer || 0) - dt;
    if (this.shadowTimer <= 0) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowTimer = 0.25;
    }
    this.skyObjects.position.copy(this.camera.position);
    this.sunDisk.position.set(
      Math.cos(phase * Math.PI * 2) * 78,
      Math.sin(phase * Math.PI * 2) * 78,
      -45,
    );
    this.moonDisk.position.copy(this.sunDisk.position).multiplyScalar(-1);
    this.sky.material.uniforms.sunDirection.value
      .copy(this.sunDisk.position)
      .normalize();
    this.sky.material.uniforms.sunColor.value.set('#ffd29b');
    this.sky.material.uniforms.sunStrength.value = overworld
      ? Math.max(0, Math.min(1, elevation * 4 + 0.3)) * (1 - rain)
      : 0;
    this.skyEnvironment.frame(time, rain);
    this.cloudSystem.frame({
      world: this.world,
      camera: this.camera,
      time,
      rain,
      storm,
      sky,
      horizon,
      sun: this.sun,
      day,
      flash,
      quality: this.quality,
      enabled: this.postOptions.clouds,
    });
    this.sunDisk.material.color.set('#fff0bd').multiplyScalar(2.5);
    this.sunDisk.material.transparent = true;
    this.sunDisk.material.opacity = 1 - rain * 0.97;
    this.moonDisk.material.transparent = true;
    this.moonDisk.material.opacity = 1 - rain * 0.93;
    this.sunDisk.quaternion.copy(this.camera.quaternion);
    this.moonDisk.quaternion.copy(this.camera.quaternion);
    this.stars.material.opacity =
      this.world?.dimension === 'end'
        ? 0.9
        : Math.max(0, 1 - day * 2.5) * (1 - rain);
    for (const g of this.portalMeshes?.values() || [])
      for (const child of g.children) {
        if (child.userData.spin) child.rotation.z = time * child.userData.spin;
        if (child.userData.shimmer)
          child.material.opacity = 0.28 + Math.sin(time * 2) * 0.1;
      }
    this.netherPortalTexture.offset.y =
      1 - ((Math.floor(time * 10) % 8) + 1) / 8;
    for (const g of this.cropMeshes.values())
      g.children.forEach(
        (blade, i) =>
          (blade.rotation.z =
            Math.sin(time * (1.4 + storm) + g.position.x + i) *
            (0.07 + rain * 0.05)),
      );
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.v.y -= dt * 8;
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.rotation.x += dt * 3;
      p.mesh.scale.setScalar(Math.max(0, p.life));
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }
    for (const [hand, id, group, cache] of [
      ['main', this.heldKey, this.held, 'bowStage'],
      ['offhand', this.offhandKey, this.offhandHeld, 'offhandBowStage'],
    ]) {
      if (id !== 'bow') continue;
      const drawing = this.bowHand === hand && this.bowDraw > 0;
      const stage = drawing
        ? this.bowTime >= 0.9
          ? 2
          : this.bowTime >= 0.65
            ? 1
            : 0
        : -1;
      if (this[cache] === stage) continue;
      this[cache] = stage;
      const sprite = group?.children.find((o) => o.userData.ownedMap);
      const image = bowImage(stage);
      if (sprite && image) {
        sprite.userData.ownedMap.image = image;
        sprite.userData.ownedMap.needsUpdate = true;
      }
    }
    this.hand.visible = playing && this.heldKey !== 'shield';
    if (this.held) this.held.visible = true;
    if (this.offhandHeld) this.offhandHeld.visible = true;
    if (!playing) this.miningEffects.hide();
    this.miningEffects.particles.frame(
      playing ? dt : 0,
      this.world,
      this.camera,
    );
    const digging = mining && this.miningEffects.overlay.visible;
    this.digPhase = digging ? ((this.digPhase || 0) + dt * 4) % 1 : 0;
    const digSwing = Math.sin(this.digPhase * Math.PI);
    this.hand.position.x = 0.38;
    this.hand.rotation.y = 0;
    applyEnchantGlow(this.held, this.heldEnchanted, time);
    applyEnchantGlow(this.offhandHeld, this.offhandEnchanted, time);
    applyEnchantGlow(this.shield, this.shieldEnchanted, time);
    applyEnchantGlow(this.mainShield, this.mainShieldEnchanted, time);
    this.swingTime = Math.max(0, (this.swingTime || 0) - dt);
    this.hand.rotation.x = digging
      ? digSwing * 0.85 - 0.15
      : this.swingTime > 0
        ? Math.sin((this.swingTime / 0.28) * Math.PI) * 0.7
        : 0;
    this.hand.rotation.z =
      (moving ? Math.sin(time * 5.5) * 0.035 : 0) - digSwing * 0.12;
    this.hand.position.z = -0.65 - digSwing * 0.06;
    this.outline.material.opacity = mining
      ? 0.65 + Math.sin(time * 22) * 0.3
      : 0.8;
    this.hand.position.y = -0.32 + (moving ? Math.sin(time * 11) * 0.018 : 0);
    this.offhandHand.visible =
      playing && !!this.offhandKey && this.offhandKey !== 'shield';
    this.offhandSwingTime = Math.max(0, (this.offhandSwingTime || 0) - dt);
    this.offhandHand.rotation.set(
      Math.sin((this.offhandSwingTime / 0.28) * Math.PI) * 0.7,
      0,
      moving ? -Math.sin(time * 5.5) * 0.035 : 0,
    );
    this.offhandHand.position.set(
      -0.38,
      -0.32 + (moving ? Math.sin(time * 11) * 0.018 : 0),
      -0.65,
    );
    if (this.eating > 0) {
      const chew = Math.sin(this.eating * 26);
      const hand = this.eatingHand === 'offhand' ? this.offhandHand : this.hand;
      hand.rotation.x = 0.75 + chew * 0.09;
      hand.rotation.z = this.eatingHand === 'offhand' ? 0.35 : -0.35;
      hand.position.y = -0.18 + Math.abs(chew) * 0.025;
      hand.position.z = -0.48;
    }
    const drawingBow = playing && this.bowDraw > 0 && !!this.bowHand;
    if (drawingBow) {
      const left = this.bowHand === 'offhand';
      const bow = left ? this.offhandHand : this.hand,
        support = left ? this.hand : this.offhandHand,
        otherItem = left ? this.held : this.offhandHeld,
        sign = left ? -1 : 1;
      bow.visible = support.visible = true;
      if (otherItem) otherItem.visible = false;
      bow.position.set(sign * 0.19, -0.17, -0.48 - this.bowDraw * 0.04);
      bow.rotation.set(0.08, -sign * 0.25, -sign * 0.18);
      support.position.set(-sign * 0.13, -0.14, -0.44 + this.bowDraw * 0.08);
      support.rotation.set(0.7, sign * 0.2, sign * 0.3);
    }
    for (const [hand, model, equipped] of [
      ['offhand', this.shield, this.shieldEquipped],
      ['main', this.mainShield, this.mainShieldEquipped],
    ]) {
      model.visible = playing && !!equipped && !drawingBow;
      const active = this.blocking && this.blockingHand === hand;
      const key = hand === 'main' ? 'mainShieldBlend' : 'shieldBlend';
      this[key] = THREE.MathUtils.damp(
        this[key] || 0,
        active ? 1 : 0,
        12,
        renderDt,
      );
      const guard = this[key],
        sign = hand === 'main' ? -1 : 1,
        impact = active ? this.shieldImpact || 0 : 0;
      model.position.set(
        sign * (-0.42 + guard * 0.22),
        -0.34 + guard * 0.22,
        -0.68 + guard * 0.13 + impact * 0.055,
      );
      model.rotation.set(
        0.06 +
          (hand === 'main' && this.swingTime > 0 && !active
            ? Math.sin((this.swingTime / 0.28) * Math.PI) * 0.3
            : 0),
        sign * 0.32 * (1 - guard),
        sign * (0.1 * (1 - guard) + impact * 0.12),
      );
    }
    this.brewingModels.frame(renderDt, this.world);
    this.campfireModels.frame(dt, this.world, this.camera);
    this.fallingModels.frame(this.world);
    this.dynamicLight.attach(this.scene);
    this.cloudSystem.attach(this.scene);
    const cameraHex = worldToAxial(
      this.camera.position.x,
      this.camera.position.z,
    );
    const cameraFluid = this.world.fluids.get(
      cameraHex.q,
      Math.floor(this.camera.position.y),
      cameraHex.r,
    );
    const submerged =
      !!cameraFluid &&
      this.camera.position.y <
        Math.floor(this.camera.position.y) + fluidHeight(cameraFluid);
    this.atmosphere.update({
      time,
      dt: renderDt,
      dimension: this.world.dimension,
      biome: this.world.biome(cameraHex.q, cameraHex.r),
      rain,
      dusk,
      horizon,
      sun: this.sun,
      cameraSky: perceivedSky,
      submerged,
      volume: this.usePost,
      flight: this.gliding,
    });
    this.atmosphere.attach(this.scene);
    this.enchantingModels.frame(time);
    if (this.smithingModels.frame(renderDt))
      this.renderer.shadowMap.needsUpdate = true;
    if (this.chestModels.frame(renderDt))
      this.renderer.shadowMap.needsUpdate = true;
    const stepOffset = this.stepOffset || 0;
    this.camera.position.y -= stepOffset;
    this.camera.updateMatrixWorld();
    try {
      if (this.usePost) {
        this.composer.effects.contact.enabled =
          this.postOptions.occlusion > 0 && !submerged;
        this.composer.render(renderDt);
      } else this.renderer.render(this.scene, this.camera);
    } finally {
      this.camera.position.y += stepOffset;
      this.camera.updateMatrixWorld();
      this.stepOffset = stepOffset * Math.exp(-renderDt * 14);
    }
  }
}
