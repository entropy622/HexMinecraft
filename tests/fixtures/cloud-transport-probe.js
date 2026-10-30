import { FloatType, ShaderMaterial, WebGLRenderTarget } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { cloudScatteringGLSL } from '../../src/cloud-scattering.js';

// Run the production optical functions with independent boundary inputs.
// Float32 readback retains very dim first-order light in an optically deep body.
export function probeCloudTransport(renderer) {
  const width = 4096;
  const material = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: `${cloudScatteringGLSL}
      void main(){
        int index=int(gl_FragCoord.x);
        if(gl_FragCoord.y<1.0){
          float mu=-1.0+2.0*gl_FragCoord.x/4096.0;
          gl_FragColor=vec4(hexCloudPhase(mu),cloudPointPhase(mu),0.0,1.0);return;
        }
        if(index>=16&&index<20){
          float t=index==16?1.0:(index==17?0.9:(index==18?0.004:0.0));
          gl_FragColor=hexCloudOpacity(vec4(vec3(1.0,0.5,0.2)*(1.0-t),t));return;
        }
        vec3 sun=vec3(0.0),sky=vec3(0.0),ground=vec3(0.0),tau=vec3(0.0);
        float opacity=0.4,albedo=0.995,mu=0.3;
        if(index>=1&&index<=3){sun=vec3(1.0);mu=1.0;
          tau.x=index==1?0.0:(index==2?2.0:20.0);}
        if(index==4||index==5){sky=vec3(0.2,0.3,0.5);tau.y=index==4?0.0:20.0;}
        if(index==6||index==7){ground=vec3(0.5,0.3,0.1);tau.z=index==6?0.0:20.0;}
        if(index>=8&&index<=12){sun=vec3(1.0);sky=vec3(0.2,0.3,0.5);
          ground=vec3(0.5,0.3,0.1);tau=vec3(3.0);}
        if(index==8)opacity=0.0;
        if(index==9)albedo=0.0;
        if(index==10)opacity=0.7;
        if(index==11)opacity=1.0-sqrt(0.3);
        if(index==12)opacity=1.0-exp(-0.0001);
        if(index>=13){
          mu=index==13?1.0:(index==14?cos(0.13962634):-1.0);
          gl_FragColor=vec4(hexCloudPhase(mu),cloudPointPhase(mu),0.0,1.0);return;
        }
        vec4 optics=vec4(0.045,albedo,0.3,0.0);
        vec2 lit=hexCloudScatter(tau/0.045,0.35,mu,hexCloudPhase(mu),opacity,optics,0,1.0,1.0);
        vec2 unbounced=hexCloudScatter(tau/0.045,0.35,mu,hexCloudPhase(mu),opacity,optics,0,0.0,1.0);
        gl_FragColor=vec4(sun*unbounced.x+sky*lit.y+ground*(lit.x-unbounced.x),1.0);
      }`,
  });
  const target = new WebGLRenderTarget(width, 2, {
    type: FloatType,
    depthBuffer: false,
  });
  const quad = new FullScreenQuad(material),
    previous = renderer.getRenderTarget();
  const data = new Float32Array(width * 2 * 4);
  try {
    renderer.setRenderTarget(target);
    quad.render(renderer);
    renderer.readRenderTargetPixels(target, 0, 0, width, 2, data);
  } finally {
    renderer.setRenderTarget(previous);
    quad.dispose();
    material.dispose();
    target.dispose();
  }
  let phaseIntegral = 0,
    phaseMin = Infinity,
    phaseMax = 0;
  for (let i = 0; i < width; i++) {
    const p = data[i * 4];
    phaseIntegral += (p * 4 * Math.PI) / width;
    phaseMin = Math.min(phaseMin, p);
    phaseMax = Math.max(phaseMax, p);
  }
  const cases = Array.from({ length: 20 }, (_, i) =>
    Array.from(data.slice((width + i) * 4, (width + i + 1) * 4)),
  );
  return {
    finite: data.every(Number.isFinite),
    phaseIntegral,
    phaseMin,
    phaseMax,
    cases,
  };
}
