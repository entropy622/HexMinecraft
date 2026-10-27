import * as THREE from 'three';
import { axialToWorld, worldToAxial } from './core.js';
import {
  CLOUD_RADIUS,
  CLOUD_BASE,
  cloudDensity,
  cloudNoiseData,
  cloudFieldGLSL,
} from './cloud-field.js';

const CHUNK = 8,
  CAPACITY = 49 * CHUNK * CHUNK;
export class HexClouds {
  constructor(scene) {
    this.scene = scene;
    this.noiseSeed = 0;
    this.noise = new THREE.DataTexture(
      cloudNoiseData(0),
      127,
      127,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    this.noise.needsUpdate = true;
    this.uniforms = {
      cloudNoise: { value: this.noise },
      cloudRadius: { value: CLOUD_RADIUS },
      cloudBase: { value: CLOUD_BASE },
      cloudWind: { value: new THREE.Vector2() },
      cloudThreshold: { value: 0.56 },
      cloudLightDirection: { value: new THREE.Vector3(0, 1, 0) },
      cloudShade: { value: 0 },
      cloudEnabled: { value: 0 },
      cloudHeight: { value: 3 },
      cloudVolumetric: { value: 0 },
      cloudAmbient: { value: new THREE.Color() },
      cloudDirect: { value: new THREE.Color() },
      cloudZenith: { value: new THREE.Color() },
      cloudHorizon: { value: new THREE.Color() },
      cloudFar: { value: 130 },
    };
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 6)
      .rotateY(Math.PI / 3)
      .toNonIndexed();
    geometry.computeVertexNormals();
    this.density = new THREE.InstancedBufferAttribute(
      new Float32Array(CAPACITY),
      1,
    );
    this.density.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('cloudDensityValue', this.density);
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        ${cloudFieldGLSL}
        attribute float cloudDensityValue;
        varying vec3 vCloudWorld;
        varying vec3 vCloudNormal;
        varying float vCloudDensity;
        varying float vCloudLevel;
        void main() {
          float presence = hexCloudPresence(cloudDensityValue);
          vec3 p = position;
          p.xz *= presence;
          p.y = (position.y + 0.5) * cloudHeight * (0.5 + cloudDensityValue * 1.1) * presence;
          vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
          vCloudWorld = world.xyz;
          vCloudNormal = normalize(mat3(modelMatrix) * normal);
          vCloudDensity = cloudDensityValue;
          vCloudLevel = position.y + 0.5;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        ${cloudFieldGLSL}
        uniform vec3 cloudAmbient; uniform vec3 cloudDirect;
        uniform vec3 cloudZenith; uniform vec3 cloudHorizon;
        varying vec3 vCloudWorld; varying vec3 vCloudNormal;
        varying float vCloudDensity; varying float vCloudLevel;
        void main() {
          if (hexCloudPresence(vCloudDensity) < 0.002) discard;
          vec3 ray = normalize(vCloudWorld - cameraPosition);
          float direct = max(0.0, dot(normalize(vCloudNormal), cloudLightDirection));
          float underside = mix(0.42, 0.96, vCloudLevel) * (1.0 - vCloudDensity * 0.12);
          float edge = 1.0 - smoothstep(cloudThreshold + 0.01, cloudThreshold + 0.15, vCloudDensity);
          float forward = pow(max(0.0, dot(ray, cloudLightDirection)), 8.0);
          vec3 color = cloudAmbient * underside + cloudDirect * direct * mix(0.52, 1.05, vCloudLevel);
          color += cloudDirect * edge * forward * 0.85;
          vec3 distantSky = mix(cloudHorizon, cloudZenith, pow(max(ray.y, 0.0), 0.65));
          float fade = smoothstep(cloudFar * 0.62, cloudFar, length(vCloudWorld.xz - cameraPosition.xz));
          gl_FragColor = vec4(mix(color, distantSky, fade), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.InstancedMesh(geometry, this.material, CAPACITY);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.raycast = () => {};
    scene.add(this.mesh);
    this.white = new THREE.Color('#ffffff');
    this.matrix = new THREE.Matrix4();
  }
  clear() {
    this.key = '';
    this.mesh.count = 0;
  }
  rebuild(q, r, seed, quality) {
    const radius = quality < 1 ? 2 : 3;
    let count = 0;
    for (let a = (q - radius) * CHUNK; a < (q + radius + 1) * CHUNK; a++)
      for (let b = (r - radius) * CHUNK; b < (r + radius + 1) * CHUNK; b++) {
        const density = cloudDensity(a, b, seed);
        if (density < 0.3) continue;
        const p = axialToWorld(a, b);
        this.matrix
          .makeScale(CLOUD_RADIUS, 1, CLOUD_RADIUS)
          .setPosition(p.x * CLOUD_RADIUS, 0, p.z * CLOUD_RADIUS);
        this.mesh.setMatrixAt(count, this.matrix);
        this.density.setX(count++, density);
      }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = this.density.needsUpdate = true;
    this.mesh.computeBoundingSphere();
    this.mesh.boundingSphere.center.y += 8;
    this.mesh.boundingSphere.radius += 20;
  }
  frame({
    world,
    camera,
    time,
    rain,
    storm,
    sky,
    horizon,
    sun,
    day,
    flash,
    quality,
    enabled,
  }) {
    const u = this.uniforms,
      active = world.dimension === 'overworld' && enabled;
    this.mesh.visible = active && quality < 1.7;
    u.cloudEnabled.value = active && quality >= 1 ? 1 : 0;
    u.cloudVolumetric.value = active && quality >= 1.7 ? 1 : 0;
    if (!active) return;
    if (this.noiseSeed !== world.seed % 127) {
      this.noiseSeed = world.seed % 127;
      this.noise.image.data.set(cloudNoiseData(this.noiseSeed));
      this.noise.needsUpdate = true;
    }
    u.cloudWind.value.set(time * 0.065, time * 0.017);
    u.cloudThreshold.value = 0.56 - rain * 0.2;
    u.cloudHeight.value = (quality >= 1.7 ? 5 : 2.5) + rain * 6 + storm * 2.5;
    u.cloudFar.value = quality < 1 ? 87 : 130;
    u.cloudLightDirection.value
      .subVectors(sun.position, sun.target.position)
      .normalize();
    u.cloudShade.value = (0.62 + rain * 0.12) * Math.min(1, sun.intensity * 2);
    u.cloudAmbient.value
      .copy(horizon)
      .lerp(this.white, 0.52)
      .multiplyScalar(
        (0.14 + day * 0.85) * (1 - rain * 0.45 - storm * 0.15) + flash * 0.8,
      );
    u.cloudDirect.value.copy(sun.color).multiplyScalar(sun.intensity * 0.8);
    u.cloudZenith.value.copy(sky);
    u.cloudHorizon.value.copy(horizon);
    if (quality >= 1.7) return;
    this.mesh.position.set(
      u.cloudWind.value.x,
      CLOUD_BASE,
      u.cloudWind.value.y,
    );
    const center = worldToAxial(
      (camera.position.x - u.cloudWind.value.x) / CLOUD_RADIUS,
      (camera.position.z - u.cloudWind.value.y) / CLOUD_RADIUS,
    );
    const q = Math.floor(center.q / CHUNK),
      r = Math.floor(center.r / CHUNK);
    const key = `${q},${r},${world.seed},${quality}`;
    if (key !== this.key) {
      this.key = key;
      this.rebuild(q, r, world.seed, quality);
    }
  }
  attach(scene) {
    scene.traverseVisible((object) => {
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (
          !material ||
          material.userData.hexCloudShadow ||
          !(material.isMeshLambertMaterial || material.isMeshPhongMaterial)
        )
          continue;
        material.userData.hexCloudShadow = true;
        const previous = material.onBeforeCompile,
          cache = material.customProgramCacheKey;
        material.onBeforeCompile = (shader, renderer) => {
          previous.call(material, shader, renderer);
          Object.assign(shader.uniforms, this.uniforms);
          shader.vertexShader =
            'varying vec3 vCloudShadowPoint;\n' +
            shader.vertexShader.replace(
              '#include <project_vertex>',
              `
            #include <project_vertex>
            vec4 cloudPoint = vec4(transformed, 1.0);
            #ifdef USE_BATCHING
              cloudPoint = batchingMatrix * cloudPoint;
            #endif
            #ifdef USE_INSTANCING
              cloudPoint = instanceMatrix * cloudPoint;
            #endif
            vCloudShadowPoint = (modelMatrix * cloudPoint).xyz;
          `,
            );
          shader.fragmentShader =
            cloudFieldGLSL +
            '\nvarying vec3 vCloudShadowPoint;\n' +
            shader.fragmentShader
              .replace(
                '#include <lights_fragment_begin>',
                THREE.ShaderChunk.lights_fragment_begin,
              )
              .replace(
                'getDirectionalLightInfo( directionalLight, directLight );',
                'getDirectionalLightInfo( directionalLight, directLight ); directLight.color *= hexCloudShadow(vCloudShadowPoint);',
              );
        };
        material.customProgramCacheKey = () =>
          cache.call(material) + '-hex-cloud-shadow-v2';
        material.needsUpdate = true;
      }
    });
  }
}
