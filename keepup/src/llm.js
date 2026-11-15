// Claude, through plain fetch. No SDK and no tools: the model reads masked text and answers JSON.
// Sonnet 5.5 rejects temperature, top_p, top_k and budget_tokens, so none are sent; effort and a schema steer it, and
// two fresh answers can differ. A demo's repeatability comes from replaying saved answers (data/replay), not from the model.
// The cap is hard: a call goes out only if the worst it can cost still fits under --max-usd.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { loadRecords } from './db.js';
import { loadEnv, NeedsKeyError } from './env.js';
import { loadLevers } from './levers.js';
import { maskText } from './mask.js';
import { REPO_ROOT } from './signals.js';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const DEFAULT_MAX_USD = 1.5;
/** Answers to identical requests, so a re-run with the same prompts costs nothing. Git ignores tmp/. */
export const DEFAULT_LLM_CACHE = join(REPO_ROOT, 'tmp', 'llm-cache');
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const MAX_ATTEMPTS = 4;
const TIMEOUT_MS = 280_000;
const RETRY_BASE_MS = 2000;
const MIN_OUTPUT_TOKENS = 200;
/** Over-counts on purpose: the cap has to hold before the real count is known. */
const CHARS_PER_TOKEN = 3;
const MILLION = 1_000_000;
const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529]);
/** Anthropic's listed multipliers (db/levers/ADV-2026-1007-anthropic-prompt-caching.json), for a model the lever gives no dollars for. */
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

                                               

                             
                           
                          
                                                                           
                          
                          
                                                     
                             
                          
 

                             
                         
                         
                          
                               
                              
                          
 

                           
                         
                                
                                 
                                               
                                           
                       
                                
                         
                                  
                                
 

                      
                                                       
                                 
                          
 

                             
                          
                          
                           
                            
                                    
                              
                             
                                                                                                                
                              
                                                 
 

export class BudgetExceededError extends Error {
  constructor(spent        , cap        , purpose        ) {
    super(`Stopped before "${purpose}": $${spent.toFixed(4)} spent, and the next call could pass the $${cap.toFixed(2)} cap.`);
    this.name = 'BudgetExceededError';
  }
}

export class LlmRefusalError extends Error {
  constructor(category         , purpose        ) {
    super(`Claude declined "${purpose}" (${typeof category === 'string' ? category : 'no category'}).`);
    this.name = 'LlmRefusalError';
  }
}

export function resolveApiKey(env                                     = loadEnv())         {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) throw new NeedsKeyError(['ANTHROPIC_API_KEY']);
  return key;
}

function openRouterId(model        )         {
  return `anthropic/${model.replace(/-(\d+)-(\d+)$/, '-$1.$2')}`;
}

function displayName(model        )         {
  const match = model.match(/^claude-([a-z]+)-(\d+)-(\d+)$/);
  return match ? `${match[1][0].toUpperCase()}${match[1].slice(1)} ${match[2]}.${match[3]}` : model;
}

/** Cache prices the lever states in dollars for this model, else Anthropic's multipliers. */
function cachePrices(model        , input        )                                  {
  const lever = loadLevers().find((candidate) => candidate.id === 'ADV-2026-1007-anthropic-prompt-caching');
  const name = displayName(model).replace('.', '\\.');
  const stated = (lever?.price ?? '').match(new RegExp(`${name}:.*?\\$([\\d.]+) 5-minute write.*?\\$([\\d.]+) cache read`));
  if (stated) return { write: Number(stated[1]), read: Number(stated[2]) };
  return { write: input * CACHE_WRITE_MULTIPLIER, read: input * CACHE_READ_MULTIPLIER };
}

/** The price per million tokens, from data/db. Throws rather than guessing. */
export function modelPrice(model        )             {
  const id = openRouterId(model);
  const row = loadRecords(['openrouter']).find((record) => record.model_id === id);
  const input = row?.price_in_per_m;
  const output = row?.price_out_per_m;
  if (typeof input !== 'number' || typeof output !== 'number') throw new Error(`No price for ${model} in data/db (looked for ${id}).`);
  const cache = cachePrices(model, input);
  return { model, input, output, cache_write: cache.write, cache_read: cache.read, source: row?.url ?? 'data/db/openrouter.jsonl.gz' };
}

