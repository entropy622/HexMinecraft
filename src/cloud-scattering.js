import { SUN_RADIUS } from './sky-transport.js';

// Independent WebGL2 implementation of Photon's cloud optical model:
// finite forward peak, powder response and successively broadened scattering.
// Model reference and limitations: docs/cloud-transport-verification.md.
export const cloudScatteringGLSL = /* glsl */ `
const float cloudPi = 3.14159265359;
const float cloudMinTransmission = 0.005;
vec4 hexCloudOpacity(vec4 integral) {
  // Close the negligible tail discarded by the marcher. Leaving that tail
  // multiplies the HDR solar disk by a false transmission floor in thick cloud.
  // Rescale premultiplied light so a constant source retains unit DC gain.
  float t = clamp(integral.a, 0.0, 1.0);
  return vec4(integral.rgb / (1.0 - min(t, cloudMinTransmission)),
    max(0.0, (t - cloudMinTransmission) / (1.0 - cloudMinTransmission)));
}
float cloudHG(float mu, float g) {
  float squared = g * g;
  float d = max(0.000001, 1.0 + squared - 2.0 * g * mu);
  return (1.0 - squared) / (4.0 * cloudPi * d * sqrt(d));
}
float cloudPointPhase(float mu) {
  // The narrow Klein-Nishina-shaped peak complements the broad droplet lobe.
  float peak = 2600.0 / (2.0 * cloudPi * (1.0 + 2600.0 * (1.0 - mu)) * log(5201.0));
  return 0.8 * max(peak, cloudHG(mu, 0.8)) + 0.2 * cloudHG(mu, -0.2);
}
float hexCloudPhase(float cosine) {
  float mu = clamp(cosine, -1.0, 1.0), sine = sqrt(max(0.0, 1.0 - mu * mu));
  // Equal-weight quadrature over the same finite disk used by the atmosphere.
  // Evaluated once per view ray, before entering the density march.
  const float ring = ${SUN_RADIUS * Math.SQRT1_2};
  float result = 0.0;
  for (int i = 0; i < 4; i++) {
    float azimuth = (float(i) + 0.5) * (0.5 * cloudPi);
    float sampleCosine = mu * cos(ring) + sine * sin(ring) * cos(azimuth);
    result += cloudPointPhase(clamp(sampleCosine, -1.0, 1.0));
  }
  return result * 0.25;
}
// Photon cumulus/altocumulus/cirrus closures. Depth is metres before extinction;
// in particular phase broadening must not use the extinguished optical depth.
// parameters: extinction per metre, single-scattering albedo, stratus, upper shadow.
// The thin deck uses z for its density's source day_factor; its scatter branch
// overrides the stratus-dependent powder/falloff terms below.
// Returns coefficients for direct light (including planet/layer bounce) and sky.
vec2 hexCloudScatter(vec3 depth, float density, float cosine, float phase,
  float opacity, vec4 parameters, int layer, float lightElevation, float cirrusBoost) {
  depth = max(vec3(0.0), depth);
  float extinction = max(parameters.x, 0.000001);
  float albedo = parameters.y, stratus = parameters.z, shadow = parameters.w;
  float forward = clamp(cosine * 0.5 + 0.5, 0.0, 1.0);
  float packedDensity = density * (layer == 1 ? 1.5 + 3.5 * stratus : 1.0 + stratus);
  float powder = cloudPi * packedDensity / (packedDensity + 0.15);
  powder = mix(powder, 1.0, 0.8 * forward * forward);
  float ratio = clamp(extinction * albedo / (layer == 0 ? 0.1 : 0.05), 0.0, 1.0);
  float lifted = ratio * 1.33 / (1.0 + 0.33 * ratio);
  float falloff = (layer == 0 ? 0.55 : 0.5) * mix(lifted, 1.0, forward);
  float amount = extinction * albedo, extinctAmount = extinction;
  vec3 g = pow(vec3(0.6, 0.9, 0.3), vec3(1.0 + depth.x));
  if (layer == 2) {
    powder = mix(8.0 * (1.0 - exp(-40.0 * density)), 1.0, pow(forward, 1.5));
    extinctAmount *= cirrusBoost;
    g = vec3(0.6, 0.9, 0.3);
  }
  const float isotropic = 1.0 / (4.0 * cloudPi);
  float bounced = 0.4 * lightElevation / cloudPi;
  vec2 scattered = vec2(0.0);
  for (int order = 0; order < 8; order++) {
    if (layer == 2 && order >= 4) break;
    vec3 transmission = exp(-depth * extinctAmount);
    scattered.x += amount * phase * transmission.x
      * (layer == 0 ? 1.0 - 0.5 * shadow : 1.0) * (layer == 2 ? powder : 1.0);
    if (layer < 2) {
      scattered.x += amount * isotropic * transmission.z * bounced;
      if (layer == 0) scattered.x += amount * isotropic * transmission.y * shadow * 0.5;
    }
    scattered.y += amount * isotropic * transmission.y;
    amount *= layer == 2 ? 0.5 : falloff * powder;
    extinctAmount *= layer == 0 ? 0.4 : (layer == 1 ? 0.45 : 0.25);
    powder = 0.5 * (powder + sqrt(powder));
    g *= layer == 0 ? 0.8 : (layer == 1 ? 0.7 : 0.5);
    phase = 0.65 * cloudHG(cosine, g.x) + 0.1 * cloudHG(cosine, g.y)
      + 0.25 * cloudHG(cosine, -g.z);
  }
  return scattered * (opacity / extinction);
}
`;
