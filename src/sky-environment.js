import * as THREE from 'three';
import { hash } from './core.js';
import { effectImage } from './texture-pack.js';

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
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(180, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          zenith: { value: new THREE.Color('#4b91df') },
          horizon: { value: new THREE.Color('#c0d9ed') },
          sunDirection: { value: new THREE.Vector3(0, 1, 0) },
          sunColor: { value: new THREE.Color('#ffe3ad') },
          sunStrength: { value: 0 },
          hazeRain: { value: 0 },
        },
        vertexShader:
          'varying vec3 skyDirection; void main(){ skyDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */ `
        uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDirection;
        uniform vec3 sunColor; uniform float sunStrength; uniform float hazeRain;
        varying vec3 skyDirection;
        void main() {
          vec3 direction = normalize(skyDirection);
          float h = pow(max(direction.y, 0.0), 0.65);
          float mu = dot(direction, sunDirection);
          float rayleigh = 0.86 + 0.07 * (1.0 + mu * mu);
          float mie = 0.018 * (1.0 - 0.76 * 0.76) / pow(max(0.015, 1.0 + 0.76 * 0.76 - 1.52 * mu), 1.5);
          vec3 color = mix(horizon, zenith, h) * rayleigh;
          color += sunColor * (mie + pow(max(mu, 0.0), 260.0) * 0.8) * sunStrength;
          float dusk = exp(-pow(sunDirection.y / 0.18, 2.0)) * (1.0 - hazeRain * 0.85);
          float toward = max(0.0, dot(normalize(direction.xz + vec2(0.0001)), normalize(sunDirection.xz + vec2(0.0001))));
          float belt = exp(-pow((direction.y + 0.02) * 5.0, 2.0));
          color += sunColor * dusk * belt * (0.1 + 0.48 * pow(toward, 4.0));
          color = mix(color, color * vec3(0.87, 0.86, 1.07), dusk * belt * (1.0 - toward) * 0.3);
          gl_FragColor = vec4(color, 1.0);
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
      new THREE.CircleGeometry(4.5, 6),
      new THREE.MeshBasicMaterial({
        color: '#fff0bd',
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
      new THREE.CircleGeometry(3.2, 6),
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
  frame(time, rain) {
    const phase = moonPhase(time);
    const col = phase.index % 4,
      row = Math.floor(phase.index / 4);
    this.moonMap.offset.set((col * 64 + 16) / 256, 1 - (row * 64 + 48) / 128);
    this.dome.material.uniforms.hazeRain.value = rain;
    this.starClock.value = time;
    this.stars.rotation.set(0.25, 0.18, (time / 600) * Math.PI * 2);
  }
}
