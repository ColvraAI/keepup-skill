// Where the engine reads its records from. In a checkout of this repo that is the repo itself, db/ and data/db, with no
// network: repo mode, today's behaviour. In the client a customer installs, keepup.client.json sits at the top (only
// scripts/build-client.ts writes it) and records come from a signed detection pack instead: the one this run recorded,
// or the newest of the cached pack and the baseline that shipped, checked against the client's own keys and unpacked
// byte for byte before any loader reads it. Levers come only from what the server returned for this run, checked again
// on every read, because a session reads them as instructions to a model and a cache file is easy to edit.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
                                         
import { openLeverEnvelope } from './lever-payload.js';
import { materializePack,            packId, packMatchesDir, parsePack } from './pack.js';
import {                   verifyEnvelope } from './signing.js';

/** From import.meta.url, which Node 18 has: the dirname shorthand on import.meta came only in Node 20.11. */
export const CLIENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CLIENT_FILE = 'keepup.client.json';
export const BASELINE_FILE = join('baseline', 'pack.json');
/** What the server returned for one run, in that run's session folder. */
export const SERVED_FILE = 'served.json';
const PACK_ID = /^[0-9a-f]{16}$/;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

                                          
                                              

                               
                           
                                                                                                                                  
                        
                             
 

                           
                      
                         
                            
                                      
                                      
                              
                                                                                                                        
                                    
 

                              
                      
                        
                              
 

export class StoreError extends Error {
  constructor(message        ) {
    super(message);
    this.name = 'StoreError';
  }
}

export function keepupHome(env                    = process.env)         {
  return env.KEEPUP_HOME ? resolve(env.KEEPUP_HOME) : join(homedir(), '.keepup');
}

export function packEnvelopeFile(home        , id        )         {
  return join(home, 'cache', 'packs', `${id}.json`);
}

export function packFolder(home        , id        )         {
  return join(home, 'cache', 'packs', id);
}

export function currentPackFile(home        )         {
  return join(home, 'cache', 'current.json');
}

/** https, or plain http to this machine for a local build and the tests. */
export function allowedApi(url        )          {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && LOCAL_HOSTS.has(parsed.hostname));
  } catch {
    return false;
  }
}

