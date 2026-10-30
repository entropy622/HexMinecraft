// Photon 6e67b36 lighting/specular_lighting.glsl: GGX VNDF, Smith weighting,
// fixed-material reflection mask and skylight fallback. Host SSR shares the
// existing wet-surface tracer and current-frame HDR, not Iris history buffers.
export const surfaceReflectionGLSL = /* glsl */ `
vec3 surfaceDecodeNormal(vec2 e){
  vec2 f=e*2.0-1.0;vec3 n=vec3(f,1.0-abs(f.x)-abs(f.y));
  float t=clamp(-n.z,0.0,1.0);n.xy+=mix(vec2(t),vec2(-t),step(vec2(0.0),n.xy));
  return normalize(n);
}
vec3 surfaceDecodeAlbedo(vec3 c){
  return mix(c/12.92,pow((c+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),c));
}
bool surfaceReflectiveClass(float mask){
  return mask==8.0||mask==11.0||mask==12.0||mask==13.0;
}
vec3 surfaceVndf(vec3 viewer, float alpha,vec2 hash){
  viewer=normalize(vec3(alpha*viewer.xy,viewer.z));
  float phi=6.2831853*hash.x;
  float cosine=(1.0-hash.y)*(1.0+viewer.z)-viewer.z;
  vec3 reflected=vec3(vec2(cos(phi),sin(phi))*sqrt(clamp(1.0-cosine*cosine,0.0,1.0)),cosine);
  vec3 h=reflected+viewer;
  return normalize(vec3(alpha*h.xy,max(h.z,1e-8)));
}
float surfaceIgn(vec2 p,float frame){
  p+=5.588238*mod(frame,64.0);
  return fract(52.9829189*fract(dot(p,vec2(0.06711056,0.00583715))));
}
vec3 surfaceSky(vec3 direction,float skylight){
  float elevation=asin(clamp(direction.y,-1.0,1.0));
  float azimuth=dot(direction.xz,direction.xz)<1e-10?0.0:atan(direction.z,direction.x);
  vec2 uv=vec2(azimuth/6.28318530718+0.5,0.5+0.5*sign(elevation)*sqrt(abs(elevation)/1.57079632679));
  float visible=pow(clamp(skylight/0.75,0.0,1.0),12.0);
  return textureLod(environmentSky,uv,0.0).rgb*visible;
}
vec3 surfaceEnvironment(vec3 position,vec3 view,vec4 data,vec4 geometry){
  float mask=floor(data.a*255.0+0.5)-1.0;
  if(environmentStrength<=0.0||!surfaceReflectiveClass(mask))return vec3(0.0);
  vec3 albedo=surfaceDecodeAlbedo(data.rgb);
  PhotonSurfaceOptics optical=photonSurfaceOptics(albedo,mask);
  vec3 normal=normalize(mat3(wetView)*surfaceDecodeNormal(geometry.xy));
  if(dot(normal,view)<0.0)normal=-normal;
  float nv=max(0.01,dot(normal,view));
  vec3 tangent=normalize(cross(abs(normal.z)<0.999?vec3(0,0,1):vec3(0,1,0),normal));
  vec3 bitangent=cross(normal,tangent);
  mat3 basis=mat3(tangent,bitangent,normal);
  vec3 localView=vec3(dot(view,tangent),dot(view,bitangent),nv);
  float a2=max(optical.roughness*optical.roughness,1e-8);
  float v1=1.0/(nv+sqrt((-nv*a2+nv)*nv+a2));
  vec3 fresnel=photonSurfaceFresnel(nv,albedo,optical),result=vec3(0.0);
  for(int i=0;i<4;i++){
    float sampleFrame=environmentFrame*4.0+float(i);
    vec2 hash=vec2(surfaceIgn(gl_FragCoord.xy,sampleFrame),surfaceIgn(gl_FragCoord.xy+vec2(97,23),sampleFrame));
    vec3 microfacet=basis*surfaceVndf(localView,max(optical.roughness,0.0001),hash);
    vec3 ray=reflect(-view,microfacet);
    float nl=dot(normal,ray);
    if(nl<=0.000001)continue;
    vec4 hit=reflectedScene(position+normal*0.045,ray);
    vec3 radiance=mix(surfaceSky(normalize(mat3(wetWorld)*ray),geometry.b),hit.rgb,hit.a);
    float v2=0.5/(nv*sqrt((-nl*a2+nl)*nl+a2)+nl*sqrt((-nv*a2+nv)*nv+a2));
    result+=radiance*fresnel*(2.0*nl*v2/v1);
  }
  return max(result*0.25,vec3(0.0))*environmentStrength;
}
`;
