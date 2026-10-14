// Apresentação WebGL2. Lê exclusivamente MatchSim; resultados, tempo e posse pertencem ao motor.
import { COURT, clamp } from './config.js';
import { courtTheme } from './courts.js';
import { MARGIN, renderCourtArt } from './court-art.js';

export const CAMERAS_3D = [
  ['broadcast', '3D · lateral'], ['diagonal', '3D · diagonal'],
  ['follow', '3D · acompanha a bola'], ['basket', '3D · atrás da cesta'],
  ['replay', '3D · replay'],
];
export const GRAPHICS_QUALITY = Object.freeze({
  low: { dpr: 1, crowd: 24, sphere: 8 },
  medium: { dpr: 1.5, crowd: 48, sphere: 12 },
  high: { dpr: 2, crowd: 96, sphere: 16 },
});
export const qualityOf = (value) => GRAPHICS_QUALITY[value] ?? GRAPHICS_QUALITY.medium;

const vertexSource = `#version 300 es
in vec3 aPosition; in vec3 aNormal; in vec2 aUv;
uniform mat4 uModel, uViewProjection;
out vec3 vNormal; out vec2 vUv;
void main() { vNormal = mat3(uModel) * aNormal; vUv = aUv; gl_Position = uViewProjection * uModel * vec4(aPosition, 1.0); }`;
const fragmentSource = `#version 300 es
precision mediump float;
in vec3 vNormal; in vec2 vUv;
uniform vec4 uColor; uniform sampler2D uTexture; uniform bool uTextured;
out vec4 outColor;
void main() {
  vec4 base = uTextured ? texture(uTexture, vUv) * uColor : uColor;
  float light = 0.52 + 0.48 * max(0.0, dot(normalize(vNormal), normalize(vec3(-0.35, -0.5, 0.8))));
  outColor = vec4(base.rgb * light, base.a);
}`;

