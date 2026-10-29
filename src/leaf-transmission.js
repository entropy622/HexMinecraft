// The nearest shadow depth bounds the actual light path. The existing optical
// volume then distinguishes leaf thickness from walls along that path; otherwise
// a nearby opaque roof would look like a thin, transmitting leaf.
export const leafTransmissionGLSL = /* glsl */ `
vec3 leafLightTransmission = vec3(1.0);
uniform float leafVolumeTop;
uniform float leafSssAmount;
vec3 leafFarTransmittance(vec3 albedo, float fade) {
  vec3 start=vLightPosition+leafSunDirection*0.015;
  ivec3 first=lightCell(start);
  if(leafSunDirection.y<=0.00001)return vec3(0.0);
  bool insideColumns=first.y>=0 && first.z>=0 && first.y<int(entityLightSize.y) && first.z<int(entityLightSize.z);
  // The world's top is known open sky; lateral/unloaded bounds stay unknown.
  if(float(first.x)>=entityLightSize.x && insideColumns)return leafBeerTransmission(albedo,0.06*(1.0-fade),leafSssAmount);
  if(!insideLightVolume(first))return vec3(0.0);
  float top=min(leafVolumeTop,entityLightOrigin.y+entityLightSize.x);
  float reach=max(0.0,(top-start.y)/leafSunDirection.y);
  float distance=0.0,thickness=0.06;
  bool complete=reach<=0.001;
  for(int i=0;i<128;i++) {
    if(distance>=reach) {complete=true;break;}
    vec3 point=start+leafSunDirection*distance;
    ivec3 cell=lightCell(point);
    if(!insideLightVolume(cell)) return vec3(0.0);
    float medium=mod(readLightCell(cell).a,16.0);
    if(medium<11.5 || medium==13.0) return vec3(0.0);
    float segment=min(reach-distance,lightCellExit(point,cell,leafSunDirection));
    if(medium==12.0)thickness+=segment;
    distance+=segment+0.002;
  }
  if(!complete && distance<reach)return vec3(0.0);
  return leafBeerTransmission(albedo,thickness*(1.0-fade),leafSssAmount);
}
vec3 leafNearTransmittance(vec3 albedo, vec3 p, float fade) {
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0 && defined(SHADOWMAP_TYPE_BASIC)
    // Thickness uses the unoffset receiver. Ordinary shadow normal bias moves
    // the sample ray outside a leaf's cell and must not classify it as a wall.
    float depth = softShadowDepth(directionalShadowMap[0], p.xy);
    float reach = max(0.0, (p.z - depth) * softShadowFrustum.z);
    if (reach > 48.0) return vec3(0.0);
    vec3 start = vLightPosition + leafSunDirection * 0.015;
    // A shadow-casting slab, fence or model is opaque even when the volume
    // cannot represent its subcell silhouette. Probe just inside its front face.
    if (reach > 0.08) {
      ivec3 blocker = lightCell(start + leafSunDirection * max(0.0, reach - 0.05));
      if (!insideLightVolume(blocker)) return vec3(0.0);
      float medium=mod(readLightCell(blocker).a,16.0);
      bool transmitting=medium==12.0;
      #ifdef HEX_THIN_PLANT
        // Crossed flower planes can shadow one another inside their own air
        // cell. Keep their micro-thickness; opaque and partial blocks still stop SSS.
        transmitting=transmitting || (medium==15.0 && all(equal(blocker,lightCell(start))));
      #endif
      if (!transmitting) return vec3(0.0);
    }
    float distance = 0.0, thickness = 0.06;
    bool complete = reach <= 0.001;
    for (int i = 0; i < 48; i++) {
      if (distance >= reach) { complete = true; break; }
      vec3 point = start + leafSunDirection * distance;
      ivec3 cell = lightCell(point);
      if (!insideLightVolume(cell)) return vec3(0.0);
      float medium = mod(readLightCell(cell).a, 16.0);
      if (medium < 11.5 || medium == 13.0) return vec3(0.0);
      float segment = min(reach - distance, lightCellExit(point, cell, leafSunDirection));
      if (medium == 12.0) thickness += segment;
      distance += segment + 0.002;
    }
    if (!complete && distance < reach) return vec3(0.0);
    return leafBeerTransmission(albedo,thickness*(1.0-fade),leafSssAmount);
  #else
    return vec3(0.0);
  #endif
}
vec3 leafTransmittance(vec3 albedo, float NoL, float ao, float ambientSss) {
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0 && defined(SHADOWMAP_TYPE_BASIC)
    vec4 shadowPoint=softShadowMatrix*vec4(vLightPosition,1.0);
    vec3 p=shadowPoint.xyz/shadowPoint.w;
    #ifdef USE_REVERSED_DEPTH_BUFFER
      p.z=1.0-p.z;
    #endif
    float fade=leafShadowRangeFade(p);
    vec3 transmission=vec3(0.0);
    if(fade>=1.0) transmission=leafFarTransmittance(albedo,fade);
    else {
      transmission=leafNearTransmittance(albedo,p,fade);
      if(fade>0.0)transmission=mix(transmission,leafFarTransmittance(albedo,fade),fade);
    }
    return transmission*leafRangeResponse(fade,NoL,ao,ambientSss);
  #else
    return vec3(0.0);
  #endif
}
`;
