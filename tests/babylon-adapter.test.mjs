import test from 'node:test';
import assert from 'node:assert/strict';
import { BABYLON_LOCAL_PATH, hasBabylonRuntime, loadBabylonRuntime, mapBasketballCoordinates, readVisualFrame } from '../src/match/babylon-adapter.js';
import { BABYLON_CAMERAS, MatchRendererBabylon } from '../src/match/renderer-babylon.js';

test('Babylon é local e opcional sem CDN ou dependência de saves', () => {
  assert.equal(BABYLON_LOCAL_PATH, 'assets/vendor/babylon.js');
  assert.equal(hasBabylonRuntime({BABYLON:{Scene(){}, Engine(){}, MeshBuilder:{}}}),true);
  assert.equal(hasBabylonRuntime({}),false);
  assert.equal(BABYLON_CAMERAS.length,4);
});

test('carregamento rejeita explicitamente runtime ausente no servidor Node', async () => {
  await assert.rejects(loadBabylonRuntime({ scope: {} }), /Babylon.js não está disponível/);
});

test('conversão de coordenadas mantém escala do motor e rejeita inválidos', () => {
  assert.deepEqual(mapBasketballCoordinates(47,25,10),{x:0,y:10,z:0});
  assert.deepEqual(mapBasketballCoordinates(94,50,-1),{x:47,y:0,z:25});
  assert.equal(mapBasketballCoordinates(NaN,1,2),null);
});

test('ponte visual lê jogadores e bola sem alterar estado nem saves', () => {
  const sim={t:12,score:[4,2],court:[
    {id:'a',team:0,x:23,y:21,vx:3,vy:4,facing:1,data:{heightIn:80},act:{type:'run'}},
    {id:'b',team:1,x:60,y:22,vx:0,vy:0,mode:'defend'},
  ],ball:{x:18,y:16,z:5,state:'shot'}};
  const before=structuredClone(sim);
  const frame=readVisualFrame(sim);
  assert.equal(frame.players.length,2);
  assert.equal(frame.players[0].speed,5);
  assert.equal(frame.players[0].position.x,-24);
  assert.deepEqual(frame.ball,{x:-29,y:5,z:-9});
  assert.deepEqual(sim,before);
});

test('ponte omite duplicatas e coordenadas inválidas; bola morta fica oculta', () => {
  const frame=readVisualFrame({court:[{id:10,x:5,y:7},{id:10,x:5,y:7},{id:20,x:Infinity,y:9}],ball:{state:'dead'}});
  assert.equal(frame.players.length,1);
  assert.equal(frame.ball,null);
  assert.equal(readVisualFrame(null).players.length,0);
});

test('renderer recusa runtime inválido antes de modificar a simulação', () => {
  const sim={score:[2,4],clock:123};
  assert.throws(()=>new MatchRendererBabylon({},sim,{BABYLON:{}}),/Runtime Babylon.js inválido/);
  assert.deepEqual(sim,{score:[2,4],clock:123});
});

// Smoke do fluxo de renderização com runtime de teste. Não substitui Babylon real/Chromium.
test('renderer cria quadra, atletas e bola e desenha sem modificar MatchSim', () => {
  const nodes=[];
  class Vector3 {
    constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
    set(x,y,z){Object.assign(this,{x,y,z});}
    setAll(n){this.x=this.y=this.z=n;}
    static Lerp(a,b,t){return new Vector3(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t);}
  }
  class Color3 { constructor(){} static FromHexString(){return new Color3();} }
  class Color4 {constructor() {}}
  class Mesh {
    constructor(name){this.name=name;this.position=new Vector3();this.rotation=new Vector3();this.scaling=new Vector3(1,1,1);nodes.push(this);}
    setEnabled(v){this.enabled=v;}
    getChildMeshes(){return nodes.filter(n=>n.parent===this);}
    dispose(){this.disposed=true;}
  }
  class Scene {constructor(){this.frames=0;} render(){this.frames++;} dispose(){this.disposed=true;} }
  class Engine {setHardwareScalingLevel(v){this.scaling=v;} resize(){} dispose(){this.disposed=true;} }
  class ArcRotateCamera {constructor(){this.alpha=0;this.beta=1;this.radius=100;this.target=new Vector3();this.inputs={clear(){}};} }
  const mesh=({name})=>new Mesh(name);
  const B={Vector3,Color3,Color4,Scene,Engine,ArcRotateCamera,
    StandardMaterial: class {}, HemisphericLight:class {},DirectionalLight:class {},TransformNode:Mesh,
    MeshBuilder:{CreateGround:mesh,CreateLines:mesh,CreateTorus:mesh,CreateBox:mesh,CreateSphere:mesh,CreateCylinder:mesh},
  };
  const sim={t:1,score:[2,3],court:[{id:'123',team:0,x:30,y:20,vx:4,vy:0,facing:0,act:{type:'run'},data:{heightIn:78}}],ball:{x:37,y:19,z:7,state:'shot'}};
  const before=structuredClone(sim);
  const renderer=new MatchRendererBabylon({},sim,{BABYLON:B});
  renderer.draw(0.016);
  assert.equal(renderer.scene.frames,1);
  assert.equal(renderer.avatars.size,1);
  assert.equal(renderer.ball.position.x,-10);
  assert.deepEqual(sim,before);
  sim.court=[];
  renderer.draw(0.016);
  assert.equal(renderer.avatars.size,0);
  renderer.dispose();
  assert.equal(renderer.scene.disposed,true);
  assert.equal(renderer.engine.disposed,true);
});
