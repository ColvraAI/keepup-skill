// The only module that calls our API. Everything it needs is handed to it, the fetch above all, so a test can play the
// server and bin/keepup.ts is the one place the real fetch comes from. Each request goes to the one host in
// keepup.client.json, over https (plain http only to this machine), refuses redirects, has its own timeout, and is
// written to the send log before it leaves. What comes back is data: a pack or a lever is kept only once its signature
// holds under a key the client ships with, and an error's words are cleaned before anyone sees them.
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
                                        
import { appendSendLog, REPO_NAME, writeFileAtomic } from './client-files.js';
import { openLeverEnvelope } from './lever-payload.js';
import { packId, parsePack } from './pack.js';
                                            
import {                                  verifyEnvelope } from './signing.js';
import { allowedApi,                    currentPackFile, newestHeldPack, packEnvelopeFile, readCurrentPack } from './store.js';
import { defang } from './text-safety.js';
import { CLIENT_VERSION, RECORD_SHAPE } from './version.js';

export { appendSendLog, readCredentials, readSendLog, writeCredentials } from './client-files.js';

/** Only a client with both a server and an account key gets one: src/client-cli.ts remoteFor builds it, and refuses without them. */
                                
                               
                           
                        
                                                                
                       
 

                                                                                                                                                                    

                                
                          
                         
                                       
                                        
                                     
 

const TIMEOUT = { pack: 8_000, levers: 10_000, other: 5_000 }         ;
const MAX_REPLY_CHARS = 32 * 1024 * 1024;
const PACK_STALE_HOURS = 20;
/** A pack left alone this long is in no session's use: a session reads the pack its own prepare recorded, within hours. */
const PACK_KEEP_DAYS = 3;
const LIMITS = { patterns: 40, providers: 30, models: 200 }         ;
const PATTERN_ID = /^PAT-[a-z0-9-]{1,60}$/;
const PROVIDER = /^[a-z0-9-]{1,30}$/;
const MODEL_ID = /^[A-Za-z0-9._:/-]{1,80}$/;
const PR_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}\/pull\/[1-9]\d{0,9}$/;
export const RETIRED_PATTERN = 'PAT-retired-model-id';
/** Provider names the server may hear. A name the engine finds that isn't here is never sent. */
export const KNOWN_PROVIDERS                    = ['anthropic', 'azure', 'bedrock', 'cohere', 'deepseek', 'fireworks', 'google', 'groq', 'huggingface', 'mistral', 'ollama', 'openai', 'openrouter', 'perplexity', 'replicate', 'together', 'vertex', 'voyage', 'xai'];

/** Requests that change nothing on the server when sent twice: the pack is a read, and the levers answer counts each lever once a day. */
const REPEATABLE                      = new Set(['/v1/pack', '/v1/levers']);

const sortedUnique = (items                   )           => [...new Set(items)].sort();

/** ft:gpt-4o-mini-2024-07-18:org:name:id and davinci:ft-org-2023 are the base model plus who tuned it. Only the base is public. */
export function baseModel(id        )         {
  if (id.startsWith('ft:')) return id.slice(3).split(':')[0];
  return id.replace(/:ft-.*$/, '');
}

/**
 * The levers body, built from the fixed schema and nothing else: the fired pattern ids (presence, not counts), the
 * provider names on the fixed list, and the model ids the pack's own public lists name. Anything else stays here.
 */
export function leversRequest(scan                          , facts                                      , retiredIds                     , listedIds                      = new Set())                {
  const bases = facts.model_ids.map((model) => baseModel(model.id));
  const fired = scan.hits.map((hit) => hit.pattern);
  const patterns = sortedUnique([...fired, ...(bases.some((id) => retiredIds.has(id)) ? [RETIRED_PATTERN] : [])]).filter((id) => PATTERN_ID.test(id));
  const fromSdks = Object.entries(facts.signals).flatMap(([name, result]) => (name.startsWith('sdk_') && result.hits > 0 ? [name.slice(4)] : []));
  const providers = sortedUnique([...facts.model_ids.map((model) => String(model.provider)), ...fromSdks]).filter((name) => KNOWN_PROVIDERS.includes(name) && PROVIDER.test(name));
  const models = sortedUnique(bases).filter((id) => (retiredIds.has(id) || listedIds.has(id)) && MODEL_ID.test(id));
  return { client: CLIENT_VERSION, shape: RECORD_SHAPE, patterns: patterns.slice(0, LIMITS.patterns), providers: providers.slice(0, LIMITS.providers), models: models.slice(0, LIMITS.models) };
}