export function buildRequestBody(request            , model        , maxTokens        )                          {
  const cache = { cache_control: { type: 'ephemeral' } };
  return {
    model,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: request.system, ...cache }],
    messages: [{
      role: 'user',
      content: [
        ...(request.prefix ? [{ type: 'text', text: request.prefix, ...cache }] : []),
        { type: 'text', text: request.prompt },
      ],
    }],
    output_config: { effort: request.effort, format: { type: 'json_schema', schema: request.schema } },
  };
}

                    
                                 
                                  
                                                
                                            
 

                    
                                
                                                          
                                                                                  
                            
 

function costOf(usage          , price            )         {
  const dollars = (usage.input_tokens ?? 0) * price.input
    + (usage.output_tokens ?? 0) * price.output
    + (usage.cache_creation_input_tokens ?? 0) * price.cache_write
    + (usage.cache_read_input_tokens ?? 0) * price.cache_read;
  return dollars / MILLION;
}

function replyJson   (reply          , purpose        )    {
  if (reply.stop_reason === 'refusal') throw new LlmRefusalError(reply.stop_details?.category, purpose);
  if (reply.stop_reason === 'max_tokens') throw new Error(`Claude's answer to "${purpose}" was cut off at max_tokens.`);
  const text = (reply.content ?? []).filter((block) => block.type === 'text').map((block) => block.text ?? '').join('');
  try {
    return JSON.parse(text)     ;
  } catch {
    throw new Error(`Claude's answer to "${purpose}" isn't JSON.`);
  }
}

function retryDelay(response                 , attempt        )         {
  const stated = Number(response?.headers.get('retry-after'));
  return Number.isFinite(stated) && stated > 0 ? stated * 1000 : RETRY_BASE_MS * 2 ** attempt;
}

async function apiError(response          , purpose        )                 {
  let detail = '';
  try {
    const body = await response.json()                                    ;
    detail = body.error?.message ?? '';
  } catch {
    detail = '';
  }
  return new Error(`The Anthropic API answered ${response.status} to "${purpose}": ${maskText(detail)}`.trim());
}

                  
                          
                           
                                   
                                                
 

