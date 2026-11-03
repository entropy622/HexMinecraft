// The application owns this stage order. Three's reusable transform, texture,
// normal and shadow declarations remain host adapters, not lighting templates.
export const surfaceVertex = /* glsl */ `
#define LAMBERT
varying vec3 vViewPosition;
attribute vec4 biomeTint;varying vec4 vBiomeTint;
attribute float ambientOcclusion;varying float vAmbientOcclusion;
attribute float surfaceOptics;varying float vSurfaceOptics;
attribute float skylight,rainExposure,surfacePorosity;attribute vec3 blocklight;
varying vec3 vBlockLight;varying float vSkylight,vWetTop,vPorosity;varying vec3 vLightPosition;
#include <hex_vertex_pars>
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main(){
  #include <uv_vertex>
  #include <color_vertex>
  #include <morphinstance_vertex>
  #include <morphcolor_vertex>
  #include <batching_vertex>
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <normal_vertex>
  #include <begin_vertex>
  vSkylight=skylight;vBlockLight=blocklight;vPorosity=surfacePorosity;
  vBiomeTint=biomeTint;vAmbientOcclusion=clamp(ambientOcclusion,0.0,1.0);vSurfaceOptics=surfaceOptics;
  vWetTop=rainExposure*max(0.0,normal.y);
  vLightPosition=(modelMatrix*vec4(position,1.0)).xyz;
  #include <hex_vertex_begin>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <displacementmap_vertex>
  #include <project_vertex>
  #include <hex_vertex_project>
  #include <logdepthbuf_vertex>
  #include <clipping_planes_vertex>
  vViewPosition=-mvPosition.xyz;
  #include <worldpos_vertex>
  #include <envmap_vertex>
  #include <shadowmap_vertex>
  #include <fog_vertex>
}
`;

export const surfaceFragment = /* glsl */ `
#define LAMBERT
#define HEX_GEOMETRIC_SHADE
#include <hex_defines>
uniform vec3 diffuse,emissive;uniform float opacity;
varying vec3 vViewPosition;
varying float vAmbientOcclusion,vSurfaceOptics;
varying vec3 vBlockLight;varying float vSkylight,vWetTop,vPorosity;varying vec3 vLightPosition;
uniform float terrainWetness,terrainRain,nightVision,surfaceDiffuse,surfaceSpecular,surfaceLightRadius;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <hex_material_pars>
#include <hex_fragment_pars>
#include <normal_pars_fragment>
#include <hex_shadow_pars>
#include <hex_shadow_helpers>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
#include <hex_record_pars>
void main(){
  vec4 diffuseColor=vec4(diffuse,opacity);
  #include <clipping_planes_fragment>
  ReflectedLight reflectedLight=ReflectedLight(vec3(0),vec3(0),vec3(0),vec3(0));
  vec3 totalEmissiveRadiance=emissive;
  #include <logdepthbuf_fragment>
  #include <map_fragment>
  #ifdef USE_COLOR_ALPHA
    diffuseColor.a*=vColor.a;
  #endif
  #include <alphamap_fragment>
  #include <alphatest_fragment>
  #include <hex_after_alpha>
  #include <alphahash_fragment>
  #include <specularmap_fragment>
  #include <normal_fragment_begin>
  #include <normal_fragment_maps>
  #include <emissivemap_fragment>
  #ifdef USE_MAP
    diffuseColor.rgb=biomeSurfaceTint(diffuseColor.rgb,vMapUv);
  #endif
  #include <hex_material_decode>
  SurfaceData material=SurfaceData(diffuseColor.rgb,normal,clamp(vAmbientOcclusion,0.0,1.0),surfaceSkyLevel,surfaceBlockLevel,surfaceOptical,totalEmissiveRadiance);
  #ifdef HEX_SURFACE_RECORD_PASS
    #include <hex_record_output>
  #else
    #include <hex_lighting>
    #include <aomap_fragment>
    vec3 outgoingLight=reflectedLight.directDiffuse+reflectedLight.indirectDiffuse+material.emission;
    #include <envmap_fragment>
    outgoingLight+=reflectedLight.directSpecular;
    #include <hex_output>
    #include <opaque_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    #include <premultiplied_alpha_fragment>
    #include <dithering_fragment>
  #endif
}
`;
