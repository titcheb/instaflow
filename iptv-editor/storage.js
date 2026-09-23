import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from 'redis';
import { gzipSync, gunzipSync } from 'zlib';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR=path.join(__dirname,'data');
const DATA_FILE=path.join(DATA_DIR,'store.json');
const REDIS_URL=process.env.REDIS_URL||'';
const REDIS_KEY=process.env.REDIS_KEY||'nexa:iptv-editor:store:v1';
fs.mkdirSync(DATA_DIR,{recursive:true});

let client=null;
let ready=false;
let flushPromise=Promise.resolve();
let flushing=false;
let pendingRemote=null;

function emptyStore(){return{users:[],playlists:[],channels:[],seq:{user:1,playlist:1,channel:1}}}
function countsOf(store){return{users:store.users?.length||0,playlists:store.playlists?.length||0,channels:store.channels?.length||0}}

export function readStoreSync(){
  try{
    const parsed=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
    return parsed&&typeof parsed==='object'?parsed:emptyStore();
  }catch{return emptyStore()}
}

function writeLocalRaw(raw){
  const tmp=DATA_FILE+'.tmp';
  fs.writeFileSync(tmp,raw);
  fs.renameSync(tmp,DATA_FILE);
}

function encodeRaw(raw){
  const gz=gzipSync(raw,{level:6});
  return {payload:'gz:'+gz.toString('base64'),rawBytes:Buffer.byteLength(raw),storedBytes:gz.length};
}

function decodeRaw(payload){
  if(!payload)return null;
  if(payload.startsWith('gz:'))return gunzipSync(Buffer.from(payload.slice(3),'base64')).toString('utf8');
  return payload;
}

function scheduleRemoteRaw(raw,counts={users:0,playlists:0,channels:0}){
  if(!ready||!client?.isOpen)return Promise.resolve();
  pendingRemote={raw,counts};
  if(flushing)return flushPromise;
  flushing=true;
  flushPromise=(async()=>{
    try{
      while(pendingRemote){
        const job=pendingRemote;pendingRemote=null;
        const encoded=encodeRaw(job.raw);
        await client.set(REDIS_KEY,encoded.payload);
        console.log(`[storage] saved compressed state: ${job.counts.users} users, ${job.counts.playlists} playlists, ${job.counts.channels} channels, ${(encoded.rawBytes/1048576).toFixed(1)}MB -> ${(encoded.storedBytes/1048576).toFixed(1)}MB`);
      }
    }finally{flushing=false}
  })();
  return flushPromise;
}

export function writeStoreSync(store){
  const raw=JSON.stringify(store);
  writeLocalRaw(raw);
  const remoteWrite=scheduleRemoteRaw(raw,countsOf(store));
  void remoteWrite.catch(e=>console.error('[storage] remote write failed:',e.message));
  return remoteWrite;
}

export async function syncRemoteFromDisk(){
  try{
    const raw=fs.readFileSync(DATA_FILE,'utf8');
    let counts={users:0,playlists:0,channels:0};
    try{counts=countsOf(JSON.parse(raw))}catch{}
    await scheduleRemoteRaw(raw,counts);
  }catch{}
}

export async function initStorage(){
  if(!REDIS_URL){console.warn('[storage] REDIS_URL missing; using local ephemeral storage');return}
  client=createClient({url:REDIS_URL,socket:{connectTimeout:8000,reconnectStrategy:r=>Math.min(1000+r*250,5000)}});
  client.on('error',e=>console.error('[storage] redis error:',e.message));
  await client.connect();
  ready=true;
  const remote=await client.get(REDIS_KEY);
  if(remote){
    try{
      const raw=decodeRaw(remote),parsed=JSON.parse(raw);
      if(parsed&&typeof parsed==='object'){
        writeLocalRaw(raw);
        const counts=countsOf(parsed);
        console.log(`[storage] restored remote state: ${counts.users} users, ${counts.playlists} playlists, ${counts.channels} channels${remote.startsWith('gz:')?' (compressed)':''}`);
        if(!remote.startsWith('gz:'))void scheduleRemoteRaw(raw,counts).catch(e=>console.error('[storage] compression migration failed:',e.message));
        return;
      }
    }catch(e){console.error('[storage] invalid remote state:',e.message)}
  }
  const local=readStoreSync();
  await writeStoreSync(local);
  console.log('[storage] initialized remote state from local store');
}

export async function closeStorage(){
  try{await flushPromise.catch(()=>{});if(client?.isOpen)await client.quit()}catch{}
}
