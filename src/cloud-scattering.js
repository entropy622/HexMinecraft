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
vec3 hexCloudScatter(vec3 sunlight, vec3 skylight, vec3 groundlight,
  vec3 opticalDepth, float density, float cosine, float phase,
  float opacity, float albedo, float stratus) {
  vec3 tau = max(vec3(0.0), opticalDepth);
  float forward = clamp(cosine * 0.5 + 0.5, 0.0, 1.0);
  float packedDensity = density * (1.0 + stratus);
  float powder = cloudPi * packedDensity / (packedDensity + 0.15);
  powder = mix(powder, 1.0, 0.8 * forward * forward);
  float amount = albedo, extinction = 1.0;
  vec3 g = pow(vec3(0.6, 0.9, 0.3), vec3(1.0 + tau.x));
  vec3 scattered = vec3(0.0);
  for (int order = 0; order < 8; order++) {
    vec3 transmission = exp(-tau * extinction);
    scattered += amount * (sunlight * (phase * transmission.x)
      + skylight * transmission.y + groundlight * transmission.z);
    // Later orders travel further, lose directionality and retain absorption.
    // Powder is an artistic closure, not a spectral multiple-scattering solver.
    amount *= albedo * 0.55 * powder;
    extinction *= 0.4;
    powder = 0.5 * (powder + sqrt(powder));
    g *= 0.8;
    phase = 0.65 * cloudHG(cosine, g.x) + 0.1 * cloudHG(cosine, g.y)
      + 0.25 * cloudHG(cosine, -g.z);
  }
  return scattered * opacity;
}
`;
