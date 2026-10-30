import * as THREE from 'three';
import { hash } from './core.js';
import { effectImage } from './texture-pack.js';
import {
  SkyAtmosphere,
  SUN_RADIUS,
  MOON_RADIUS,
  skyRadianceGLSL,
} from './sky-atmosphere.js';
import { PHOTON_SUN_SCALE } from './photon-lighting.js';

const PHASES = [
  '满月',
  '亏凸月',
  '下弦月',
  '残月',
  '新月',
  '娥眉月',
  '上弦月',
  '盈凸月',
];
const ILLUMINATION = [1, 0.85, 0.5, 0.15, 0, 0.15, 0.5, 0.85];
export const moonPhase = (time) => {
  const index = ((Math.floor(time / 600) % 8) + 8) % 8;
  return { index, name: PHASES[index], illumination: ILLUMINATION[index] };
};
export class SkyEnvironment {
  constructor(scene) {
    this.atmosphere = new SkyAtmosphere();
    this.uniforms = this.atmosphere.uniforms;
    this.uniforms.skyFlash = { value: 0 };
    scene.add(this.atmosphere.probe);
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(180, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: this.uniforms,
        vertexShader:
          'varying vec3 vSkyDirection; void main(){ vSkyDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */ `
        ${skyRadianceGLSL}
        uniform float skyFlash;
        varying vec3 vSkyDirection;
        void main() {
          vec3 sky = mix(hexSkyRadiance(vSkyDirection), vec3(0.571, 0.687, 0.831), skyFlash * 0.5);
          gl_FragColor = vec4(sky, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      }),
    );
    this.dome.renderOrder = -10;
    this.dome.userData.temporalSky = true;
    scene.add(this.dome);
    this.objects = new THREE.Group();
    this.objects.userData.temporalSky = true;
    this.sunDisk = new THREE.Mesh(
      new THREE.CircleGeometry(Math.tan(SUN_RADIUS) * Math.hypot(78, 45), 64),
      new THREE.ShaderMaterial({
        uniforms: { diskRadiance: { value: new THREE.Color() } },
        vertexShader: /* glsl */ `
          varying vec2 diskPosition;
          void main() { diskPosition = uv * 2.0 - 1.0;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 diskRadiance;
          varying vec2 diskPosition;
          void main() {
            float r2 = dot(diskPosition, diskPosition);
            float edge = 1.0 - smoothstep(1.0 - max(fwidth(r2), 0.0001), 1.0, r2);
            float limb = (0.4 + 0.6 * sqrt(max(0.0, 1.0 - r2))) / 0.8;
            gl_FragColor = vec4(diskRadiance * limb, edge);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
        fog: false,
        transparent: true,
        depthWrite: false,
      }),
    );
    const image = effectImage('mcl_moon_moon_phases');
    this.moonMap = new THREE.Texture(image);
    this.moonMap.colorSpace = THREE.SRGBColorSpace;
    this.moonMap.magFilter = this.moonMap.minFilter = THREE.NearestFilter;
    this.moonMap.generateMipmaps = false;
    this.moonMap.needsUpdate = true;
    // Crop the central 32 pixels of each 64-pixel source frame so the visible
    // moon fills the hexagon, while preserving the original phase artwork.
    this.moonMap.repeat.set(32 / 256, 32 / 128);
    this.moonDisk = new THREE.Mesh(
      new THREE.CircleGeometry(Math.tan(MOON_RADIUS) * Math.hypot(78, 45), 6),
      new THREE.MeshBasicMaterial({
        map: this.moonMap,
        color: '#d8e5ff',
        transparent: true,
        alphaTest: 0.02,
        depthWrite: false,
        fog: false,
      }),
    );
    this.objects.add(this.sunDisk, this.moonDisk);
    const positions = [],
      colors = [],
      seeds = [],
      color = new THREE.Color();
    const starColors = ['#e8edff', '#fff1dc', '#adc6ff', '#ffd1ae'];
    for (let i = 0; i < 1100; i++) {
      const angle = hash(i, 712) * Math.PI * 2;
      const y = hash(i, 914) * 2 - 1;
      const radius = Math.sqrt(1 - y * y);
      positions.push(
        Math.cos(angle) * radius * 205,
        y * 205,
        Math.sin(angle) * radius * 205,
      );
      color
        .set(starColors[Math.floor(hash(i, 317) * starColors.length)])
        .multiplyScalar(0.65 + hash(i, 188) * 0.65);
      colors.push(color.r, color.g, color.b);
      seeds.push(hash(i, 777));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute(
      'starSeed',
      new THREE.Float32BufferAttribute(seeds, 1),
    );
    this.starClock = { value: 0 };
    const material = new THREE.PointsMaterial({
      color: '#ffffff',
      size: 0.3,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.starClock = this.starClock;
      shader.vertexShader =
        'attribute float starSeed; varying float vStarSeed;\n' +
        shader.vertexShader
          .replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvStarSeed = starSeed;',
          )
          .replace(
            'gl_PointSize = size;',
            'gl_PointSize = size * (0.8 + starSeed * 0.6);',
          );
      shader.fragmentShader =
        'uniform float starClock; varying float vStarSeed;\n' +
        shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float border = max(abs(p.x), abs(dot(p, vec2(0.5, 0.8660254))));
          border = max(border, abs(dot(p, vec2(-0.5, 0.8660254))));
          if (border > 0.94) discard;
          diffuseColor.a *= 0.82 + 0.18 * sin(starClock * 0.65 + vStarSeed * 31.0);
          #include <opaque_fragment>
        `,
        );
    };
    material.customProgramCacheKey = () => 'hex-stars-v1';
    this.stars = new THREE.Points(geometry, material);
    this.objects.add(this.stars);
    scene.add(this.objects);
  }
  frame(renderer, { time, dt, rain, flash, camera, sun, quality, dimension }) {
    const phase = moonPhase(time);
    const angle = ((time % 600) / 600) * Math.PI * 2,
      active = dimension === 'overworld';
    this.sunDisk.position.set(Math.cos(angle) * 78, Math.sin(angle) * 78, -45);
    this.moonDisk.position.copy(this.sunDisk.position).multiplyScalar(-1);
    const direction = this.sunDisk.position.clone().normalize();
    this.uniforms.skyFlash.value = flash;
    this.atmosphere.update(renderer, {
      direction,
      height: camera.position.y,
      rain,
      moon: phase.illumination,
      phase: phase.index,
      quality,
      active,
      time,
      dt,
      position: camera.position,
    });
    if (active) {
      direction.copy(this.uniforms.skySunDirection.value);
      this.sunDisk.position.copy(direction).multiplyScalar(Math.hypot(78, 45));
      this.moonDisk.position.copy(this.sunDisk.position).multiplyScalar(-1);
      const day = direction.y >= 0;
      sun.position
        .copy(camera.position)
        .addScaledVector(direction, day ? 90 : -90);
      sun.target.position.copy(camera.position);
      sun.intensity =
        (day
          ? this.atmosphere.sourceExposures.x
          : this.atmosphere.sourceExposures.y) / PHOTON_SUN_SCALE;
      sun.color.copy(this.atmosphere.directLight);
      if (sun.intensity > 0) sun.color.multiplyScalar(1 / sun.intensity);
      this.sunDisk.material.uniforms.diskRadiance.value
        .copy(this.atmosphere.sunDiskColor)
        .multiplyScalar(1 / (2 * Math.PI * (1 - Math.cos(SUN_RADIUS))));
      this.moonDisk.material.color.copy(this.atmosphere.moonDiskColor);
    } else {
      this.sunDisk.material.uniforms.diskRadiance.value
        .set('#dac4ff')
        .multiplyScalar(2.5);
      this.moonDisk.material.color.set('#d8e5ff');
    }
    const displayedPhase = active
        ? this.uniforms.skyMoonPhase.value
        : phase.index,
      col = displayedPhase % 4,
      row = Math.floor(displayedPhase / 4);
    this.moonMap.offset.set((col * 64 + 16) / 256, 1 - (row * 64 + 48) / 128);
    this.sunDisk.visible =
      dimension === 'end' || (active && direction.y > -Math.sin(SUN_RADIUS));
    this.starClock.value = time;
    this.stars.rotation.set(0.25, 0.18, (time / 600) * Math.PI * 2);
  }
}