function readJson(file        )          {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function isObject(value         )                                   {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseClientConfig(text        )               {
  const damaged = (why        ) => new StoreError(`${CLIENT_FILE} is damaged (${why}). Reinstall keepup.`);
  let raw         ;
  try {
    raw = JSON.parse(text);
  } catch {
    throw damaged('not JSON');
  }
  if (!isObject(raw)) throw damaged('not an object');
  if (typeof raw.version !== 'string' || !raw.version) throw damaged('no version');
  // No api at all is a build with no server yet. One that is there must be an address this client may call.
  if ('api' in raw && (typeof raw.api !== 'string' || !allowedApi(raw.api))) throw damaged('no https address for the server');
  const keys = raw.keys;
  if (!isObject(keys) || Object.keys(keys).length === 0 || !Object.values(keys).every((key) => typeof key === 'string' && key.length > 0)) throw damaged('no trusted keys');
  return { version: raw.version, ...(typeof raw.api === 'string' ? { api: raw.api } : {}), keys: { ...(keys                          ) } };
}

export function readCurrentPack(home        )                     {
  const value = readJson(currentPackFile(home));
  if (!isObject(value) || typeof value.id !== 'string' || !PACK_ID.test(value.id) || typeof value.fetched_at !== 'string') return null;
  return { id: value.id, etag: typeof value.etag === 'string' ? value.etag : `"${value.id}"`, fetched_at: value.fetched_at };
}

                      
                      
                      
                              
 

                                                                      

/** A pack envelope on disk, once its signature holds and it reads as a pack. `expected` is the id its file name claims. */
function openPackFile(file        , keys             , source            , expected         )         {
  if (!existsSync(file)) return { note: `${source === 'baseline' ? 'the baseline pack' : `cached pack ${expected}`} is missing` };
  try {
    const payload = verifyEnvelope(readJson(file), keys);
    const id = packId(payload);
    if (expected !== undefined && id !== expected) return { note: `cached pack ${expected} holds another pack` };
    return { ok: { id, pack: parsePack(payload), source } };
  } catch (error) {
    return { note: `${source === 'baseline' ? 'the baseline pack' : `cached pack ${expected}`} was refused: ${(error         ).message}` };
  }
}

function recordedPackId(runDir                    )                {
  if (!runDir) return null;
  const served = readJson(join(runDir, SERVED_FILE));
  return isObject(served) && typeof served.pack === 'string' && PACK_ID.test(served.pack) ? served.pack : null;
}

                        
                       
                          
 

function newest(packs                       )                         {
  return [...packs].sort((a, b) => Date.parse(b.pack.built_at) - Date.parse(a.pack.built_at))[0];
}

/** The newest trusted pack here, the cached current one or the baseline, with what was passed over on the way. */
function newestOpened(clientRoot        , home        , keys             , baseline         = openPackFile(join(clientRoot, BASELINE_FILE), keys, 'baseline'))                                                                      {
  const currentId = readCurrentPack(home)?.id;
  const cached = currentId ? openPackFile(packEnvelopeFile(home, currentId), keys, 'cache', currentId) : undefined;
  const opened = [cached, baseline].filter((item)                 => item !== undefined);
  const notes = opened.flatMap((item) => ('note' in item ? [item.note] : []));
  return { chosen: newest(opened.flatMap((item) => ('ok' in item ? [item.ok] : []))), notes };
}

function choosePack(clientRoot        , home        , keys             , runDir                    )                                                                      {
  const baseline = openPackFile(join(clientRoot, BASELINE_FILE), keys, 'baseline');
  const recorded = recordedPackId(runDir);
  if (recorded) {
    const hit = 'ok' in baseline && baseline.ok.id === recorded ? baseline : openPackFile(packEnvelopeFile(home, recorded), keys, 'cache', recorded);
    if ('ok' in hit) return { chosen: hit.ok, notes: [] };
  }
  return newestOpened(clientRoot, home, keys, baseline);
}

                           
                      
                            
                                      
 

/**
 * The newest pack this client already trusts, the cached current one or the baseline it shipped with. A refresh never
 * goes back past it, and its revocations hold whatever pack a run recorded: an old pack replayed by whoever answers
 * for our server can't bring a withdrawn lever back.
 */
export function newestHeldPack(home        , keys             , clientRoot         = CLIENT_ROOT)                  {
  const { chosen } = newestOpened(clientRoot, home, keys);
  return chosen ? { id: chosen.id, built_at: chosen.pack.built_at, revoked: chosen.pack.revoked } : null;
}

/** The pack's folder under the cache, made to match the signed pack exactly before anything reads it. */
function unpacked(opened            , home        , notes                   )               {
  const dir = packFolder(home, opened.id);
  if (!packMatchesDir(opened.pack, dir)) materializePack(opened.pack, dir);
  const { pack } = opened;
  return { dir, info: { id: opened.id, as_of: pack.as_of, built_at: pack.built_at, min_client_version: pack.min_client_version, revoked: pack.revoked, source: opened.source, notes } };
}

function resolvePack(clientRoot        , home        , keys             , runDir                    )               {
  const { chosen, notes } = choosePack(clientRoot, home, keys, runDir);
  if (!chosen) throw new StoreError(`keepup has no detection pack it can trust: ${notes.join('; ') || 'the copy that came with it is missing'}. Reinstall keepup.`);
  return unpacked(chosen, home, notes);
}

function servedFrom(runDir        , keys             , revoked                     )                   {
  const served = readJson(join(runDir, SERVED_FILE));
  const envelopes = isObject(served) && Array.isArray(served.levers) ? served.levers : [];
  const levers = envelopes.flatMap((envelope         ) => {
    try {
      const { record } = openLeverEnvelope(envelope, keys);
      return revoked.has(record.id) ? [] : [record];
    } catch {
      // A record that fails its check is dropped here, as it was when it arrived: nothing of its text is used.
      return [];
    }
  });
  return [...new Map(levers.map((lever) => [lever.id, lever])).values()];
}

                        
                                      
                         
                        
                                         
                   
                                                                                                         
                                        
                                   
                              
 

                               
                              
                                   
 

/** Everything is read once per process and kept, except that naming a run starts the choice again. */
export function createStore(options              )        {
  const env = options.env ?? process.env;
  const memo                                                                                                    = {};
  const config = ()                      => {
    if (memo.config === undefined) {
      const file = join(options.clientRoot, CLIENT_FILE);
      memo.config = existsSync(file) ? parseClientConfig(readFileSync(file, 'utf8')) : null;
    }
    return memo.config;
  };
  const pack = (keys             )               => (memo.pack ??= resolvePack(options.clientRoot, keepupHome(env), keys, memo.runDir));
  const recordsRoot = ()         => {
    const client = config();
    return client ? pack(client.keys).dir : options.clientRoot;
  };
  return {
    clientConfig: config,
    storeMode: () => (config() ? 'client' : 'repo'),
    recordsRoot,
    curatedDir: (...parts) => join(recordsRoot(), 'db', ...parts),
    rawDir: () => join(recordsRoot(), 'data', 'db'),
    useRun: (dir) => {
      memo.runDir = dir;
      memo.pack = undefined;
      memo.served = undefined;
    },
    servedLevers: () => {
      const client = config();
      if (!client || !memo.runDir) return [];
      if (memo.served) return memo.served;
      // The run's own pack and the newest one held: a lever withdrawn since the run's pack was built stays withdrawn.
      const revoked = new Set([...pack(client.keys).info.revoked, ...(newestHeldPack(keepupHome(env), client.keys, options.clientRoot)?.revoked ?? [])]);
      return (memo.served = servedFrom(memo.runDir, client.keys, revoked));
    },
    packInfo: () => {
      const client = config();
      return client ? pack(client.keys).info : null;
    },
  };
}

let shared                   ;

function store()        {
  return (shared ??= createStore({ clientRoot: CLIENT_ROOT }));
}

export function clientConfig()                      {
  return store().clientConfig();
}

export function storeMode()            {
  return store().storeMode();
}

export function recordsRoot()         {
  return store().recordsRoot();
}

export function curatedDir(...parts          )         {
  return store().curatedDir(...parts);
}

export function rawDir()         {
  return store().rawDir();
}

export function useRun(dir                    )       {
  store().useRun(dir);
}

export function servedLevers()                   {
  return store().servedLevers();
}

export function packInfo()                  {
  return store().packInfo();
}
