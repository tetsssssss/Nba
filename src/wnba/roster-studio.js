// WNBA Fantasy Roster Studio. Deliberately independent of NBA World, IndexedDB and career.
import { createRng } from '../core/rng.js';
import { WNBA_PLAYERS } from './catalog.js';
export const WNBA_STUDIO_KEY = 'wnba-arcade-studio-v1';
export const WNBA_STUDIO_VERSION = 1;
const NAME = /^[\p{L}\p{N} .,'!&()_-]{1,42}$/u;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const playerMap = new Map(WNBA_PLAYERS.map(p => [String(p.id), p]));
const defaultTeams = () => [
  {id:'WFANTASY_A',name:'Aurora All-Stars',colors:['#b963e8','#ffb9db'],playerIds:[]},
  {id:'WFANTASY_B',name:'Cometas All-Stars',colors:['#3c86e0','#d0ebff'],playerIds:[]}
];
export function defaultWnbaStudio() {
  const teams=defaultTeams();
  const ordered=[...WNBA_PLAYERS].sort((a,b)=>b.ovr-a.ovr||a.name.localeCompare(b.name));
  ordered.slice(0,20).forEach((p,i)=>teams[i%2].playerIds.push(String(p.id)));
  return {version:WNBA_STUDIO_VERSION,name:'Fantasy WNBA',teams};
}
export function validateWnbaStudio(data,{playable=false}={}) {
  if(!data||data.version!==WNBA_STUDIO_VERSION||!Array.isArray(data.teams)||data.teams.length!==2)throw Error('Roster WNBA: formato ou versão inválida.');
  if(typeof data.name!=='string'||!NAME.test(data.name))throw Error('Nome do universo WNBA inválido.');
  const used=new Set();
  const teams=data.teams.map((t,i)=>{
    if(typeof t?.name!=='string'||!NAME.test(t.name))throw Error(`Nome do time ${i+1} inválido.`);
    if(!Array.isArray(t.colors)||t.colors.length!==2||!t.colors.every(c=>typeof c==='string'&&COLOR.test(c)))throw Error(`Cores do time ${i+1} inválidas.`);
    if(!Array.isArray(t.playerIds)||t.playerIds.length>15||(playable&&t.playerIds.length<5))throw Error(`Time ${i+1}: necessário de ${playable?5:0} a 15 jogadoras.`);
    const ids=t.playerIds.map(id=>String(id));
    for(const id of ids){if(!playerMap.has(id))throw Error(`Jogadora desconhecida: ${id}`);if(used.has(id))throw Error('Jogadora duplicada entre os elencos.');used.add(id);}
    return {id:i===0?'WFANTASY_A':'WFANTASY_B',name:t.name.trim(),colors:[...t.colors],playerIds:ids};
  });
  return {version:WNBA_STUDIO_VERSION,name:data.name.trim(),teams};
}
export function setWnbaStudioPlayer(studio,side,id){
  if(![0,1].includes(side))throw Error('Equipe inválida.');
  const current=validateWnbaStudio(studio);const pid=String(id);
  if(!playerMap.has(pid))throw Error('Jogadora desconhecida.');
  const updated=structuredClone(current);
  const already=updated.teams[side].playerIds.includes(pid);
  for(const team of updated.teams)team.playerIds=team.playerIds.filter(x=>x!==pid);
  if(!already){if(updated.teams[side].playerIds.length>=15)throw Error('Limite de 15 jogadoras.');updated.teams[side].playerIds.push(pid);}
  return validateWnbaStudio(updated);
}
export function wnbaStudioTeams(studio){
  const clean=validateWnbaStudio(studio,{playable:true});
  return clean.teams.map(t=>({id:t.id,name:t.name,fullName:t.name,colors:t.colors,
   league:'WNBA',roster:t.playerIds.map(id=>playerMap.get(id)),aiCoach:true,
   team:{id:t.id,name:t.name,colors:t.colors}}));
}
export function wnbaFantasyDraft(seed='wnba-draft'){
  const teams=defaultTeams();const pool=createRng(`wnba:fantasy:${seed}`).shuffle(WNBA_PLAYERS);
  const selection=pool.slice(0,20);
  selection.forEach((p,i)=>teams[Math.floor(i/2)%2===0?i%2:1-i%2].playerIds.push(String(p.id)));
  return validateWnbaStudio({version:1,name:`Fantasy WNBA ${String(seed).slice(0,16)}`,teams});
}
export function readWnbaStudio(storage){
  try{const raw=storage?.getItem(WNBA_STUDIO_KEY);if(raw)return validateWnbaStudio(JSON.parse(raw));}catch{/* Invalid or unavailable separate storage */}
  return defaultWnbaStudio();
}
export function writeWnbaStudio(storage,studio){
  const clean=validateWnbaStudio(studio);
  storage.setItem(WNBA_STUDIO_KEY,JSON.stringify(clean));
  return clean;
}
export function exportWnbaStudio(studio){return JSON.stringify(validateWnbaStudio(studio),null,2);}
export function importWnbaStudio(json){
  if(typeof json!=='string'||json.length>80_000)throw Error('Arquivo muito grande ou inválido.');
  let data;try{data=JSON.parse(json);}catch{throw Error('Arquivo JSON WNBA inválido.');}
  return validateWnbaStudio(data);
}
