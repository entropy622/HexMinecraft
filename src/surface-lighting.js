// Application-owned lighting. Three supplies light/shadow uniforms and geometry
// transforms, but neither its Lambert loop nor regex rewrites define shading.
export const surfaceLightingPars = /* glsl */ `
void hexSurfaceDirect(const in IncidentLight directLight,
  const in vec3 geometryNormal, const in vec3 albedo,
  inout ReflectedLight reflectedLight) {
  float dotNL=saturate(dot(geometryNormal,directLight.direction));
  vec3 irradiance=dotNL*directLight.color;
  reflectedLight.directDiffuse+=irradiance*BRDF_Lambert(albedo);
}
`;

export const surfaceLighting = /* glsl */ `
vec3 geometryPosition=-vViewPosition;
vec3 geometryNormal=material.normal;
vec3 geometryViewDir=isOrthographic?vec3(0,0,1):normalize(vViewPosition);
IncidentLight directLight;

#if NUM_POINT_LIGHTS > 0
  PointLight pointLight;
  #if defined(USE_SHADOWMAP) && NUM_POINT_LIGHT_SHADOWS > 0
    PointLightShadow pointLightShadow;
  #endif
  #pragma unroll_loop_start
  for(int i=0;i<NUM_POINT_LIGHTS;i++) {
    pointLight=pointLights[i];
    getPointLightInfo(pointLight,geometryPosition,directLight);
    #if defined(USE_SHADOWMAP) && UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS && (defined(SHADOWMAP_TYPE_PCF) || defined(SHADOWMAP_TYPE_BASIC))
      pointLightShadow=pointLightShadows[i];
      directLight.color*=(directLight.visible&&receiveShadow)?getPointShadow(pointShadowMap[i],pointLightShadow.shadowMapSize,pointLightShadow.shadowIntensity,pointLightShadow.shadowBias,pointLightShadow.shadowRadius,vPointShadowCoord[i],pointLightShadow.shadowCameraNear,pointLightShadow.shadowCameraFar):1.0;
    #endif
    hexSurfaceDirect(directLight,geometryNormal,material.diffuseColor,reflectedLight);
  }
  #pragma unroll_loop_end
#endif

#if NUM_SPOT_LIGHTS > 0
  SpotLight spotLight;
  vec4 spotColor;vec3 spotLightCoord;bool inSpotLightMap;
  #if defined(USE_SHADOWMAP) && NUM_SPOT_LIGHT_SHADOWS > 0
    SpotLightShadow spotLightShadow;
  #endif
  #pragma unroll_loop_start
  for(int i=0;i<NUM_SPOT_LIGHTS;i++) {
    spotLight=spotLights[i];getSpotLightInfo(spotLight,geometryPosition,directLight);
    #if UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS
      #define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
    #elif UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS
      #define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
    #else
      #define SPOT_LIGHT_MAP_INDEX (UNROLLED_LOOP_INDEX-NUM_SPOT_LIGHT_SHADOWS+NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS)
    #endif
    #if SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS
      spotLightCoord=vSpotLightCoord[i].xyz/vSpotLightCoord[i].w;
      inSpotLightMap=all(lessThan(abs(spotLightCoord*2.0-1.0),vec3(1.0)));
      spotColor=texture2D(spotLightMap[SPOT_LIGHT_MAP_INDEX],spotLightCoord.xy);
      directLight.color=inSpotLightMap?directLight.color*spotColor.rgb:directLight.color;
    #endif
    #undef SPOT_LIGHT_MAP_INDEX
    #if defined(USE_SHADOWMAP) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS
      spotLightShadow=spotLightShadows[i];
      directLight.color*=(directLight.visible&&receiveShadow)?getShadow(spotShadowMap[i],spotLightShadow.shadowMapSize,spotLightShadow.shadowIntensity,spotLightShadow.shadowBias,spotLightShadow.shadowRadius,vSpotLightCoord[i]):1.0;
    #endif
    hexSurfaceDirect(directLight,geometryNormal,material.diffuseColor,reflectedLight);
  }
  #pragma unroll_loop_end
#endif

#if NUM_SUN_LIGHTS > 0
  SunLight sunLight;
  #if defined(USE_SHADOWMAP) && NUM_SUN_LIGHT_SHADOWS > 0
    SunLightShadow sunLightShadow;
  #endif
  #pragma unroll_loop_start
  for(int i=0;i<NUM_SUN_LIGHTS;i++) {
    sunLight=sunLights[i];getSunLightInfo(sunLight,directLight);
    #if defined(USE_SHADOWMAP) && UNROLLED_LOOP_INDEX < NUM_SUN_LIGHT_SHADOWS
      sunLightShadow=sunLightShadows[i];
      directLight.color*=(directLight.visible&&receiveShadow)?getSunShadow(sunShadowMap[i],sunLightShadow,UNROLLED_LOOP_INDEX):1.0;
    #endif
    hexSurfaceDirect(directLight,geometryNormal,material.diffuseColor,reflectedLight);
  }
  #pragma unroll_loop_end
#endif

#if NUM_DIR_LIGHTS > 0
  DirectionalLight directionalLight;
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
    DirectionalLightShadow directionalLightShadow;
  #endif
  #pragma unroll_loop_start
  for(int i=0;i<NUM_DIR_LIGHTS;i++) {
    {
    directionalLight=directionalLights[i];
    getDirectionalLightInfo( directionalLight, directLight );
    #include <hex_directional_filter>
    #include <hex_directional_capture>
    vec3 geometricIncident=directLight.color;
    #ifdef HEX_WATER_RECEIVER
      vec3 waterLightDirection=inverseTransformDirection(directLight.direction,viewMatrix);
      vec3 waterBounceResponse;
      directLight.color*=waterSunResponse(vLightPosition,inverseTransformDirection(normal,viewMatrix),waterLightDirection,material.squaredSky,waterBounceResponse);
      geometricIncident*=waterBounceResponse;
      directLight.direction=normalize((viewMatrix*vec4(waterLightDirection,0.0)).xyz);
    #else
      directLight.color*=smoothstep(0.45,0.95,material.squaredSky);
    #endif
    #if defined(USE_SHADOWMAP) && UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS
      directionalLightShadow=directionalLightShadows[i];
      float geometricShadow=(directLight.visible&&receiveShadow)?getShadow(directionalShadowMap[i],directionalLightShadow.shadowMapSize,directionalLightShadow.shadowIntensity,directionalLightShadow.shadowBias,directionalLightShadow.shadowRadius,vDirectionalShadowCoord[i]):1.0;
      directLight.color*=geometricShadow;
      float geometricAO=clamp(vAmbientOcclusion,0.0,1.0);
      float geometricUp=max(0.0,inverseTransformDirection(geometryNormal,viewMatrix).y);
      reflectedLight.indirectDiffuse+=material.diffuseColor*geometricIncident*
        (0.033*surfaceBounce*(1.0-geometricShadow)*(1.0-0.1*geometricUp)*sqrt(geometricAO)*pow(clamp(material.squaredSky,0.0,1.0),2.0));
    #endif
    if(surfaceSpecular>0.5){
      float surfaceLoV=clamp(dot(directLight.direction,geometryViewDir),-1.0,1.0);
      reflectedLight.directSpecular+=directLight.color*photonSurfaceHighlight(material.diffuseColor,material.optical,
        dot(geometryNormal,directLight.direction),max(0.0,dot(geometryNormal,geometryViewDir)),surfaceLoV,sqrt(max(0.0,0.5+0.5*surfaceLoV)),surfaceLightRadius);
    }
    #ifdef HEX_LEAF_PRIMARY_SSS
      directLight.color*=1.0-0.5*clamp(leafSssAmount,0.0,1.0);
    #endif
    float surfaceNoL=clamp(dot(geometryNormal,directLight.direction),0.0,1.0);
    directLight.color*=mix(1.0,1.25/(1.0+0.25*surfaceNoL)*clamp(material.geometryAO,0.0,1.0),surfaceDiffuse);
    hexSurfaceDirect(directLight,geometryNormal,material.diffuseColor,reflectedLight);
    }
  }
  #pragma unroll_loop_end
#endif

vec3 irradiance=vec3(0.025+nightVision*0.75)+material.squaredBlock*3.8;
#if defined(USE_LIGHT_PROBES)
  #include <hex_sky_irradiance>
#endif
#if NUM_HEMI_LIGHTS > 0
  #pragma unroll_loop_start
  for(int i=0;i<NUM_HEMI_LIGHTS;i++) {
    irradiance+=material.squaredSky*getHemisphereLightIrradiance(hemisphereLights[i],geometryNormal);
  }
  #pragma unroll_loop_end
#endif
#ifdef USE_LIGHT_PROBES_GRID
  vec3 probeWorldPos=((vec4(geometryPosition,1.0)-viewMatrix[3])*viewMatrix).xyz;
  vec3 probeWorldNormal=transformNormalByInverseViewMatrix(geometryNormal,viewMatrix);
  irradiance+=getLightProbeGridIrradiance(probeWorldPos,probeWorldNormal);
#endif
#ifdef USE_LIGHTMAP
  irradiance+=texture2D(lightMap,vLightMapUv).rgb*lightMapIntensity;
#endif
vec3 iblIrradiance=vec3(0);
#if defined(USE_ENVMAP) && defined(ENVMAP_TYPE_CUBE_UV)
  iblIrradiance+=getIBLIrradiance(geometryNormal);
#endif
irradiance+=iblIrradiance;
reflectedLight.indirectDiffuse+=irradiance*BRDF_Lambert(material.diffuseColor);
#if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
  reflectedLight.directDiffuse*=vColor.rgb;
  reflectedLight.indirectDiffuse*=vColor.rgb;
#endif
reflectedLight.directDiffuse *= vAmbientOcclusion;
reflectedLight.indirectDiffuse *= vAmbientOcclusion;
#include <hex_after_indirect>
float surfaceMetalDiffuse=mix(1.0,0.5,material.optical.metal);
reflectedLight.directDiffuse*=surfaceMetalDiffuse;
reflectedLight.indirectDiffuse*=surfaceMetalDiffuse;
#include <hex_after_diffuse>
`;
