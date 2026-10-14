// Evolution 2001+: entirely fictional, local-only WNBA arcade athlete creator.
// Never touches NBA World/IndexedDB, official WNBA records, or the career module.
import { WNBA_PLAYERS, wnbaAttributes } from './catalog.js';

export const WNBA_CREATOR_KEY = 'wnba-arcade-created-players-v1';
export const WNBA_CREATOR_VERSION = 1;
export const WNBA_CREATOR_MAX_PER_TEAM = 15;
export const WNBA_CREATOR_MAX = 30;
export const CREATOR_SKILLS = Object.freeze(['shooting','handling','passing','rebounding','defense','speed']);
const NAME = /^[\p{L}\p{N} .,'-]{2,42}$/u;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const ROLES = new Set(['G','F','C']);
const BASE_SKILLS = Object.freeze({shooting:70,handling:70,passing:70,rebounding:70,defense:70,speed:70});
const clone = value => JSON.parse(JSON.stringify(value));
const playerId = n => `WCUSTOM-${String(n).padStart(4,'0')}`;

export function defaultWnbaCreator() {
  return {version:1,nextId:1,teams:[
    {id:'WCREATOR_A',name:'Aurora Criativa',colors:['#AA71D3','#F4D9FF']},
    {id:'WCREATOR_B',name:'Estrelas Criativas',colors:['#1F86AC','#B3E9F3']}
  ],players:[]};
}
export function validateWnbaCreator(input,{playable=false}={}) {
  if(!input||input.version!==WNBA_CREATOR_VERSION||!Array.isArray(input.teams)||input.teams.length!==2||!Array.isArray(input.players)||input.players.length>WNBA_CREATOR_MAX)
    throw Error('Criador WNBA: formato ou versão inválida.');
  if(!Number.isSafeInteger(input.nextId)||input.nextId<1||input.nextId>1000000)throw Error('Contador de jogadoras inválido.');
  const teams=input.teams.map((t,i)=>{
    if(t?.id!==`WCREATOR_${i===0?'A':'B'}`||typeof t.name!=='string'||!NAME.test(t.name.trim())||!Array.isArray(t.colors)||t.colors.length!==2||!t.colors.every(c=>typeof c==='string'&&COLOR.test(c)))throw Error(`Time personalizado ${i+1} inválido.`);
    return {id:t.id,name:t.name.trim(),colors:[...t.colors]};
  });
  const ids=new Set();let maximum=0;const sizes=[0,0];
  const players=input.players.map(p=>{
    const id=typeof p?.id==='string'?p.id:'';
    if(!/^WCUSTOM-[0-9]{4,6}$/.test(id)||ids.has(id))throw Error('ID de jogadora fictícia inválido ou duplicado.');
    ids.add(id);maximum=Math.max(maximum,Number(id.split('-')[1]));
    if(typeof p.name!=='string'||!NAME.test(p.name.trim())||!ROLES.has(p.role)||![0,1].includes(p.side)||!Number.isInteger(p.age)||p.age<16||p.age>49)throw Error(`Cadastro inválido: ${id}.`);
    if(!p.skills||typeof p.skills!=='object'||CREATOR_SKILLS.some(k=>!Number.isInteger(p.skills[k])||p.skills[k]<25||p.skills[k]>99))throw Error(`Atributos inválidos: ${id}.`);
    sizes[p.side]++;if(sizes[p.side]>WNBA_CREATOR_MAX_PER_TEAM)throw Error('Limite de 15 jogadoras por equipe.');
    return {id,name:p.name.trim(),role:p.role,age:p.age,side:p.side,skills:Object.fromEntries(CREATOR_SKILLS.map(k=>[k,p.skills[k]]))};
  });
  if(input.nextId<=maximum)throw Error('Contador de IDs inconsistente.');
  if(playable&&sizes.some(x=>x<5))throw Error('Crie pelo menos cinco jogadoras fictícias em cada equipe.');
  return {version:1,nextId:input.nextId,teams,players};
}
export function createWnbaPlayer(data,{name,role='G',side=0,age=24,skills=BASE_SKILLS}) {
  const clean=validateWnbaCreator(data);
  if(clean.players.filter(p=>p.side===side).length>=WNBA_CREATOR_MAX_PER_TEAM)throw Error('Limite de 15 jogadoras por equipe.');
  const player={id:playerId(clean.nextId),name,role,side,age,skills};
  return validateWnbaCreator({...clean,nextId:clean.nextId+1,players:[...clean.players,player]});
}
export function updateWnbaCreatedPlayer(data,id,updates={}) {
  const clean=validateWnbaCreator(data);const found=clean.players.find(p=>p.id===String(id));
  if(!found)throw Error('Jogadora fictícia não encontrada.');
  const updated=clean.players.map(p=>p.id===id?{...p,...updates,id:p.id,skills:{...p.skills,...(updates.skills||{})}}:p);
  return validateWnbaCreator({...clean,players:updated});
}
export function removeWnbaCreatedPlayer(data,id){
  const clean=validateWnbaCreator(data);
  if(!clean.players.some(p=>p.id===String(id)))throw Error('Jogadora fictícia não encontrada.');
  return validateWnbaCreator({...clean,players:clean.players.filter(p=>p.id!==String(id))});
}
export function renameWnbaCreatorTeam(data,side,{name,primary}={}){
  const clean=validateWnbaCreator(data);
  if(![0,1].includes(side))throw Error('Equipe inválida.');
  const teams=clean.teams.map((t,i)=>i===side?{...t,name:name??t.name,colors:[primary??t.colors[0],t.colors[1]]}:t);
  return validateWnbaCreator({...clean,teams});
}
export function creatorPlayerProfile(p,team){
  const s=p.skills;
  const stats2026={ppg:Number((2+s.shooting*.18+s.handling*.045).toFixed(1)),rpg:Number((s.rebounding*.092).toFixed(1)),apg:Number((s.passing*.072).toFixed(1))};
  const attributes=wnbaAttributes({name:p.name,position:p.role,...stats2026});
  for(const k of ['threePoint','catchAndShoot','midRange','shotCreation','pullUp','offBallMovement'])attributes[k]=s.shooting;
  for(const k of ['ballHandling','rimFinishing','layup','agility'])attributes[k]=s.handling;
  for(const k of ['passing','passingVision','decisionMaking','pickAndRoll','offensiveIQ'])attributes[k]=s.passing;
  for(const k of ['offensiveRebounding','defensiveRebounding','interiorDefense','strength'])attributes[k]=s.rebounding;
  for(const k of ['perimeterDefense','helpDefense','defensiveIQ','steals','blocks'])attributes[k]=s.defense;
  for(const k of ['speed','acceleration','stamina','vertical'])attributes[k]=s.speed;
  const ovr=Math.round(CREATOR_SKILLS.reduce((total,k)=>total+s[k],0)/CREATOR_SKILLS.length);
  const template=WNBA_PLAYERS.find(x=>x.role===p.role)??WNBA_PLAYERS[0];
  return {...clone(template),id:p.id,name:p.name,lastName:p.name.split(' ').at(-1),teamId:team.id,league:'WNBA',role:p.role,position:p.role==='G'?'PG':p.role==='F'?'SF':'C',positions:[p.role==='G'?'PG':p.role==='F'?'SF':'C'],age:p.age,ovr,attributes,stats2026,wnbaId:null,photoSource:'fictional-neutral',ratingSource:'player-creator',fictional:true,
    tendencies:{...clone(template.tendencies),threePointFreq:s.shooting,passFirst:s.passing,driveFreq:s.handling}};
}
export function wnbaCreatorTeams(data) {
  const clean=validateWnbaCreator(data,{playable:true});
  return clean.teams.map((t,side)=>({...t,fullName:t.name,league:'WNBA',aiCoach:true,
    roster:clean.players.filter(p=>p.side===side).map(p=>creatorPlayerProfile(p,t)),team:{id:t.id,name:t.name,colors:t.colors}}));
}
export function readWnbaCreator(storage){
  try{const raw=storage?.getItem(WNBA_CREATOR_KEY);if(raw)return validateWnbaCreator(JSON.parse(raw));}
  catch{/* Separate storage unavailable: provide fresh editing state. */}
  return defaultWnbaCreator();
}
export function writeWnbaCreator(storage,data){const clean=validateWnbaCreator(data);storage.setItem(WNBA_CREATOR_KEY,JSON.stringify(clean));return clean;}
export function exportWnbaCreator(data){return JSON.stringify(validateWnbaCreator(data),null,2);}
export function importWnbaCreator(json){
  if(typeof json!=='string'||json.length>160000)throw Error('JSON de criador WNBA grande demais ou inválido.');
  let value;try{value=JSON.parse(json);}catch{throw Error('JSON de criador WNBA inválido.');}
  return validateWnbaCreator(value);
}
