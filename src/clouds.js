import * as THREE from 'three';
import { axialToWorld, worldToAxial, noise } from './core.js';
import { skyRadianceGLSL } from './sky-transport.js';
import {
  CLOUD_RADIUS,
  CLOUD_BASE,
  CLOUD_NOISE_SCALE,
  CLOUD_PLANET_RADIUS,
  cloudDensity,
  cloudNoiseData,
  cloudWorleyData,
  cloudWeather,
  cloudFieldGLSL,
} from './cloud-field.js';

const CHUNK = 8,
  CAPACITY = 49 * CHUNK * CHUNK;
export class HexClouds {
  constructor(scene, clearIrradiance) {
    this.scene = scene;
    this.clearIrradiance = clearIrradiance;
    this.noiseSeed = 0;
    this.noise = new THREE.DataTexture(
      cloudNoiseData(0),
      127,
      127,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    this.noise.needsUpdate = true;
    this.worley = new THREE.Data3DTexture(new Uint8Array(64 ** 3), 64, 64, 64);
    this.worley.format = THREE.RedFormat;
    this.worley.type = THREE.UnsignedByteType;
    this.worley.minFilter = this.worley.magFilter = THREE.LinearFilter;
    this.worley.wrapS =
      this.worley.wrapT =
      this.worley.wrapR =
        THREE.RepeatWrapping;
    this.worley.unpackAlignment = 1;
    this.worley.needsUpdate = true;
    this.uniforms = {
      cloudNoise: { value: this.noise },
      cloudSeedNoise: { value: this.noise },
      cloudNoiseScale: { value: CLOUD_NOISE_SCALE },
      cloudCoverageReady: { value: 0 },
      cloudCoverageOrigin: {
        value: [new THREE.Vector2(), new THREE.Vector2()],
      },
      cloudWorley: { value: this.worley },
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
      cloudGround: { value: new THREE.Color() },
      cloudDirect: { value: new THREE.Color() },
      cloudAlbedo: { value: 0.995 },
      cloudFar: { value: 130 },
      cloudLayers: {
        value: [
          new THREE.Vector4(CLOUD_BASE, 60, 0.5, 0),
          new THREE.Vector4(160, 24, 0.4, 0),
          new THREE.Vector4(300, 3.5, 0.4, 0),
        ],
      },
      cloudLayerWind: {
        value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()],
      },
      cloudCurvatureOrigin: { value: new THREE.Vector2() },
      cloudShear: { value: 1 },
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
        ${skyRadianceGLSL}
        uniform vec3 cloudAmbient; uniform vec3 cloudDirect;
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
          vec3 airT = hexAirTransmittance(length(vCloudWorld - cameraPosition), ray);
          gl_FragColor = vec4(color * airT + hexSkyRadiance(ray) * (1.0 - airT), 1.0);
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
  prepare({ world, camera, time, rain, storm, quality, enabled }) {
    const u = this.uniforms,
      active = world.dimension === 'overworld' && enabled;
    this.mesh.visible = active && quality < 1.7;
    u.cloudEnabled.value = active && quality >= 1 ? 1 : 0;
    u.cloudVolumetric.value = active && quality >= 1.7 ? 1 : 0;
    if (!active) return;
    if (this.noiseSeed !== world.seed) {
      this.noiseSeed = world.seed;
      this.noise.image.data.set(cloudNoiseData(this.noiseSeed));
      this.noise.needsUpdate = true;
    }
    if (quality >= 1.7 && this.worleySeed !== world.seed) {
      this.worleySeed = world.seed;
      this.worley.image.data.set(cloudWorleyData(world.seed));
      this.worley.needsUpdate = true;
    }
    // Sample the biome's existing temperature/humidity noises in fractional
    // axial coordinates. Rounded cell or biome labels would move the whole
    // sky in visible steps when the player crosses an otherwise seamless edge.
    const climateQ = camera.position.x / Math.sqrt(3) - camera.position.z / 3;
    const climateR = camera.position.z / 1.5;
    const climate = cloudWeather(
      world.seed,
      time,
      noise(climateQ * 0.017, climateR * 0.017, world.seed + 140),
      noise(climateQ * 0.019, climateR * 0.019, world.seed + 76),
      rain,
      storm,
    );
    u.cloudLayers.value[0].set(
      CLOUD_BASE,
      60 + rain * 12 + storm * 8,
      climate.coverage[0],
      climate.stratus,
    );
    u.cloudLayers.value[1].set(
      160,
      24 + climate.humidity * 6 + storm * 8,
      climate.coverage[1],
      climate.altoStratus,
    );
    u.cloudLayers.value[2].set(300, 3.5, climate.coverage[2], climate.stratus);
    u.cloudLayerWind.value.forEach((wind, layer) =>
      wind.fromArray(climate.winds[layer]),
    );
    u.cloudWind.value.copy(u.cloudLayerWind.value[0]);
    u.cloudCurvatureOrigin.value.set(camera.position.x, camera.position.z);
    u.cloudShear.value = climate.shear;
    u.cloudThreshold.value = 1 - climate.coverage[0];
    u.cloudHeight.value =
      quality >= 1.7
        ? u.cloudLayers.value[0].y / 1.6
        : 2.5 + rain * 6 + storm * 2.5;
    // A local tangent plane is enough for this flat voxel world. Reach the
    // highest band's horizon without extending the terrain camera or chunks.
    // Keep distances representable in the existing half-float history MRT.
    const highest = u.cloudLayers.value[2];
    const skyHeight = Math.max(
      Math.abs(highest.x + highest.y - camera.position.y),
      Math.abs(CLOUD_BASE - camera.position.y),
    );
    u.cloudFar.value =
      quality >= 1.7
        ? Math.min(
            60000,
            Math.sqrt(skyHeight * (2 * CLOUD_PLANET_RADIUS + skyHeight)) + 1000,
          )
        : quality < 1
          ? 87
          : 130;
    u.cloudAlbedo.value = 0.995 - rain * 0.18 - storm * 0.05;
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
  frame({ sun, flash, rain }) {
    const u = this.uniforms,
      up = this.clearIrradiance.up,
      down = this.clearIrradiance.down;
    u.cloudLightDirection.value
      .subVectors(sun.position, sun.target.position)
      .normalize();
    u.cloudShade.value = (0.62 + rain * 0.12) * Math.min(1, sun.intensity * 2);
    // Cloud illumination uses clear-sky irradiance, never its own cloudy SH.
    u.cloudAmbient.value
      .setRGB(
        Math.max(0, up.r) / Math.PI,
        Math.max(0, up.g) / Math.PI,
        Math.max(0, up.b) / Math.PI,
      )
      .addScalar(flash * 0.8);
    u.cloudGround.value.setRGB(
      Math.max(0, down.r) / Math.PI,
      Math.max(0, down.g) / Math.PI,
      Math.max(0, down.b) / Math.PI,
    );
    u.cloudDirect.value.copy(sun.color).multiplyScalar(sun.intensity);
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
          cache.call(material) + '-hex-cloud-shadow-v7';
        material.needsUpdate = true;
      }
    });
  }
}