/** How many distinct model ids here were counted and not named, for the line that says what was sent. */
export function unnamedModels(facts                          , request               )         {
  return new Set(facts.model_ids.map((model) => baseModel(model.id)).filter((id) => !request.models.includes(id))).size;
}

                                                                                                                                                        

const UNREACHABLE = "keepup's server could not be reached";

/** One request. Nothing here throws: a failure comes back as a status and a sentence. */
async function request(ctx               , method                , route        , timeoutMs        , body          , extra                         = {})                 {
  if (!allowedApi(ctx.config.api)) return { failed: 'unreachable', message: `${UNREACHABLE}: its address is not https` };
  const url = new URL(route, ctx.config.api);
  const text = body === undefined ? undefined : JSON.stringify(body);
  try {
    appendSendLog(ctx.home, { at: ctx.now().toISOString(), route: `${method} ${route}`, body: body ?? null });
  } catch (error) {
    return { failed: 'refused', message: `nothing was sent, because the send log could not be written: ${(error         ).message}` };
  }
  const headers = { Authorization: `Bearer ${ctx.key}`, 'X-Keepup-Client': CLIENT_VERSION, ...(text === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra };
  // The scan between the pack and the levers request can hold this process for many seconds, long enough for the
  // server to close the connection the first request left open. A request sent down that dead connection fails before
  // it leaves, so a read is tried once more on a fresh one. A write the server may already have stored is not.
  const tries = REPEATABLE.has(route) ? 2 : 1;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const response = await ctx.fetch(url, { method, headers, body: text, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
      const raw = await response.text();
      if (raw.length > MAX_REPLY_CHARS) return { failed: 'server_error', message: "keepup's server sent more than any answer should hold" };
      return { status: response.status, etag: response.headers.get('etag'), body: raw ? parsedOrNull(raw) : null };
    } catch {
      // The error's own words can name the address and the socket, and add nothing a person can act on.
    }
  }
  return { failed: 'unreachable', message: UNREACHABLE };
}

function parsedOrNull(raw        )          {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isObject(value         )                                   {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The server's sentence, cleaned: one line, no control codes, no live link, and short. */
function serverSentence(body         , fallback        )         {
  const error = isObject(body) && isObject(body.error) ? body.error : {};
  const said = typeof error.message === 'string' ? defang(error.message).replace(/\s+/g, ' ').trim().slice(0, 240) : '';
  return said ? `keepup's server says: ${said}` : fallback;
}

const FALLBACK                                    = {
  unreachable: UNREACHABLE,
  unknown_key: "keepup's server doesn't know this account key. Make a new one on your dashboard and set it again.",
  inactive: "This account's plan isn't active.",
  rate_limited: "keepup's server asked this client to slow down. Try again in an hour.",
  bad_request: "keepup's server refused the request as malformed. Update keepup.",
  not_connected: 'This repo is not connected to your dashboard.',
  too_many_repos: 'This account has connected as many repos as its plan allows.',
  server_error: "keepup's server had a problem. Try again later.",
  refused: "What keepup's server sent failed its check, so it was not used.",
};

function failureOf(status        , body         )          {
  const code = isObject(body) && isObject(body.error) ? body.error.code : undefined;
  if (status === 401) return 'unknown_key';
  if (status === 403) return 'inactive';
  if (status === 429) return 'rate_limited';
  if (status === 409) return code === 'too_many_repos' ? 'too_many_repos' : 'not_connected';
  if (status === 400) return 'bad_request';
  return 'server_error';
}

function failed(reply       )                                                                {
  if ('failed' in reply) return { status: reply.failed, message: reply.message };
  if (reply.status >= 200 && reply.status < 300) return null;
  const status = failureOf(reply.status, reply.body);
  const periodEnd = isObject(reply.body) && typeof reply.body.period_end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(reply.body.period_end) ? ` (period end ${reply.body.period_end})` : '';
  return { status, message: `${serverSentence(reply.body, FALLBACK[status])}${status === 'inactive' ? periodEnd : ''}` };
}

                              
                                                   
                       
                           
 

/** True with no pack fetched yet, or one fetched more than 20 hours ago. */
export function packIsStale(home        , now      )          {
  const current = readCurrentPack(home);
  const fetched = current ? Date.parse(current.fetched_at) : Number.NaN;
  return Number.isNaN(fetched) || now.getTime() - fetched > PACK_STALE_HOURS * 3_600_000;
}

function asEnvelope(value         )                  {
  return isObject(value) && typeof value.payload === 'string' && typeof value.sig === 'string' && typeof value.kid === 'string' ? { payload: value.payload, sig: value.sig, kid: value.kid } : null;
}

/** Old packs go, but never the one just fetched, the one before it, or any touched in the last few days, which a session may still be reading. */
function prunePacks(home        , keep                     , now      )       {
  const folder = join(home, 'cache', 'packs');
  if (!existsSync(folder)) return;
  const cutoff = now.getTime() - PACK_KEEP_DAYS * 86_400_000;
  for (const name of readdirSync(folder)) {
    const id = name.replace(/\.json$/, '');
    const path = join(folder, name);
    if (keep.has(id) || name.includes('.tmp-') || statSync(path).mtimeMs > cutoff) continue;
    rmSync(path, { recursive: true, force: true });
  }
}

/** The day's pack. A pack is kept only when its signature holds and it reads as a pack; until then the old one stays current. */
export async function refreshPack(ctx               )                       {
  const current = readCurrentPack(ctx.home);
  const have = current && existsSync(packEnvelopeFile(ctx.home, current.id)) ? current : null;
  const reply = await request(ctx, 'GET', '/v1/pack', TIMEOUT.pack, undefined, have ? { 'If-None-Match': `"${have.id}"` } : {});
  const fetchedAt = ctx.now().toISOString();
  if (!('failed' in reply) && reply.status === 304 && have) {
    writeFileAtomic(currentPackFile(ctx.home), JSON.stringify({ ...have, fetched_at: fetchedAt }));
    return { status: 'not_modified', id: have.id, message: `pack ${have.id} is still the newest` };
  }
  const failure = failed(reply);
  if (failure) return failure;
  const envelope = asEnvelope('failed' in reply ? null : reply.body);
  try {
    if (!envelope) throw new Error('not a signed record');
    const payload = verifyEnvelope(envelope, ctx.config.keys);
    const pack = parsePack(payload);
    const id = packId(payload);
    const etag = 'failed' in reply ? null : reply.etag?.replace(/^W\//, '') ?? null;
    if (etag !== null && etag !== `"${id}"`) throw new Error('its name and its content disagree');
    // A signature proves we built it, not that it is today's: an older pack replayed would undo every revocation since.
    const held = newestHeldPack(ctx.home, ctx.config.keys);
    if (held && Date.parse(pack.built_at) < Date.parse(held.built_at)) throw new Error(`it was built ${pack.built_at}, older than the one already here, ${held.built_at}`);
    writeFileAtomic(packEnvelopeFile(ctx.home, id), JSON.stringify(envelope));
    writeFileAtomic(currentPackFile(ctx.home), JSON.stringify({ id, etag: `"${id}"`, fetched_at: fetchedAt }));
    try {
      prunePacks(ctx.home, new Set([id, ...(have ? [have.id] : [])]), ctx.now());
    } catch {
      // A pack that can't be deleted now is deleted on a later refresh; the new one is already current.
    }
    return { status: 'ok', id, message: `pack ${id} of ${pack.as_of}` };
  } catch (error) {
    return { status: 'refused', message: `${FALLBACK.refused} (${(error         ).message})` };
  }
}

                                
                                  
                                       
                           
                            
                                                                                                                         
                           
                           
 

/** Keeps a lever only when it verifies, is for a pattern this run asked about, and the pack hasn't revoked it. */
function keptLevers(value         , keys             , asked                     , revoked                     )                                                            {
  const items = Array.isArray(value) ? value : [];
  const checked = items.map((item) => {
    try {
      const envelope = asEnvelope(item);
      const lever = openLeverEnvelope(item, keys);
      if (!envelope || !asked.has(lever.pattern)) return 'refused'         ;
      return revoked.has(lever.id) ? ('revoked'         ) : envelope;
    } catch {
      return 'refused'         ;
    }
  });
  return { levers: checked.filter((item)                   => typeof item === 'object'), refused: checked.filter((item) => item === 'refused').length };
}

export async function fetchLevers(ctx               , body               , revoked                   )                         {
  const reply = await request(ctx, 'POST', '/v1/levers', TIMEOUT.levers, body);
  const failure = failed(reply);
  const empty = { levers: [], capped: false, withheld: 0, refused: 0 };
  if (failure) return { ...empty, ...failure, message: failure.status === 'unreachable' ? 'lever matching skipped: server unreachable' : failure.message };
  const answer = 'failed' in reply ? null : reply.body;
  if (!isObject(answer) || !Array.isArray(answer.levers)) return { ...empty, status: 'refused', message: `${FALLBACK.refused} (no list of levers)` };
  const kept = keptLevers(answer.levers, ctx.config.keys, new Set(body.patterns), new Set(revoked));
  const withheld = typeof answer.withheld === 'number' && Number.isInteger(answer.withheld) && answer.withheld >= 0 ? answer.withheld : 0;
  return { status: 'ok', ...kept, capped: answer.capped === true, withheld, message: `${kept.levers.length} lever${kept.levers.length === 1 ? '' : 's'} for ${body.patterns.length} pattern id${body.patterns.length === 1 ? '' : 's'}` };
}

                         
                                  
                           
                                                                                         
                       
                                                                                                                     
                             
 

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The link to a connected repo's page, built here from its id and the client's own host. An answer isn't signed, and a
 * link in one is printed into a session, so no link an answer or a state file holds is ever passed on: only a uuid.
 */
export function repoDashboardLink(api        , id        )                     {
  return UUID.test(id) && allowedApi(api) ? new URL(`/dashboard/repos/${id}`, api).href : undefined;
}

async function post(ctx               , route        , body         , idField         )                  {
  const reply = await request(ctx, 'POST', route, TIMEOUT.other, body);
  const failure = failed(reply);
  if (failure) return failure;
  const answer = 'failed' in reply ? null : reply.body;
  const id = idField && isObject(answer) && typeof answer[idField] === 'string' && UUID.test(answer[idField]          ) ? (answer[idField]          ) : undefined;
  const matched = isObject(answer) && typeof answer.matched === 'boolean' ? answer.matched : undefined;
  return { status: 'ok', message: 'ok', ...(id ? { id } : {}), ...(matched === undefined ? {} : { matched }) };
}

const badName = (name        )         => ({ status: 'bad_request', message: `${name.slice(0, 120)} is not an owner/repo name, so nothing was sent.` });

export function connectRepo(ctx               , name        )                  {
  return REPO_NAME.test(name) ? post(ctx, '/v1/repos', { name }, 'repo') : Promise.resolve(badName(name));
}

export function disconnectRepo(ctx               , name        )                  {
  return REPO_NAME.test(name) ? post(ctx, '/v1/repos/disconnect', { name }) : Promise.resolve(badName(name));
}

                             
                        
                                
                         
                                     
                         
                               
                               
 

                             
                          
                         
                        
                                 
                          
                                                                                                              
                                           
 

export function sendRun(ctx               , run            )                  {
  return REPO_NAME.test(run.repo) ? post(ctx, '/v1/runs', run, 'run') : Promise.resolve(badName(run.repo));
}

                           
                        
                                
                         
                          
 

export function reportPr(ctx               , report          )                  {
  if (!REPO_NAME.test(report.repo)) return Promise.resolve(badName(report.repo));
  if (!PR_URL.test(report.pr_url)) return Promise.resolve({ status: 'bad_request', message: 'That is not a GitHub pull request link, so nothing was sent.' });
  return post(ctx, '/v1/prs', report);
}
