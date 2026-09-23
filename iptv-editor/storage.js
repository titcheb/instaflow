import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from 'redis';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR=path.join(__dirname,'data');
const DATA_FILE=path.join(DATA_DIR,'store.json');
const REDIS_URL=process.env.REDIS_URL||'';
const REDIS_KEY=process.env.REDIS_KEY||'nexa:iptv-editor:store:v1';
fs.mkdirSync(DATA_DIR,{recursive:true});

let client=null;
let ready=false;
let lastWrite=Promise.resolve();

function emptyStore(){return{users:[],playlists:[],channels:[],seq:{user:1,playlist:1,channel:1}}}

export function readStoreSync(){
  try{
    const parsed=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
    return parsed&&typeof parsed==='object'?parsed:emptyStore();
  }catch{return emptyStore()}
}

function writeLocal(store){
  const tmp=DATA_FILE+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(store));
  fs.renameSync(tmp,DATA_FILE);
}

async function pushRemote(store){
  if(!ready||!client?.isOpen)return;
  const payload=JSON.stringify(store);
  lastWrite=lastWrite.catch(()=>{}).then(()=>client.set(REDIS_KEY,payload));
  await lastWrite;
}

export function writeStoreSync(store){
  writeLocal(store);
  void pushRemote(store).catch(e=>console.error('[storage] remote write failed:',e.message));
}

export async function syncRemoteFromDisk(){
  const s=readStoreSync();
  await pushRemote(s);
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
      const parsed=JSON.parse(remote);
      if(parsed&&typeof parsed==='object'){
        writeLocal(parsed);
        console.log(`[storage] restored remote state: ${parsed.users?.length||0} users, ${parsed.playlists?.length||0} playlists, ${parsed.channels?.length||0} channels`);
        return;
      }
    }catch(e){console.error('[storage] invalid remote state:',e.message)}
  }
  const local=readStoreSync();
  await pushRemote(local);
  console.log('[storage] initialized remote state from local store');
}

export async function closeStorage(){
  try{await lastWrite.catch(()=>{});if(client?.isOpen)await client.quit()}catch{}
}
