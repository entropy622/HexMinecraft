import { CLOUD_METRES_PER_UNIT } from './cloud-optics.js';
// Shared production cloud transport for the camera and omnidirectional sky.
// Callers provide the same cloud field, clear atmosphere and lighting inputs.
export const cloudWeatherAerialGLSL = /* glsl */ `
vec3 hexCloudWeatherAerial(vec3 scattering,float transmission,vec3 clearSky,
  vec3 airTransmission,vec3 weatherSky,float rain,float morningEvening){
  vec3 clear=mix(clearSky,weatherSky,rain*mix(1.0,0.9,morningEvening));
  vec3 airT=mix(airTransmission,vec3(airTransmission.r),0.8*rain);
  return scattering*airT+clear*(1.0-airT)*(1.0-transmission);
}
`;
export const cloudIntegralGLSL = /* glsl */ `
${cloudWeatherAerialGLSL}
uniform float skyFlash;
vec4 integrateLayer(vec3 origin, vec3 direction, vec2 span, int layer, float jitter, out float apparent) {
  apparent = 0.0;
  if (span.y <= span.x) return vec4(0.0, 0.0, 0.0, 1.0);
  float horizon = 1.0 - abs(direction.y);
  int steps = layer == 0 ? int(mix(24.0, 40.0, horizon)) : (layer == 1 ? int(mix(12.0, 20.0, horizon)) : 6);
  // A deep oblique path needs finer intervals than the former thin deck.
  // Bound work at the horizon, while resolving nearby density and wisps in
  // world units instead of relying on history to hide skipped cloud bodies.
  if (layer < 2) steps = max(steps, min(layer == 0 ? 80 : 48,
    int(ceil((span.y - span.x) / (layer == 0 ? 2.0 : 1.5)))));
  float stepLength = (span.y - span.x) / float(steps);
  float transmission = 1.0;
  vec3 scattering = vec3(0.0);
  bool moonlit = skySunDirection.y < (layer == 0 ? -0.04 : (layer == 1 ? -0.045 : -0.049));
  vec3 lightDirection = skySunDirection * (moonlit ? -1.0 : 1.0);
  float cosine = dot(direction,lightDirection), phase = hexCloudPhase(cosine);
  vec3 entry = origin + direction * span.x;
  vec3 radial = normalize(vec3(entry.x-cloudCurvatureOrigin.x,
    entry.y+hexCloudPlanet,entry.z-cloudCurvatureOrigin.y));
  vec3 sunlight = photonCloudLight(dot(radial,lightDirection),hexCloudAltitude(entry),moonlit);
  if(layer==1)sunlight*=cloudOptics[1].w;
  // sky_color in Photon is tau times the raw tilted-sky/weather mixture. It
  // never reads the cloudy/fogged environment currently being constructed.
  vec3 skylight = (cloudFogColor + vec3(skyFlash * 0.8)) * (2.0 * cloudPi);
  vec4 optics=cloudOptics[layer];
  float cirrusBoost=cloudOptics[2].w;
  for (int i = 0; i < 80; i++) {
    if (i >= steps) break;
    float distance = span.x + (float(i) + jitter) * stepLength;
    vec3 position = origin + direction * distance;
    float fade = 1.0 - smoothstep(cloudFar * 0.72, cloudFar, length(position.xz - origin.xz));
    float density = hexCloudLayerDensity(position, layer) * fade;
    if (density < 0.0001) continue;
    vec2 lightSpan = hexCloudInterval(position, lightDirection, layer, cloudFar);
    float depthSun = hexCloudLayerOpticalDepth(position, lightDirection,
      min(cloudLayers[layer].y * 4.0, lightSpan.y), layer, 6);
    vec2 skySpan = hexCloudInterval(position, vec3(0,1,0), layer, cloudLayers[layer].y);
    float depthSky = layer==2 ? 0.33*cloudLayers[2].y*density :
      hexCloudLayerOpticalDepth(position, vec3(0,1,0), skySpan.y, layer, 2);
    float height = clamp(hexCloudAltitude(position) - cloudLayers[layer].x, 0.0, cloudLayers[layer].y);
    // A local-density estimate for ground escape avoids another secondary ray.
    float depthGround = height * mix(density, 1.0, clamp(2.0 * height / cloudLayers[layer].y - 1.0, 0.0, 1.0));
    float attenuation = exp(-${CLOUD_METRES_PER_UNIT.toFixed(1)} * optics.x * density * stepLength);
    float weight = transmission * (1.0 - attenuation);
    vec2 light=hexCloudScatter(${CLOUD_METRES_PER_UNIT.toFixed(1)}*vec3(depthSun,depthSky,depthGround),density,cosine,
      phase,1.0-attenuation,optics,layer,lightDirection.y,cirrusBoost);
    scattering += transmission * (sunlight*light.x+skylight*light.y*(layer==2?1.41:1.0));
    apparent += weight * distance;
    transmission *= attenuation;
    if (transmission < cloudMinTransmission) break;
  }
  apparent = transmission < 0.9999 ? apparent / (1.0 - transmission) : 0.0;
  return vec4(scattering, transmission);
}

vec4 hexCloudRay(vec3 origin,vec3 direction,float distance,float jitter,out float firstDistance,out float firstLayer){
  firstDistance=0.0;firstLayer=-1.0;vec4 result=vec4(0,0,0,1);
  vec2 spans[3]; int order[3]; bool hasCloudSpan = false;
  for (int layer = 0; layer < 3; layer++) {
    spans[layer] = hexCloudInterval(origin, direction, layer, min(distance, cloudFar));
    hasCloudSpan = hasCloudSpan || spans[layer].y > spans[layer].x;
    order[layer] = layer;
  }
  if (!hasCloudSpan) return result;
  float rain=clamp((skyAerosol-1.0)/5.0,0.0,1.0);
  float edge=skySunDirection.x==0.0?0.0:photonMorningEveningWeight();
  // The camera may be below, inside, between or above the bands.
  for (int a = 0; a < 2; a++) for (int b = 0; b < 2; b++) {
    if (spans[order[b]].x > spans[order[b + 1]].x) {
      int swap = order[b]; order[b] = order[b + 1]; order[b + 1] = swap;
    }
  }
  for (int n = 0; n < 3; n++) {
    int layer = order[n];
    float apparent;
    vec4 integral = integrateLayer(origin, direction, spans[layer], layer, jitter, apparent);
    if (apparent <= 0.0) continue;
    // Transport each layer's premultiplied radiance through the same molecular
    // atmosphere as the visible sky. Air adds light only over cloud opacity;
    // cloud transmission still composites the already atmospheric background.
    vec3 airT = hexAirTransmittance(apparent, direction);
    integral.rgb=hexCloudWeatherAerial(integral.rgb,integral.a,hexSkyRadiance(direction),
      airT,cloudFogColor,rain,edge);
    if (firstDistance <= 0.0) { firstDistance = apparent; firstLayer = float(layer); }
    result.rgb += result.a * integral.rgb;
    result.a *= integral.a;
    if (result.a < cloudMinTransmission) break;
  }
  return hexCloudOpacity(result);
}
`;
