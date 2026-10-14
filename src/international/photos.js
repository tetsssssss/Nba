// Catálogo externo de retratos. NÃO altera jogadores, contratos, saves ou carreira.
import curated from './verified-photos.json' with {type:'json'};
export const PHOTO_STORAGE_KEY = 'nba-universe:int-photo-overrides:v1';
export const curatedPhotos = Object.freeze(curated);
export const photoKey = p => `${p.teamId}:${p.name}`;
export const photoSearchUrl = p => 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(`${p.name} ${p.league === 'NBB' ? 'NBB Brasil' : 'EuroLeague'} ${p.teamName||''} basquete jogador retrato`);
export function validateImageUrl(value){
 if(typeof value!=='string'||value.length>2048)return null;
 try{const u=new URL(value.trim());return u.protocol==='https:'&&u.hostname&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
export function readCustomPhotos(storage=null){
 try{const store=storage||globalThis.localStorage;const data=JSON.parse(store?.getItem(PHOTO_STORAGE_KEY)||'{}');return data&&typeof data==='object'&&!Array.isArray(data)?Object.fromEntries(Object.entries(data).filter(([key,v])=>key.length<240&&validateImageUrl(v))):{};}catch{return {};}
}
export function writeCustomPhotos(map,storage=null){
 const safe=Object.fromEntries(Object.entries(map||{}).filter(([k,v])=>k.length<240&&validateImageUrl(v)).slice(0,1000));
 (storage||globalThis.localStorage)?.setItem(PHOTO_STORAGE_KEY,JSON.stringify(safe));return safe;
}
export function photoRecord(p,overrides=null){
 const key=photoKey(p), custom=(overrides||readCustomPhotos())[key], direct=validateImageUrl(custom);
 if(direct)return {url:direct,source:'custom',sourceUrl:null,credit:'URL aprovada localmente'};
 const official=curated[key];if(official)return {url:official.url,source:'curated',sourceUrl:official.source,credit:official.credit};
 if(p.photoId&&p.photoUrl)return {url:p.photoUrl,source:'nba-headshot',sourceUrl:null,credit:'Retrato público NBA'};
 return {url:null,source:'pending',sourceUrl:null,credit:null};
}
export function photoStats(players,overrides=null){
 const out={total:players.length,curated:0,custom:0,'nba-headshot':0,pending:0};
 for(const p of players)out[photoRecord(p,overrides).source]++;
 return out;
}
export function exportPhotoOverrides(map){return JSON.stringify({schema:'nba-international-photos/v1',photos:map},null,2);}
export function importPhotoOverrides(raw,allowedKeys){
 if(typeof raw!=='string'||raw.length>400000)throw Error('Arquivo muito grande.');
 let input;try{input=JSON.parse(raw);}catch{throw Error('JSON inválido.');}
 if(input?.schema!=='nba-international-photos/v1'||!input.photos||Array.isArray(input.photos)||typeof input.photos!=='object')throw Error('Formato de catálogo inválido.');
 const result={};for(const [k,v] of Object.entries(input.photos)){
  if(!allowedKeys.has(k))continue;
  const url=validateImageUrl(v);if(!url)throw Error(`URL de foto inválida: ${k}`);result[k]=url;
 }
 if(Object.keys(result).length>1000)throw Error('Limite de fotos excedido.');return result;
}
