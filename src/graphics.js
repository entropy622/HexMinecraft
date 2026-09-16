import * as THREE from 'three';
import {BLOCKS,DIRECTIONS,axialToWorld,hash,worldToAxial} from './core.js';
const corners=Array.from({length:6},(_,i)=>[Math.cos((i*60-30)*Math.PI/180),Math.sin((i*60-30)*Math.PI/180)]);
// Counter-clockwise axial neighbors correspond to the outward side normals.
export class Graphics {
 constructor(canvas){
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));this.renderer.setSize(innerWidth,innerHeight);
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#b5d9cf');this.scene.fog=new THREE.FogExp2('#b5d9cf',.012);
  this.camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.08,220);this.camera.rotation.order='YXZ';
  this.hemi=new THREE.HemisphereLight('#d7f2ea','#6b7650',2.3);this.scene.add(this.hemi);
  this.sun=new THREE.DirectionalLight('#ffe3ad',2.7);this.sun.position.set(30,55,20);this.scene.add(this.sun);
  this.terrain=new THREE.Group();this.scene.add(this.terrain);this.chunks=new Map();
  this.material=new THREE.MeshLambertMaterial({vertexColors:true});
  this.ray=new THREE.Raycaster();this.ray.far=7;
  this.outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(1.009,1.009,1.009,6)),new THREE.LineBasicMaterial({color:'#fff1b4',transparent:true,opacity:.95}));this.outline.visible=false;this.scene.add(this.outline);
  const waterMat=new THREE.MeshPhongMaterial({color:'#59a9ae',transparent:true,opacity:.68,shininess:85,depthWrite:false});
  this.water=new THREE.Mesh(new THREE.PlaneGeometry(350,350),waterMat);this.water.rotation.x=-Math.PI/2;this.water.position.y=3.15;this.scene.add(this.water);
  this.clouds=new THREE.Group();const cloudMat=new THREE.MeshLambertMaterial({color:'#fff5d9',transparent:true,opacity:.83});
  for(let i=0;i<20;i++){const cloud=new THREE.Group();for(let j=0;j<4;j++){const m=new THREE.Mesh(new THREE.CylinderGeometry(3+j%2,3+j%2,.7,6),cloudMat);m.position.set(j*3,Math.sin(j)*.4,j%2*2);cloud.add(m);}cloud.position.set(hash(i,1)*170-85,29+hash(i,2)*8,hash(i,3)*150-75);this.clouds.add(cloud);}this.scene.add(this.clouds);
  this.decor=new THREE.Group();this.scene.add(this.decor);this.beaconMeshes=[];this.particles=[];this.cropMeshes=new Map();this.lights=new Map();
  this.hand=new THREE.Group();const sleeve=new THREE.Mesh(new THREE.BoxGeometry(.18,.22,.48),new THREE.MeshLambertMaterial({color:'#436e65'}));sleeve.rotation.x=-.25;this.hand.add(sleeve);const palm=new THREE.Mesh(new THREE.BoxGeometry(.17,.18,.18),new THREE.MeshLambertMaterial({color:'#d7b68d'}));palm.position.set(0,.03,-.3);this.hand.add(palm);this.hand.position.set(.38,-.32,-.65);this.camera.add(this.hand);this.scene.add(this.camera);
  addEventListener('resize',()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);});
 }
 chunkKey(q,r){return `${Math.floor(q/8)},${Math.floor(r/8)}`;}
 build(world){this.world=world;for(const m of this.chunks.values()){m.geometry.dispose();this.terrain.remove(m);}this.chunks.clear();const keys=new Set();for(const k of world.blocks.keys()){const[q,,r]=k.split(',').map(Number);keys.add(this.chunkKey(q,r));}for(const k of keys)this.buildChunk(k);
  for(const child of [...this.decor.children]){child.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});this.decor.remove(child);}this.beaconMeshes=[];this.cropMeshes.clear();this.lights.clear();
  for(const b of world.beacons){const p=axialToWorld(b.q,b.r),g=new THREE.Group();g.position.set(p.x,b.y,p.z);const base=new THREE.Mesh(new THREE.CylinderGeometry(.72,.86,.35,6),new THREE.MeshLambertMaterial({color:'#c5b79a'}));base.position.y=.175;g.add(base);const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.58),new THREE.MeshStandardMaterial({color:'#88c4bb',emissive:'#28534e',emissiveIntensity:.25,roughness:.3}));gem.position.y=1.45;g.add(gem);const ring=new THREE.Mesh(new THREE.TorusGeometry(.95,.035,4,6),new THREE.MeshBasicMaterial({color:'#e0bf7c'}));ring.rotation.x=Math.PI/2;ring.position.y=.7;g.add(ring);const beam=new THREE.Mesh(new THREE.CylinderGeometry(.22,.6,55,6,1,true),new THREE.MeshBasicMaterial({color:'#a2f9d8',transparent:true,opacity:.14,depthWrite:false}));beam.position.y=28;beam.visible=false;g.add(beam);this.decor.add(g);this.beaconMeshes.push({g,gem,ring,beam});}
 }
 buildChunk(k){const[cq,cr]=k.split(',').map(Number),positions=[],colors=[];const world=this.world;
  const tri=(a,b,c,color)=>{positions.push(...a,...b,...c);for(let i=0;i<3;i++)colors.push(color.r,color.g,color.b);};
  for(let q=cq*8;q<cq*8+8;q++)for(let r=cr*8;r<cr*8+8;r++)for(let y=0;y<=32;y++){
   const type=world.get(q,y,r);if(!type)continue;const data=BLOCKS[type],p=axialToWorld(q,r),varn=.92+hash(q,y,r)*.15,top=new THREE.Color(data.color).multiplyScalar(varn),side=new THREE.Color(data.side).multiplyScalar(varn);
   if(!world.get(q,y+1,r)){
    for(let i=0;i<6;i++){const a=corners[i],b=corners[(i+1)%6],a3=[p.x+a[0],y+1,p.z+a[1]],b3=[p.x+b[0],y+1,p.z+b[1]],ai=[p.x+a[0]*.94,y+1.006,p.z+a[1]*.94],bi=[p.x+b[0]*.94,y+1.006,p.z+b[1]*.94];
     tri([p.x,y+1.006,p.z],bi,ai,top.clone().multiplyScalar(1+(i%2)*.018));tri(ai,bi,b3,top.clone().multiplyScalar(.86));tri(ai,b3,a3,top.clone().multiplyScalar(.86));}
   }
   if(y>0&&!world.get(q,y-1,r))for(let i=0;i<6;i++)tri([p.x,y,p.z],[p.x+corners[i][0],y,p.z+corners[i][1]],[p.x+corners[(i+1)%6][0],y,p.z+corners[(i+1)%6][1]],side);
   for(let i=0;i<6;i++){const[dq,dr]=DIRECTIONS[i];if(world.get(q+dq,y,r+dr))continue;const a=corners[i],b=corners[(i+1)%6],v0=[p.x+a[0],y,p.z+a[1]],v1=[p.x+b[0],y,p.z+b[1]],v2=[p.x+b[0],y+1,p.z+b[1]],v3=[p.x+a[0],y+1,p.z+a[1]];const c=side.clone().multiplyScalar(.87+i*.035);tri(v0,v2,v1,c);tri(v0,v3,v2,c);
    if(type==='grass'){const l0=[v0[0],y+.82,v0[2]],l1=[v1[0],y+.82,v1[2]];tri(l0,v3,v2,top);tri(l0,v2,l1,top);}
    if(['wood','planks','brick','workbench','chest','furnace'].includes(type)){const at=y+(type==='wood'?.22:.48),t=.035,aa=[v0[0]*.999+p.x*.001,at,v0[2]*.999+p.z*.001],bb=[v1[0]*.999+p.x*.001,at,v1[2]*.999+p.z*.001];const offset=new THREE.Vector3(dq+dr*.5,0,dr*.866).multiplyScalar(.005);aa[0]+=offset.x;aa[2]+=offset.z;bb[0]+=offset.x;bb[2]+=offset.z;tri(aa,[bb[0],at+t,bb[2]],bb,c.clone().multiplyScalar(.6));tri(aa,[aa[0],at+t,aa[2]],[bb[0],at+t,bb[2]],c.clone().multiplyScalar(.6));}
   }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();geo.computeBoundingSphere();
  let mesh=this.chunks.get(k);if(mesh)mesh.geometry.dispose();else{mesh=new THREE.Mesh(geo,this.material);this.terrain.add(mesh);this.chunks.set(k,mesh);}mesh.geometry=geo;
 }
 updateBlock(q,y,r){const keys=new Set([this.chunkKey(q,r),...DIRECTIONS.map(([a,b])=>this.chunkKey(q+a,r+b))]);for(const k of keys)this.buildChunk(k);this.updateLight(q,y,r);}
 updateLight(q,y,r){const k=`${q},${y},${r}`;if(this.lights.has(k)){this.decor.remove(this.lights.get(k));this.lights.delete(k);}if(this.world.get(q,y,r)==='lantern'&&this.lights.size<24){const p=axialToWorld(q,r),light=new THREE.PointLight('#ffd58a',5,9,2);light.position.set(p.x,y+1.3,p.z);this.lights.set(k,light);this.decor.add(light);}}
 target(){this.ray.setFromCamera(new THREE.Vector2(),this.camera);const hit=this.ray.intersectObjects(this.terrain.children,false)[0];if(!hit){this.outline.visible=false;return null;}const pt=hit.point.clone().addScaledVector(hit.face.normal,-.035),a=worldToAxial(pt.x,pt.z),y=Math.floor(pt.y);const outside=hit.point.clone().addScaledVector(hit.face.normal,.045),b=worldToAxial(outside.x,outside.z);const p=axialToWorld(a.q,a.r);this.outline.position.set(p.x,y+.5,p.z);this.outline.visible=true;return{...a,y,type:this.world.get(a.q,y,a.r),place:{...b,y:Math.floor(outside.y)},distance:hit.distance};}
 burst(q,y,r,color){const p=axialToWorld(q,r);for(let i=0;i<10;i++){const mesh=new THREE.Mesh(new THREE.TetrahedronGeometry(.065+Math.random()*.065),new THREE.MeshBasicMaterial({color}));mesh.position.set(p.x,y+.6,p.z);this.scene.add(mesh);this.particles.push({mesh,v:new THREE.Vector3((Math.random()-.5)*3,Math.random()*4,(Math.random()-.5)*3),life:.7});}}
 crop(k,age){let g=this.cropMeshes.get(k);if(!g){const[q,y,r]=k.split(',').map(Number),p=axialToWorld(q,r);g=new THREE.Group();g.position.set(p.x,y+1,p.z);for(let i=0;i<5;i++){const stalk=new THREE.Mesh(new THREE.CylinderGeometry(.05,.025,.65,3),new THREE.MeshLambertMaterial({color:'#d5bd66'}));stalk.position.set(Math.sin(i*2.4)*.38,.33,Math.cos(i*2.4)*.38);g.add(stalk);}this.decor.add(g);this.cropMeshes.set(k,g);}g.scale.y=.15+Math.min(age/90,1)*.85;g.children.forEach(s=>s.material.color.set(age>=90?'#e3bd62':'#8daf65'));}
 removeCrop(k){const g=this.cropMeshes.get(k);if(g){g.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});this.decor.remove(g);this.cropMeshes.delete(k);}}
 frame(dt,time,activated,playing,moving,mining){
  const phase=(time%600)/600,day=Math.max(.08,Math.sin(phase*Math.PI*2)),sky=new THREE.Color('#122c47').lerp(new THREE.Color('#bbdccc'),day);this.scene.background.copy(sky);this.scene.fog.color.copy(sky);this.hemi.intensity=.45+day*1.7;this.sun.intensity=.2+day*2.4;this.sun.position.set(Math.cos(phase*Math.PI*2)*50,Math.sin(phase*Math.PI*2)*60,25);
  this.clouds.position.x=Math.sin(time*.006)*10;this.water.position.y=3.12+Math.sin(time*.7)*.025;
  this.beaconMeshes.forEach((b,i)=>{b.gem.rotation.y=time*.7;b.gem.position.y=1.5+Math.sin(time*1.5+i)*.15;b.ring.rotation.z=time*.25;b.beam.visible=activated.includes(i);b.gem.material.emissiveIntensity=activated.includes(i)?2:.25;});
  for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.life-=dt;p.v.y-=dt*8;p.mesh.position.addScaledVector(p.v,dt);p.mesh.rotation.x+=dt*3;p.mesh.scale.setScalar(Math.max(0,p.life));if(p.life<=0){this.scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();this.particles.splice(i,1);}}
  this.hand.visible=playing;this.hand.rotation.x=mining?Math.sin(time*25)*.5:0;this.hand.position.y=-.32+(moving?Math.sin(time*11)*.018:0);this.renderer.render(this.scene,this.camera);
 }
}
export function createCreature(kind){const group=new THREE.Group();const hostile=kind==='crawler';const mat=new THREE.MeshLambertMaterial({color:hostile?'#719d96':'#e7d8b7'}),dark=new THREE.MeshLambertMaterial({color:hostile?'#354e59':'#8e7962'});const body=new THREE.Mesh(new THREE.CylinderGeometry(hostile?.43:.48,hostile?.5:.48,hostile?.65:.75,6),mat);body.position.y=.7;body.rotation.z=hostile?0:Math.PI/2;group.add(body);const head=new THREE.Mesh(new THREE.CylinderGeometry(.27,.24,.42,6),mat);head.position.set(0,1,hostile?-.14:-.45);group.add(head);for(const x of [-.12,.12]){const eye=new THREE.Mesh(new THREE.BoxGeometry(.075,.08,.05),new THREE.MeshBasicMaterial({color:hostile?'#ffe29a':'#263e3c'}));eye.position.set(x,1.05,-.69+(hostile?.28:0));group.add(eye);}for(const x of [-.28,.28])for(const z of [-.27,.27]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.07,.085,.4,6),dark);leg.position.set(x,.23,z);group.add(leg);}return group;}
