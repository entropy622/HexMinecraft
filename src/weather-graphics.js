import * as THREE from 'three';
import { hash, worldToAxial } from './core.js';

const MAX_PARTICLES = 900;
const fract = (n) => n - Math.floor(n);
export class WeatherEffects {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const geometry = (size) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(size), 3).setUsage(
          THREE.DynamicDrawUsage,
        ),
      );
      return g;
    };
    this.rain = new THREE.LineSegments(
      geometry(MAX_PARTICLES * 6),
      new THREE.LineBasicMaterial({
        color: '#b9cde6',
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    );
    const flake = document.createElement('canvas');
    flake.width = flake.height = 8;
    const c = flake.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(3, 0, 2, 8);
    c.fillRect(0, 3, 8, 2);
    c.fillRect(2, 2, 4, 4);
    const map = new THREE.CanvasTexture(flake);
    map.magFilter = map.minFilter = THREE.NearestFilter;
    this.snow = new THREE.Points(
      geometry(MAX_PARTICLES * 3),
      new THREE.PointsMaterial({
        map,
        color: '#eef5ff',
        size: 0.13,
        transparent: true,
        opacity: 0.85,
        alphaTest: 0.15,
        depthWrite: false,
      }),
    );
    this.splashes = new THREE.LineSegments(
      geometry(MAX_PARTICLES * 12),
      new THREE.LineBasicMaterial({
        color: '#bfdbec',
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    this.bolt = new THREE.Line(
      geometry(30),
      new THREE.LineBasicMaterial({
        color: '#e5efff',
        transparent: true,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    );
    this.group.add(this.rain, this.snow, this.splashes, this.bolt);
    for (const mesh of this.group.children) mesh.frustumCulled = false;
    this.flash = 0;
    this.nextStrike = 18;
    this.thunderDelay = -1;
    this.flashes = true;
    this.quality = 1;
  }
  frame(dt, time, world, camera, weather, columns) {
    this.thunder = false;
    const active = world.dimension === 'overworld' && !!weather;
    this.group.visible = active;
    if (!active) {
      this.flash = 0;
      this.thunderDelay = -1;
      this.nextStrike = 18;
      return;
    }
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.nextStrike -= dt * weather.storm;
    if (weather.storm > 0.6 && this.nextStrike <= 0) {
      const angle = Math.random() * Math.PI * 2,
        distance = 28 + Math.random() * 35;
      const x = camera.position.x + Math.sin(angle) * distance;
      const z = camera.position.z + Math.cos(angle) * distance;
      const a = worldToAxial(x, z);
      const base = world.loaded(a.q, a.r)
        ? columns.get(world, a.q, a.r).surface
        : world.terrainHeight(a.q, a.r) + 1;
      const positions = this.bolt.geometry.attributes.position;
      for (let i = 0; i < 10; i++)
        positions.setXYZ(
          i,
          x + (i === 9 ? 0 : (Math.random() - 0.5) * 5),
          95 + ((base - 95) * i) / 9,
          z + (i === 9 ? 0 : (Math.random() - 0.5) * 5),
        );
      positions.needsUpdate = true;
      this.flash = 1;
      this.thunderDelay = distance / 90 + 0.4;
      this.nextStrike = 18 + Math.random() * 24;
    }
    if (this.thunderDelay > 0) {
      this.thunderDelay -= dt;
      if (this.thunderDelay <= 0) {
        this.thunder = true;
        this.thunderDelay = -1;
      }
    }
    this.bolt.visible = this.flashes && this.flash > 0;
    this.bolt.material.opacity = this.flash;
    const rain = this.rain.geometry.attributes.position;
    const snow = this.snow.geometry.attributes.position;
    const splashes = this.splashes.geometry.attributes.position;
    let nr = 0,
      ns = 0,
      np = 0;
    const count = Math.floor(
      (this.quality < 1 ? 240 : this.quality > 1 ? 900 : 560) * weather.rain,
    );
    const radius = this.quality < 1 ? 13 : 20;
    const wind = 0.3 + weather.storm * 1.3;
    for (let i = 0; i < count; i++) {
      const x =
        camera.position.x +
        (fract(
          hash(i, 7) + time * 0.006 * wind - camera.position.x / (2 * radius),
        ) -
          0.5) *
          2 *
          radius;
      const z =
        camera.position.z +
        (fract(hash(i, 8) + time * 0.002 - camera.position.z / (2 * radius)) -
          0.5) *
          2 *
          radius;
      const a = worldToAxial(x, z),
        col = columns.get(world, a.q, a.r);
      if (
        col.biome === '沙漠' ||
        col.roof > camera.position.y + 18 ||
        col.surface < 0
      )
        continue;
      const snowy = col.biome === '雪原';
      const base = Math.max(col.surface, camera.position.y - 12);
      const phase = fract(hash(i, 9) + time * (snowy ? 0.1 : 0.82));
      const y = base + 24 * (1 - phase);
      if (Math.abs(y - camera.position.y) < 17) {
        if (snowy) snow.setXYZ(ns++, x + Math.sin(time + i) * 0.15, y, z);
        else {
          rain.setXYZ(nr++, x, y, z);
          rain.setXYZ(nr++, x - wind * 0.1, y + 0.7 + weather.storm * 0.4, z);
        }
      }
      if (
        !snowy &&
        phase > 0.94 &&
        base === col.surface &&
        Math.abs(base - camera.position.y) < 12
      ) {
        const size = (phase - 0.94) * 3;
        splashes.setXYZ(np++, x - size, base + 0.035, z);
        splashes.setXYZ(np++, x + size, base + 0.035, z);
        splashes.setXYZ(np++, x, base + 0.035, z - size);
        splashes.setXYZ(np++, x, base + 0.035, z + size);
      }
    }
    for (const [mesh, count] of [
      [this.rain, nr],
      [this.snow, ns],
      [this.splashes, np],
    ]) {
      mesh.geometry.setDrawRange(0, count);
      mesh.geometry.attributes.position.needsUpdate = true;
    }
    this.rain.material.opacity = 0.28 + weather.storm * 0.12;
  }
  light(colors) {
    this.rain.material.color.copy(colors.rain);
    this.snow.material.color.copy(colors.snow);
    // The host's ground splashes share rain's incident colour.
    this.splashes.material.color.copy(colors.rain);
  }
}
