// Photon 6e67b36 misc/raytracer.glsl, adapted to the host's current-frame
// projection (already jittered), standard WebGL depth and explicit UV bounds.
export const reflectionTraceGLSL = /* glsl */ `
vec3 reflectionProject(mat4 projection,vec3 point){
  vec4 clip=projection*vec4(point,1.0);return clip.xyz/clip.w*0.5+0.5;
}
bool reflectionInside(vec3 p){return all(greaterThanEqual(p,vec3(0.0)))&&all(lessThanEqual(p,vec3(1.0)));}
bool reflectionDepthHit(float depth,vec3 ray,float tolerance){
  return depth<ray.z&&abs(tolerance-(ray.z-depth))<tolerance;
}
bool reflectionTrace(sampler2D depthMap,mat4 projection,vec3 origin,vec3 direction,
    float dither,int steps,int refinements,out vec3 hit){
  hit=vec3(0.0);
  if(direction.z>0.0&&direction.z>=-origin.z)return false;
  vec3 start=reflectionProject(projection,origin);
  if(!reflectionInside(start))return false;
  vec3 delta=reflectionProject(projection,origin+direction)-start;
  if(dot(delta,delta)<1e-16)return false;
  vec3 screenDirection=normalize(delta);
  // Clip to actual [0,1] boundaries, including rays towards the left/bottom.
  vec3 reach=abs(step(vec3(0.0),screenDirection)-start)/max(abs(screenDirection),vec3(1e-8));
  float distance=min(reach.x,min(reach.y,reach.z));
  vec3 advance=screenDirection*(distance/float(steps));
  vec3 ray=start+clamp(dither,0.0,1.0)*advance+length(1.0/vec2(textureSize(depthMap,0)))*screenDirection;
  float tolerance=max(abs(advance.z)*3.0,0.02/max(origin.z*origin.z,1e-8));
  bool found=false;
  for(int i=0;i<steps;i++){
    if(!reflectionInside(ray))return false;
    float depth=texelFetch(depthMap,clamp(ivec2(ray.xy*vec2(textureSize(depthMap,0))),ivec2(0),textureSize(depthMap,0)-1),0).r;
    if(reflectionDepthHit(depth,ray,tolerance)){found=true;break;}
    ray+=advance;
  }
  if(!found)return false;
  for(int i=0;i<refinements;i++){
    advance*=0.5;
    if(!reflectionInside(ray))return false;
    float depth=texelFetch(depthMap,clamp(ivec2(ray.xy*vec2(textureSize(depthMap,0))),ivec2(0),textureSize(depthMap,0)-1),0).r;
    ray+=reflectionDepthHit(depth,ray,tolerance)?-advance:advance;
  }
  if(!reflectionInside(ray))return false;
  float finalDepth=textureLod(depthMap,ray.xy,0.0).r;
  if(finalDepth>=0.999999||abs(ray.z-finalDepth)>2.0*tolerance)return false;
  hit=ray;return true;
}
`;