function shader(gl, type, source) {
  const out = gl.createShader(type);
  gl.shaderSource(out, source);
  gl.compileShader(out);
  if (!gl.getShaderParameter(out, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(out));
  return out;
}
function mesh(gl, vertices) {
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  for (const [i, size, offset] of [[0, 3, 0], [1, 3, 3], [2, 2, 6]]) {
    gl.enableVertexAttribArray(i);
    gl.vertexAttribPointer(i, size, gl.FLOAT, false, 32, offset * 4);
  }
  gl.bindVertexArray(null);
  return { vao, buffer, count: vertices.length / 8 };
}

/**
 * Converte a parte geométrica de um OBJ em vértices que o WebGL2 desta arena
 * entende. O contrato é deliberadamente pequeno: posições `v` e faces `f`;
 * normais e UVs são opcionais. Assim, um artista pode exportar do Blender sem
 * acoplar o jogo a um loader ou runtime 3D externo.
 */
export function parseObjMesh(source) {
  const positions = [];
  const normals = [];
  const triangles = [];
  const resolve = (value, length) => {
    const n = Number(value);
    return Number.isInteger(n) && n !== 0 ? (n < 0 ? length + n : n - 1) : -1;
  };
  for (const raw of String(source ?? '').split(/\r?\n/)) {
    const parts = raw.trim().split(/\s+/);
    if (parts[0] === 'v' && parts.length >= 4) {
      const point = parts.slice(1, 4).map(Number);
      if (point.every(Number.isFinite)) positions.push(point);
    } else if (parts[0] === 'vn' && parts.length >= 4) {
      const normal = parts.slice(1, 4).map(Number);
      if (normal.every(Number.isFinite)) normals.push(normal);
    } else if (parts[0] === 'f' && parts.length >= 4) {
      const face = parts.slice(1).map((part) => {
        const [vertex, , normal] = part.split('/');
        return { vertex: resolve(vertex, positions.length), normal: resolve(normal, normals.length) };
      }).filter(({ vertex }) => vertex >= 0 && positions[vertex]);
      for (let i = 1; i < face.length - 1; i++) triangles.push([face[0], face[i], face[i + 1]]);
    }
  }
  const vertices = [];
  for (const triangle of triangles) {
    const [a, b, c] = triangle.map(({ vertex }) => positions[vertex]);
    const ab = b.map((value, i) => value - a[i]), ac = c.map((value, i) => value - a[i]);
    const faceNormal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const length = Math.hypot(...faceNormal) || 1;
    const fallbackNormal = faceNormal.map((value) => value / length);
    for (const entry of triangle) {
      const point = positions[entry.vertex];
      const normal = normals[entry.normal] ?? fallbackNormal;
      vertices.push(...point, ...normal, 0, 0);
    }
  }
  if (!vertices.length) throw Error('OBJ sem faces trianguláveis.');
  return vertices;
}
function face(out, corners, normal) {
  for (const i of [0, 1, 2, 0, 2, 3]) out.push(...corners[i], ...normal, i === 0 || i === 3 ? 0 : i === 1 ? 1 : 1, i === 0 || i === 1 ? 0 : 1);
}
function boxGeometry() {
  const a = [];
  face(a, [[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]], [0,0,1]);
  face(a, [[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5],[-.5,-.5,-.5]], [0,0,-1]);
  face(a, [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]], [0,-1,0]);
  face(a, [[.5,.5,-.5],[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5]], [0,1,0]);
  face(a, [[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]], [1,0,0]);
  face(a, [[-.5,.5,-.5],[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5]], [-1,0,0]);
  return a;
}
function sphereGeometry(segments) {
  const a = [];
  const point = (lat, lon) => {
    const v = Math.PI * lat / segments, u = Math.PI * 2 * lon / segments;
    const xyz = [Math.sin(v)*Math.cos(u), Math.sin(v)*Math.sin(u), Math.cos(v)];
    return [...xyz, ...xyz, lon/segments, lat/segments];
  };
  for (let lat=0; lat<segments; lat++) for (let lon=0; lon<segments; lon++) {
    const p = point(lat,lon), q=point(lat+1,lon), r=point(lat+1,lon+1), s=point(lat,lon+1);
    a.push(...p,...q,...r,...p,...r,...s);
  }
  return a;
}
const identity = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
function multiply(a,b) {
  const o=new Float32Array(16);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++) for(let k=0;k<4;k++) o[c*4+r]+=a[k*4+r]*b[c*4+k];
  return o;
}
function model(x,y,z,sx,sy,sz,angle=0,swing=0) {
  const c=Math.cos(angle), s=Math.sin(angle), a=Math.cos(swing), b=Math.sin(swing);
  // yaw em torno do eixo vertical, seguido de balanço do membro em torno do eixo lateral.
  return new Float32Array([c*a*sx,s*a*sx,-b*sx,0, -s*sy,c*sy,0,0, c*b*sz,s*b*sz,a*sz,0, x,y,z,1]);
}
function perspective(fov,aspect,near,far) {
  const f=1/Math.tan(fov/2), o=new Float32Array(16);
  o[0]=f/aspect; o[5]=f; o[10]=(far+near)/(near-far); o[11]=-1; o[14]=2*far*near/(near-far);
  return o;
}
function lookAt(eye,target) {
  const norm=(v)=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const z=norm(eye.map((v,i)=>v-target[i])), x=norm(cross([0,0,1],z)), y=cross(z,x);
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
function rgba(hex, alpha=1) {
  const n=parseInt(String(hex).replace('#',''),16);
  return Number.isFinite(n) ? [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255,alpha] : [0.7,0.7,0.7,alpha];
}
const dark='#141924', metal='#bfcbd2', white='#f0f3f5';
const stableId = (id) => [...String(id ?? '')].reduce((n, char) => (n * 31 + char.charCodeAt(0)) | 0, 7) >>> 0;

/** Valores puramente visuais para manter a bola sincronizada com a posse e a física do sim. */
export function visualBall(sim) {
  const b=sim.ball;
  if(b.state==='dead') return null;
  const bounce=b.state==='held'&&b.owner?.dribbled&&sim.state==='play';
  return { x:b.x, y:b.y, z:bounce?0.5+Math.abs(Math.sin(sim.t*7))*2.7:b.z };
}

/** Projeção de um snapshot do motor para replay. Mantém o objeto vivo intacto. */
export function replayProjection(sim, frame, previous = frame) {
  const players = new Map(sim.teams.flatMap(team => team.all).map(player => [String(player.id), player]));
  const before = new Map(previous.players.map(([id,x,y]) => [String(id), {x,y}]));
  const court = frame.players.flatMap(([id,x,y,facing,hasBall]) => {
    const source=players.get(String(id));
    if(!source) return [];
    const old=before.get(String(id))??{x,y};
    const dt=Math.max(0.1,frame.t-previous.t);
    return [{...source,x,y,facing,hasBall:!!hasBall,vx:(x-old.x)/dt,vy:(y-old.y)/dt,anim:null,dribbled:false}];
  });
  const [x,y,z,state]=frame.ball;
  return {...sim,t:frame.t,quarter:frame.q,clock:frame.clock,score:[...frame.score],court,
    ball:{x,y,z,state,owner:court.find(player=>player.hasBall)??null}};
}

export class MatchRenderer3D {
  constructor(canvas, sim, { quality='medium', logoOf=()=>null }={}) {
    this.canvas=canvas; this.sim=sim; this.logoOf=logoOf; this.quality=quality;
    this.camera='broadcast'; this.target=[47,25,0]; this.lost=false;
    this.onLost=(e)=>{e.preventDefault();this.lost=true;this.onFailure?.('Contexto 3D perdido. Voltando ao 2D.');};
    canvas.addEventListener('webglcontextlost',this.onLost);
    const gl=canvas.getContext('webgl2',{antialias:quality!=='low',alpha:false});
    if(!gl) throw Error('WebGL2 indisponível neste navegador.');
    this.gl=gl;
    const program=gl.createProgram();
    gl.attachShader(program,shader(gl,gl.VERTEX_SHADER,vertexSource));
    gl.attachShader(program,shader(gl,gl.FRAGMENT_SHADER,fragmentSource));
    gl.bindAttribLocation(program,0,'aPosition'); gl.bindAttribLocation(program,1,'aNormal'); gl.bindAttribLocation(program,2,'aUv');
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    this.program=program; gl.useProgram(program);
    this.uniforms=Object.fromEntries(['uModel','uViewProjection','uColor','uTextured','uTexture'].map(k=>[k,gl.getUniformLocation(program,k)]));
    this.box=mesh(gl,boxGeometry()); this.sphere=mesh(gl,sphereGeometry(qualityOf(quality).sphere));
    this.playerModel = null;
    this.playerModelStatus = 'fallback';
    const l=COURT.L,w=COURT.W,m=MARGIN;
    this.floor=mesh(gl,[...[-m,-m,0,0,0,1,0,1], ...[l+m,-m,0,0,0,1,1,1], ...[l+m,w+m,0,0,0,1,1,0], ...[-m,-m,0,0,0,1,0,1], ...[l+m,w+m,0,0,0,1,1,0], ...[-m,w+m,0,0,0,1,0,0]]);
    this.texture=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    this.uploadCourt();
    this.loadPlayerModel('/assets/models/nba-jersey-lowpoly.obj');
  }
  loadPlayerModel(url) {
    if (typeof fetch !== 'function') return;
    this.playerModelStatus = 'loading';
    fetch(url)
      .then((response) => response.ok ? response.text() : Promise.reject(Error(`Modelo indisponível (${response.status}).`)))
      .then(parseObjMesh)
      .then((vertices) => {
        if (this.disposed || this.lost) return;
        this.playerModel = mesh(this.gl, vertices);
        this.playerModelStatus = 'ready';
      })
      .catch(() => { if (!this.disposed) this.playerModelStatus = 'fallback'; });
  }
  uploadCourt() {
    const gl=this.gl, logo=this.logoOf(this.sim.teams[0]);
    this.logoReady=Boolean(logo?.complete&&logo.naturalWidth>1);
    const ppf=this.quality==='low'?6:this.quality==='high'?12:9;
    const art=renderCourtArt(ppf,courtTheme(this.sim.teams[0]),this.logoReady?logo:null);
    gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,art);
  }
  setQuality(quality) {
    if(quality===this.quality) return;
    const gl=this.gl;
    gl.deleteBuffer(this.sphere.buffer);gl.deleteVertexArray(this.sphere.vao);
    this.quality=quality;this.sphere=mesh(gl,sphereGeometry(qualityOf(quality).sphere));this.uploadCourt();
  }
  drawMesh(shape, x,y,z, sx,sy,sz, color, angle=0, swing=0, textured=false) {
    const gl=this.gl,u=this.uniforms;
    gl.uniformMatrix4fv(u.uModel,false,model(x,y,z,sx,sy,sz,angle,swing));
    gl.uniform4fv(u.uColor,rgba(color));gl.uniform1i(u.uTextured,textured?1:0);
    gl.bindVertexArray(shape.vao);gl.drawArrays(gl.TRIANGLES,0,shape.count);
  }
  boxAt(x,y,z,sx,sy,sz,color,angle=0,swing=0) {this.drawMesh(this.box,x,y,z,sx,sy,sz,color,angle,swing);}
  orb(x,y,z,r,color) {this.drawMesh(this.sphere,x,y,z,r,r,r,color);}
  drawArena() {
    const q=qualityOf(this.quality), t=this.sim.t, home=this.sim.teams[0].colors?.[0]??'#234568';
    this.drawMesh(this.floor,0,0,0,1,1,1,'#ffffff',0,0,true);
    // Paredes baixas, arquibancada em degraus e torcida estilizada determinística.
    for(const side of [-1,1]) {
      const y=side<0?-18:68;
      for(let row=0;row<3;row++) this.boxAt(47,y+side*row*3,0.5+row*1.2,112,2.7,1.2,row===0?home:dark);
      for(let i=0;i<q.crowd/2;i++) {
        const x=-6+(i*23.37)%106, yy=y+side*(3+(i%3)*2.6), headZ=2.4+(i%3)*1.2;
        this.boxAt(x,yy,headZ-0.65,0.9,0.7,1.15,i%5===0?home:i%4===0?'#d8b75d':'#42516b');
        this.orb(x,yy,headZ+0.18+0.06*Math.sin(t*2+i),0.42,i%4===0?'#704a36':'#b38667');
      }
    }
    // Mesa de arbitragem e reservas: corpos apenas dos jogadores que não estão em quadra.
    this.boxAt(47,59,1.7,14,2.5,2,'#222c3b');
    this.boxAt(47,57.65,2.1,12,0.15,1.3,home);
    for(const [teamIndex,team] of this.sim.teams.entries()) {
      const bench=team.all.filter(p=>!team.lineup.includes(p)).slice(0,6);
      bench.forEach((p,i)=>{
        const x=teamIndex?70+i*2.4:12+i*2.4, c=team.colors?.[0]??'#607ca0';
        this.boxAt(x,58,0.8,1.8,1.5,1.6,dark);
        this.boxAt(x,58,2.2,1.1,0.7,1.3,c);
        this.orb(x,58,3.25,0.48,'#b38969');
      });
    }
    for(const x of [5.25,COURT.L-5.25]) {
      const sign=x<47?1:-1;
      this.boxAt(x-sign*3,25,5,0.5,0.5,10,metal);
      this.boxAt(x-sign*1.6,25,10,2.8,6,0.28,white);
      for(let i=0;i<12;i++) {
        const a=i*Math.PI/6;
        this.boxAt(x+Math.cos(a)*0.8,25+Math.sin(a)*0.8,10,0.31,0.31,0.15,'#f06a29',a);
        this.boxAt(x+Math.cos(a)*0.65,25+Math.sin(a)*0.65,9.25,0.055,0.055,1.25,white);
      }
    }
  }
  drawPlayer(p) {
    const speed=Math.hypot(p.vx,p.vy), a=p.anim&&this.sim.t-p.anim.t<0.7?p.anim:null;
    const jump=a&&['shot','contest','dunk','rebound'].includes(a.type)?Math.sin(clamp((this.sim.t-a.t)/0.7,0,1)*Math.PI)*1.6:0;
    const stride=document.documentElement.dataset.motion==='off'?0:Math.min(0.55,speed/12)*Math.sin(this.sim.t*(6+speed*.3)+stableId(p.id));
    const yaw=Number.isFinite(p.facing)?p.facing:0;
    const shirt=this.sim.teams[p.team].colors?.[0]??'#527ec0';
    const trim=this.sim.teams[p.team].colors?.[1]??white;
    const height=clamp((p.data?.heightIn??78)/78,0.82,1.16);
    const skin=['#c48f69','#8d5a40','#d8aa85','#6c4537'][stableId(p.id)%4];
    const z=jump;
    // Sombra em tempo real sob o centro do atleta; pernas e braços acompanham a velocidade e a ação.
    this.boxAt(p.x,p.y,0.03,2.4,1.3,0.04,'#454b53',yaw);
    if (this.playerModel) this.drawMesh(this.playerModel,p.x,p.y,z+2.72*height,1.55,0.92,2.2*height,shirt,yaw);
    else this.boxAt(p.x,p.y,z+3.8*height,1.4,0.9,2.15*height,shirt,yaw);
    this.boxAt(p.x,p.y,z+4.75*height,1.45,0.95,0.18,trim,yaw);
    this.boxAt(p.x,p.y,z+2.55*height,1.3,0.9,0.65*height,shirt,yaw);
    this.orb(p.x,p.y,z+5.55*height,0.56*height,skin);
    for(const side of [-1,1]) {
      const localX=side*0.43, swing=stride*side;
      this.boxAt(p.x+Math.cos(yaw)*localX,p.y+Math.sin(yaw)*localX,z+1.3*height,0.5,0.53,2.4*height,skin,yaw,swing);
      this.boxAt(p.x+Math.cos(yaw)*side*0.89,p.y+Math.sin(yaw)*side*0.89,z+3.45*height,0.42,0.46,1.6*height,skin,yaw,-swing+(a?.type==='shot'?-.8:0));
    }
    if(p.hasBall) this.boxAt(p.x,p.y,0.07,2.7,1.5,0.08,'#f2c24f',yaw);
  }
  drawBall() {
    const b=visualBall(this.sim);
    if(!b) return;
    this.boxAt(b.x,b.y,0.04,0.9+b.z*.06,0.9+b.z*.06,0.05,'#423830');
    this.orb(b.x,b.y,Math.max(0.48,b.z),0.39,'#d97830');
  }
  updateCamera(dt) {
    const b=this.sim.ball, follow=this.camera==='follow'||this.camera==='replay';
    const targetX=follow?clamp(b.x,20,74):47;
    this.target[0]+=(targetX-this.target[0])*Math.min(1,dt*2.2);
    const x=this.target[0];
    if(this.camera==='diagonal') return [[111,-52,89],[47,25,0]];
    if(this.camera==='basket') return [[-20,25,28],[50,25,2]];
    if(this.camera==='follow') return [[x+24,-44,39],[x,25,2]];
    if(this.camera==='replay') return [[x+19,-30,22],[x,25,3]];
    return [[47,-70,66],[47,25,0]];
  }
  draw(dt=1/60) {
    if(this.lost) return;
    const gl=this.gl,q=qualityOf(this.quality);
    const w=Math.max(1,Math.round(this.canvas.clientWidth*Math.min(window.devicePixelRatio||1,q.dpr)));
    const h=Math.max(1,Math.round(this.canvas.clientHeight*Math.min(window.devicePixelRatio||1,q.dpr)));
    if(w!==this.canvas.width||h!==this.canvas.height){this.canvas.width=w;this.canvas.height=h;}
    const logo=this.logoOf(this.sim.teams[0]);
    if(!this.logoReady&&logo?.complete&&logo.naturalWidth>1)this.uploadCourt();
    gl.viewport(0,0,w,h);gl.clearColor(0.025,0.036,0.06,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    const [eye,target]=this.updateCamera(dt);
    gl.uniformMatrix4fv(this.uniforms.uViewProjection,false,multiply(perspective(Math.PI/3,w/h,0.1,320),lookAt(eye,target)));
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.uniform1i(this.uniforms.uTexture,0);
    this.drawArena();
    for(const p of this.sim.court) this.drawPlayer(p);
    this.drawBall();
    gl.bindVertexArray(null);
  }
  dispose() {
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost',this.onLost);
    const gl=this.gl;if(!gl||this.lost)return;
    for(const m of [this.box,this.sphere,this.floor,this.playerModel].filter(Boolean)){gl.deleteBuffer(m.buffer);gl.deleteVertexArray(m.vao);}
    gl.deleteTexture(this.texture);gl.deleteProgram(this.program);
  }
}
