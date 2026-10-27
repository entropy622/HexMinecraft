import {
  HalfFloatType,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const vertexShader = /* glsl */ `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const halton = (index, base) => {
  let result = 0,
    fraction = 1;
  while (index > 0) {
    fraction /= base;
    result += fraction * (index % base);
    index = Math.floor(index / base);
  }
  return result;
};
const samples = Array.from(
  { length: 8 },
  (_, i) => new Vector2(halton(i + 1, 2), halton(i + 1, 3)),
);
const mean = samples
  .reduce((sum, p) => sum.add(p), new Vector2())
  .multiplyScalar(1 / samples.length);
samples.forEach((p) => p.sub(mean));

// Independent native-resolution TAA: HDR history precedes bloom/exposure.
// Alpha holds linear depth: zero=sky, negative=reactive, positive=stable.
export class TemporalResolvePass extends Pass {
  constructor(renderer, camera, frame, protection) {
    super();
    this.camera = camera;
    this.frame = frame;
    this.width = this.height = 1;
    this.history = [0, 1].map(
      () =>
        new WebGLRenderTarget(1, 1, {
          type: HalfFloatType,
          depthBuffer: false,
        }),
    );
    this.projection = new Matrix4();
    this.inverse = new Matrix4();
    this.previousView = new Matrix4();
    this.previousProjection = new Matrix4();
    this.previousPosition = new Vector3();
    this.previousRotation = new Quaternion();
    this.jitter = new Vector2();
    this.material = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      vertexShader,
      uniforms: {
        sceneColor: { value: null },
        sceneDepth: { value: frame.depthTexture },
        protection: { value: protection.target.texture },
        historyColor: { value: null },
        resolution: { value: new Vector2(1, 1) },
        jitter: { value: this.jitter },
        inverseProjection: { value: camera.projectionMatrixInverse },
        cameraWorld: { value: camera.matrixWorld },
        previousView: { value: this.previousView },
        previousProjection: { value: this.previousProjection },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
        ready: { value: false },
        frames: { value: 0 },
      },
      fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D sceneColor,sceneDepth,protection,historyColor;
      uniform vec2 resolution,jitter;
      uniform mat4 inverseProjection,cameraWorld,previousView,previousProjection;
      uniform float cameraNear,cameraFar,frames;
      uniform bool ready;
      vec3 compressColor(vec3 color){color=max(color,vec3(0.0));return color/(1.0+color);}
      vec3 toYCoCg(vec3 c){return vec3(dot(c,vec3(.25,.5,.25)),(c.r-c.b)*.5,(-c.r+2.0*c.g-c.b)*.25);}
      vec3 fromYCoCg(vec3 c){return vec3(c.x+c.y-c.z,c.x+c.z,c.x-c.y-c.z);}
      float linearDepth(float d){return cameraNear*cameraFar/(cameraFar-d*(cameraFar-cameraNear));}
      void main(){
        vec2 halfPixel=.5/resolution,sourceUv=clamp(vUv+jitter,halfPixel,1.0-halfPixel);
        ivec2 size=ivec2(resolution),center=clamp(ivec2(sourceUv*resolution),ivec2(0),size-1);
        float depth=texelFetch(sceneDepth,center,0).r;
        bool sky=depth>=.999999;
        float distance=sky?0.0:linearDepth(depth),nearDepth=cameraFar,farDepth=0.0,reactive=0.0;
        bool neighborhoodSky=false,neighborhoodSolid=false;
        vec3 lower=vec3(1e10),upper=vec3(-1e10),sum=vec3(0.0),squares=vec3(0.0);
        for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
          ivec2 p=clamp(center+ivec2(x,y),ivec2(0),size-1);
          vec4 sampleColor=texelFetch(sceneColor,p,0);
          vec3 c=toYCoCg(compressColor(sampleColor.rgb));
          lower=min(lower,c);upper=max(upper,c);sum+=c;squares+=c*c;
          reactive=max(reactive,texelFetch(protection,p,0).g);
          reactive=max(reactive,sampleColor.a<.999?1.0:0.0);
          float d=texelFetch(sceneDepth,p,0).r;
          if(d>=.999999)neighborhoodSky=true;
          else {float z=linearDepth(d);nearDepth=min(nearDepth,z);farDepth=max(farDepth,z);neighborhoodSolid=true;}
        }
        reactive=max(reactive,(!sky&&distance<.8)?1.0:0.0);
        vec3 current=compressColor(texture2D(sceneColor,sourceUv).rgb),result=current;
        vec4 view=inverseProjection*vec4(sourceUv*2.0-1.0,depth*2.0-1.0,1.0);view/=view.w;
        vec4 oldView=previousView*cameraWorld*view;
        vec4 oldClip=previousProjection*oldView;
        if(sky)oldClip=previousProjection*vec4(mat3(previousView)*mat3(cameraWorld)*normalize(view.xyz),0.0);
        vec2 oldUv=oldClip.xy/max(oldClip.w,.00001)*.5+.5;
        float expected=max(0.0,-oldView.z),motion=length((oldUv-vUv)*resolution);
        bool inside=all(greaterThanEqual(oldUv,halfPixel))&&all(lessThanEqual(oldUv,1.0-halfPixel))&&oldClip.w>0.0;
        if(ready&&reactive<.5&&inside){
          vec2 oldPixel=oldUv*resolution-.5,base=floor(oldPixel),f=fract(oldPixel);
          vec3 history=vec3(0.0);float weights=0.0;
          float tolerance=max(.025,expected*.003),ratio=expected/max(distance,.001);
          float edgeNear=sky?nearDepth:expected+(nearDepth-distance)*ratio;
          float edgeFar=sky?farDepth:expected+(farDepth-distance)*ratio;
          bool edge=neighborhoodSky||farDepth-nearDepth>max(.1,distance*.01);
          for(int y=0;y<2;y++)for(int x=0;x<2;x++){
            ivec2 p=clamp(ivec2(base)+ivec2(x,y),ivec2(0),size-1);
            vec4 h=texelFetch(historyColor,p,0);
            bool sameDepth=sky?h.a==0.0:abs(h.a-expected)<=tolerance;
            bool coverage=edge&&((h.a==0.0&&neighborhoodSky)||(neighborhoodSolid&&h.a>=edgeNear-tolerance&&h.a<=edgeFar+tolerance));
            vec2 bilinear=mix(1.0-f,f,vec2(float(x),float(y)));
            float weight=h.a>=0.0&&(sameDepth||coverage)?bilinear.x*bilinear.y:0.0;
            history+=compressColor(h.rgb)*weight;weights+=weight;
          }
          if(weights>.001){
            history=toYCoCg(history/weights);
            vec3 average=sum/9.0,sigma=sqrt(max(vec3(0.0),squares/9.0-average*average));
            float gamma=mix(1.25,.85,smoothstep(.5,8.0,motion));
            lower=max(lower,average-gamma*sigma);upper=min(upper,average+gamma*sigma);
            vec3 midpoint=(lower+upper)*.5,extent=max((upper-lower)*.5,vec3(.001)),delta=history-midpoint;
            vec3 normalized=abs(delta/extent);float reach=max(1.0,max(normalized.x,max(normalized.y,normalized.z)));
            history=clamp(fromYCoCg(midpoint+delta/reach),0.0,.9999);
            float strength=min(frames/(frames+1.0),mix(.76,.91,smoothstep(2.0,30.0,distance)));
            strength*=mix(1.0,.65,smoothstep(.5,8.0,motion))*min(1.0,weights*2.0);
            result=mix(current,history,strength);
          }
        }
        result=clamp(result,0.0,.9999);
        gl_FragColor=vec4(result/max(1.0-result,vec3(.0001)),reactive>.5?-max(distance,.001):distance);
      }`,
    });
    this.copy = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      vertexShader,
      uniforms: {
        sceneColor: { value: null },
        resolution: { value: this.material.uniforms.resolution.value },
      },
      fragmentShader: /* glsl */ `
        varying vec2 vUv;uniform sampler2D sceneColor;uniform vec2 resolution;
        void main(){
          vec2 pixel=1.0/resolution;
          vec3 center=texture2D(sceneColor,vUv).rgb;
          vec3 a=texture2D(sceneColor,vUv+vec2(pixel.x,0.0)).rgb,b=texture2D(sceneColor,vUv-vec2(pixel.x,0.0)).rgb;
          vec3 c=texture2D(sceneColor,vUv+vec2(0.0,pixel.y)).rgb,d=texture2D(sceneColor,vUv-vec2(0.0,pixel.y)).rgb;
          vec3 detail=center+.18*(center-(a+b+c+d)*.25);
          gl_FragColor=vec4(clamp(detail,min(center,min(min(a,b),min(c,d))),max(center,max(max(a,b),max(c,d)))),1.0);
        }`,
    });
    this.quad = new FullScreenQuad();
    this.canvas = renderer.domElement;
    this.restored = () => this.reset();
    this.canvas.addEventListener('webglcontextrestored', this.restored);
    this.reset();
  }
  reset() {
    this.valid = false;
    this.frames = 0;
    this.phase = 0;
  }
  setSize(width, height) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.history.forEach((t) => t.setSize(this.width, this.height));
    this.material.uniforms.resolution.value.set(this.width, this.height);
    this.reset();
  }
  beginFrame() {
    this.jittered = false;
    if (!this.enabled) return;
    const c = this.camera,
      p = c.projectionMatrix.elements,
      old = this.previousProjection.elements,
      medium = this.frame.fluids.medium;
    if (
      this.valid &&
      (c.position.distanceToSquared(this.previousPosition) > 36 ||
        Math.abs(c.quaternion.dot(this.previousRotation)) <
          Math.cos(Math.PI / 8) ||
        Math.abs(p[0] / old[0] - 1) > 0.06 ||
        Math.abs(p[5] / old[5] - 1) > 0.06 ||
        medium !== this.medium)
    )
      this.reset();
    this.medium = medium;
    this.projection.copy(c.projectionMatrix);
    this.inverse.copy(c.projectionMatrixInverse);
    this.jitter
      .copy(samples[this.phase % samples.length])
      .set(this.jitter.x / this.width, this.jitter.y / this.height);
    p[8] -= this.jitter.x * 2;
    p[9] -= this.jitter.y * 2;
    c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
    this.jittered = true;
  }
  endFrame(success) {
    if (this.jittered) {
      this.camera.projectionMatrix.copy(this.projection);
      this.camera.projectionMatrixInverse.copy(this.inverse);
      this.jittered = false;
    }
    if (!success) this.reset();
  }
  render(renderer, writeBuffer, readBuffer) {
    const [previous, next] = this.history,
      u = this.material.uniforms,
      c = this.camera;
    u.sceneColor.value = readBuffer.texture;
    u.historyColor.value = previous.texture;
    u.ready.value = this.valid;
    u.frames.value = this.frames;
    u.cameraNear.value = c.near;
    u.cameraFar.value = c.far;
    this.quad.material = this.material;
    renderer.setRenderTarget(next);
    this.quad.render(renderer);
    this.copy.uniforms.sceneColor.value = next.texture;
    this.quad.material = this.copy;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
    this.previousView.copy(c.matrixWorldInverse);
    this.previousProjection.copy(this.projection);
    this.previousPosition.copy(c.position);
    this.previousRotation.copy(c.quaternion);
    this.history.reverse();
    this.valid = true;
    this.frames++;
    this.phase++;
  }
  dispose() {
    this.canvas.removeEventListener('webglcontextrestored', this.restored);
    this.history.forEach((t) => t.dispose());
    this.material.dispose();
    this.copy.dispose();
    this.quad.dispose();
  }
}