function headersFor(apiKey        )                         {
  return { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': API_VERSION };
}

/** One request, with retries for what a retry can fix. A connection error's message never carries the key. */
async function send(sender        , body                         , purpose        )                    {
  let last               = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let response                  = null;
    try {
      response = await sender.fetchImpl(sender.baseUrl, { method: 'POST', headers: headersFor(sender.apiKey), body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      last = new Error(`Can't reach the Anthropic API for "${purpose}": ${maskText((error         ).message)}`);
    }
    if (response?.ok) return await response.json()            ;
    if (response && !RETRYABLE.has(response.status)) throw await apiError(response, purpose);
    if (response) last = await apiError(response, purpose);
    if (attempt < MAX_ATTEMPTS - 1) await sender.sleep(retryDelay(response, attempt));
  }
  throw last ?? new Error(`No answer to "${purpose}".`);
}

function cachePathFor(cacheDir        , body                         )         {
  return join(cacheDir, `${createHash('sha256').update(JSON.stringify(body)).digest('hex')}.json`);
}

function readCached(path        )                  {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'))            ;
  } catch {
    return null;
  }
}

/** Only the answer and its token counts are kept. The prompt, and any repo text in it, is not. */
function writeCache(cacheDir        , path        , reply          , purpose        , usd        )       {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(path, JSON.stringify({ stop_reason: reply.stop_reason, content: reply.content, usage: reply.usage }));
  appendFileSync(join(cacheDir, 'ledger.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), purpose, usd, usage: reply.usage })}\n`);
}

                 
                                                                                                                                                  
 

function worstInputCost(request            , price            )         {
  const chars = request.system.length + request.prefix.length + request.prompt.length + JSON.stringify(request.schema).length;
  return ((chars / CHARS_PER_TOKEN) * Math.max(price.input, price.cache_write)) / MILLION;
}

/** The biggest max_tokens the cap can still pay for, and the most that call can cost; null when it can't be paid for. */
function planCall(request            , price            , remaining        )                                           {
  const input = worstInputCost(request, price);
  const tokens = Math.min(request.maxTokens, Math.floor(((remaining - input) * MILLION) / price.output));
  return tokens < MIN_OUTPUT_TOKENS ? null : { tokens, worst: input + (tokens * price.output) / MILLION };
}

function addReply(tally       , usage          , usd        )       {
  tally.input += usage.input_tokens ?? 0;
  tally.output += usage.output_tokens ?? 0;
  tally.write += usage.cache_creation_input_tokens ?? 0;
  tally.read += usage.cache_read_input_tokens ?? 0;
  tally.usd += usd;
  tally.calls += 1;
}

                   
                          
                         
                             
                          
                             
                              
                        
 

async function callApi   (session         , request            , cachePath               )             {
  const { tally, price, maxUsd, cacheDir } = session;
  const plan = planCall(request, price, maxUsd - tally.usd - tally.reserved);
  if (!plan) throw new BudgetExceededError(tally.usd, maxUsd, request.purpose);
  tally.reserved += plan.worst;
  try {
    const reply = await send(session.sender, buildRequestBody(request, session.model, plan.tokens), request.purpose);
    const usd = costOf(reply.usage ?? {}, price);
    addReply(tally, reply.usage ?? {}, usd);
    const parsed = replyJson   (reply, request.purpose);
    if (cachePath && cacheDir) writeCache(cacheDir, cachePath, reply, request.purpose, usd);
    return parsed;
  } finally {
    tally.reserved -= plan.worst;
  }
}

function record(session         , cachePath               )       {
  if (!session.recordDir || !cachePath || !existsSync(cachePath)) return;
  mkdirSync(session.recordDir, { recursive: true });
  writeFileSync(join(session.recordDir, basename(cachePath)), readFileSync(cachePath));
}

async function askClaude   (session         , request            )             {
  const { cacheDir, model, tally, price } = session;
  const cachePath = cacheDir ? cachePathFor(cacheDir, buildRequestBody(request, model, request.maxTokens)) : null;
  const cached = cachePath ? readCached(cachePath) : null;
  if (!cached) {
    const answer = await callApi   (session, request, cachePath);
    record(session, cachePath);
    return answer;
  }
  tally.replayed += 1;
  tally.replayedUsd += costOf(cached.usage ?? {}, price);
  record(session, cachePath);
  return replyJson   (cached, request.purpose);
}

export function createLlm(options            )      {
  const model = options.model ?? DEFAULT_MODEL;
  const price = options.price ?? modelPrice(model);
  const maxUsd = options.maxUsd ?? DEFAULT_MAX_USD;
  const sender         = {
    apiKey: options.apiKey,
    baseUrl: options.baseUrl ?? API_URL,
    fetchImpl: options.fetchImpl ?? fetch,
    sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  };
  const tally        = { input: 0, output: 0, write: 0, read: 0, usd: 0, calls: 0, replayed: 0, replayedUsd: 0, reserved: 0 };
  const session          = { sender, model, price, maxUsd, cacheDir: options.cacheDir, recordDir: options.recordDir, tally };
  const usage = ()           => ({
    model, input_tokens: tally.input, output_tokens: tally.output, cache_creation_input_tokens: tally.write, cache_read_input_tokens: tally.read,
    usd: tally.usd, price_source: price.source, calls: tally.calls, replayed_calls: tally.replayed, replayed_usd: tally.replayedUsd,
  });
  return { ask: (request) => askClaude(session, request), usage, maxUsd };
}
