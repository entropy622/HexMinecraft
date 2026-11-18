// Inside the directional map the depth test owns occlusion. The lightmap
// suppresses leaks in darkness; outside coverage it resumes the host fallback.
export const directSkyGate = (squaredSky) => `
float directSkyGate = smoothstep(0.45, 0.95, ${squaredSky});
#if defined(USE_SHADOWMAP) && UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS
  if (receiveShadow) {
    vec4 coord = vDirectionalShadowCoord[ i ];
    vec3 edge = abs(2.0 * coord.xyz / coord.w - 1.0);
    float outside = smoothstep(0.90, 1.0, max(max(edge.x, edge.y), edge.z));
    float leakGate = smoothstep(0.0, 2.0 / 15.0, sqrt(clamp(${squaredSky},0.0,1.0)));
    directSkyGate = mix(leakGate, directSkyGate, outside);
  }
#endif
`;
