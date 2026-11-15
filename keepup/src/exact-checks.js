// Deterministic candidates: (a) each model id in the repo against the provider changelogs,
// (b) each declared dependency against what's newer. (b) reads the database by default, and
// asks the registries only when told to (--online).
                                                   
                                                      
                                                            
                                                    
                                                         
import { isDataFile } from './catalog-use.js';
import { pathContext, TEMPLATE_FILES } from './code-context.js';
import { findByDisplayName, findRetirement,                                         statusAsOf } from './retirements.js';
import { registryInfo,                   } from './registry.js';
import { allowsVersion, lowestVersionIn, majorsBehind,                specKind } from './semver.js';

const CATALOG_MIN_IDS = 8;
const STALE_MONTHS = 18;
const NPM_CONCURRENCY = 8;
const PYPI_CONCURRENCY = 4;

                                                                                                                                                                            

                                                  
                              
 

/** A live place that sits in a table a picker or a lookup reads. */
                                               
                             
 

/** Providers and servers that aren't the maker of the model id, named in the path: this id goes to them, not to the maker. */
const GATEWAY_PATH = /(?:^|[/._-])(?:lemonade|cometapi|openrouter|litellm|lmstudio|localai|\w*generic\w*|\w*compatible\w*|ollama|groq|fireworks\w*|together\w*|deepinfra|novita|azure\w*|bedrock|perplexity|mistral|xai|deepseek|cohere|foundry|dpais|ppio|moonshot\w*|nvidia\w*|giteeai|sambanova|apipie|textgenwebui|koboldcpp|oobabooga|vllm|tgi|cerebras|hyperbolic|siliconflow|zai|docker\w*)(?:[/._-]|$)/i;
/** A line that shows an id to a person rather than sending it. */
const TOKENIZER = /tiktoken|tokeni[sz]er|encoding_for_model/i;
/** A menu whose value is a number, with the model named only in its text: a token limit, not a model anyone sends. */
const LABEL_LINE = /<option\b[^>]*\bvalue=\{?["']?\d|^\s*[\d,]{3,}\s*\(/;
/** process.env.X ?? "id": the value sent when nothing is set, however many models the file names. */
const FALLBACK_LINE = /(?:\?\?|\|\|)\s*["'`]/;
const DISPLAY_LINE = /\bplaceholder\b|\bconsole\.\w+\(|\b(?:logger|log|tracing)(?:\.|::)\w+!?\(|\b(?:println|eprintln|info|warn|debug)!\(|\bhelpText\b|\bhint\b|\be\.g\.,? /;

                               
                                                                                                       
                                   
                                                                     
                                                                 
                                                                                     
                                                                  
                                                                                                          
                                                       
                                                                                     
                                  
 

                             
                         
                         
                                            
                                    
                                    
                                    
                                         
                          
                            
                                             
                                             
                                                                                                      
                              
                                                                                                             
                                  
                                          
                                
                              
                                    
                                                                                                                   
                               
 

const HASH_OR_SLASH_COMMENT = /^\s*(?:#|\/\/|\/\*|\*(?:\s|$))/;
const TEMPLATE_COMMENT = /^\s*<!--/;

/** What the program itself can see on one line: a comment, a test, display text, or an id going to someone other than its maker. */
export function placeSendsNothing(file        , line        )          {
  return HASH_OR_SLASH_COMMENT.test(line) || (TEMPLATE_FILES.test(file) && TEMPLATE_COMMENT.test(line)) || DISPLAY_LINE.test(line) || GATEWAY_PATH.test(file) || pathContext(file) === 'test' || pathContext(file) === 'docs';
}

const HASH_LANGUAGES = /\.(?:py|rb|toml|ya?ml|sh|bash|ex|exs|ini|cfg|conf)$/;

/** Where a comment starts on a line of code, outside any string; -1 if it has none. */
function commentStart(file        , text        )         {
  // In a template, // is as likely a link as a comment: only <!-- starts one there.
  const marker = HASH_LANGUAGES.test(file) ? '#' : TEMPLATE_FILES.test(file) ? '<!--' : '//';
  let quote = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'" || char === '`') quote = char;
    else if (text.startsWith(marker, index)) return index;
  }
  return -1;
}

/** `model="claude-v1",  # "claude-2" for Claude 2`: nothing sends claude-2. */
export function onlyInTrailingComment(file        , id        , text        )          {
  const start = commentStart(file, text);
  return start !== -1 && !text.slice(0, start).includes(id) && text.slice(start).includes(id);
}

function notLiveReason(id        , place            , tables                                , signals              )                       {
  if (place.context === 'test') return 'test';
  if (place.commented || onlyInTrailingComment(place.file, id, place.text)) return 'comment';
  if (place.context === 'docs') return 'docs';
  if (LABEL_LINE.test(place.text)) return 'label';
  if (place.route === 'bedrock') return 'bedrock';
  if (place.route === 'gateway' || GATEWAY_PATH.test(place.file)) return 'gateway';
  if (GATEWAY_PATH.test(`/${signals.caseAt?.(place.file, place.line) ?? ''}/`)) return 'gateway';
  if (TOKENIZER.test(place.file) || TOKENIZER.test(place.text)) return 'tokenizer';
  if (DISPLAY_LINE.test(place.text)) return 'display';
  if (signals.exclusionAt?.(place.file, place.line)) return 'exclusion';
  if (signals.unloadedExample?.(place.file)) return 'example_script';
  const table = tables.get(place.file);
  if (table === 'unused') return 'catalog';
  return table === 'limits' ? 'limits' : null;
}

                                                

/** A file naming many models is a lookup table or a picker: an id there is known, not necessarily sent. */
function catalogFiles(modelIds                    )              {
  const idsByFile = new Map                     ();
  for (const model of modelIds) {
    for (const place of model.places) idsByFile.set(place.file, (idsByFile.get(place.file) ?? new Set()).add(model.id));
  }
  return new Set([...idsByFile].filter(([, ids]) => ids.size >= CATALOG_MIN_IDS).map(([file]) => file));
}

/** What each table does. A JSON data file counts as a table however few ids it holds, since a data file sends nothing by itself. */
function tableKinds(modelIds                    , signals              )                         {
  const big = catalogFiles(modelIds);
  const files = new Set(modelIds.flatMap((model) => model.places.map((place) => place.file)));
  const tables = [...files].filter((file) => big.has(file) || isDataFile(file));
  return new Map(tables.map((file) => {
    const ids = modelIds.filter((model) => model.places.some((place) => place.file === file)).map((model) => model.id);
    return [file, signals.catalogUse ? signals.catalogUse(file, ids) : big.has(file) ? 'unused' : 'picker'];
  }));
}

/** A table entry is a choice a person makes. A fallback in the same file is what's sent when nobody chose. */
function livePlace(place            , tables                                )            {
  return tables.get(place.file) === 'picker' && !FALLBACK_LINE.test(place.text) ? { ...place, catalog: true } : place;
}

/** An id only a gateway route names, such as anthropic/claude-sonnet-4, still means the family its maker retired. */
function retirementFor(model         , retirements                       , exactIdsOnly = false)                    {
  const exact = findRetirement(model.id, retirements);
  if (exact) return exact;
  if (model.places.some((place) => place.route === 'gateway')) return findByDisplayName(model.id, retirements);
  return exactIdsOnly ? null : variantOf(model.id, retirements);
}

/** Google pins a version with a three-digit suffix. A base model that's gone takes its pinned versions with it. Nothing else counts as near. */
const GEMINI_PINNED = /^(gemini-.+)-\d{3}$/;

function variantOf(id        , retirements                       )                    {
  const base = id.match(GEMINI_PINNED)?.[1];
  const row = base ? findRetirement(base, retirements) : null;
  return row && row.provider === 'gemini' && row.effective ? row : null;
}

function optionalFacts(retirement            , undated         )                      {
  return {
    ...(retirement.earliest ? { earliest: true } : {}),
    ...(undated && retirement.effective ? { earliest_date: retirement.effective } : {}),
    ...(retirement.successors_from_page ? { successors_from_page: true } : {}),
    ...(retirement.page_source ? { page_source: retirement.page_source } : {}),
    ...(retirement.routed_to ? { routed_to: retirement.routed_to, routed_sentence: retirement.routed_sentence } : {}),
  };
}

export function checkModels(modelIds                    , retirements                       , asOf        , signals               = {})               {
  const tables = tableKinds(modelIds, signals);
  return modelIds.flatMap((model)               => {
    const retirement = retirementFor(model, retirements, signals.exactIdsOnly);
    if (!retirement) return [];
    const withReasons = model.places.map((place) => ({ place, why: notLiveReason(model.id, place, tables, signals) }));
    const status = statusAsOf(retirement, asOf);
    const undated = Boolean(retirement.earliest) && status === 'deprecated';
    return [{
      kind: 'model',
      model: model.id,
      provider: retirement.provider,
      status,
      announced: retirement.announced,
      effective: undated ? null : retirement.effective,
      successors: retirement.successors,
      source: retirement.source,
      sentence: retirement.sentence,
      live_places: withReasons.filter((entry) => entry.why === null).map((entry) => livePlace(entry.place, tables)),
      not_live: withReasons.flatMap((entry) => (entry.why ? [{ ...entry.place, why: entry.why }] : [])),
      ...optionalFacts(retirement, undated),
      ...(retirement.id && retirement.id !== model.id && GEMINI_PINNED.test(model.id) ? { variant_of: retirement.id } : {}),
    }];
  });
}

                                                                                             

                                  
                              
                        
                                
                                    
                        
                               
                                 
                                      
                                        
                                 
                          
                                                 
                                 
                                                                                                      
                          
                                                                                                         
                                                                                                                          
                                                                                                 
                                  
 

                                  
                             
                             
                             
                              
                         
 

                                         
                                               
                        
                            
                             
                                    
                                 
 

                  
                          
                                      
                                        
                                          
                                 
 

function monthsBetween(from        , to        )         {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

function statusFor(dep            , latest        )                   {
  if (!allowsVersion(dep.spec, latest, dep.ecosystem)) return 'behind';
  const lowest = lowestVersionIn(dep.spec);
  return lowest === latest ? 'current' : 'allowed-by-range';
}

function checkFrom(dep            , places                           , found               , asOf        , error         )                  {
  const lowest = lowestVersionIn(dep.spec);
  const base = {
    kind: 'dependency'         , name: dep.name, ecosystem: dep.ecosystem, spec: dep.spec, spec_kind: specKind(dep.spec, dep.ecosystem), places,
    ...(dep.locked ? { locked: dep.locked } : {}),
  };
  if (!found) {
    return { ...base, status: 'no-data', latest: null, latest_date: null, declared_date: null, majors_behind: 0, stale: false, basis: null, source: null, ...(error ? { error } : {}) };
  }
  return {
    ...base,
    status: statusFor(dep, found.latest),
    latest: found.latest,
    latest_date: found.latest_date,
    declared_date: found.declared_date,
    majors_behind: lowest ? majorsBehind(lowest, found.latest) : 0,
    stale: found.latest_date !== null && monthsBetween(found.latest_date, asOf) >= STALE_MONTHS,
    basis: found.basis,
    source: found.source,
  };
}

function fromDatabase(dep            , index                                      )                {
  const record = index.get(`${dep.ecosystem === 'npm' ? 'npm' : 'pypi'}:${dep.name}`);
  if (!record || typeof record.version !== 'string') return null;
  const date = (record.updated ?? record.released)                             ;
  return { latest: record.version, latest_date: date ?? null, declared_date: null, basis: 'database', source: (record.url          ) ?? null };
}

function fromRegistry(dep            , info              )         {
  const lowest = lowestVersionIn(dep.spec);
  return {
    latest: info.latest,
    latest_date: info.latest_date || null,
    declared_date: lowest ? info.version_dates[lowest] ?? null : null,
    basis: 'registry',
    source: info.source,
  };
}

function packageIndex(records                            )                               {
  return new Map(records.flatMap((record) => (typeof record.package === 'string' ? [[record.package, record]         ] : [])));
}

/** One entry per ecosystem, name and spec, listing every manifest that declares it. */
function groupDeclarations(deps                       )                                                           {
  const groups = new Map                                                                                     ();
  for (const dep of deps) {
    if (dep.source === 'path') continue;
    const key = `${dep.ecosystem}\0${dep.name}\0${dep.spec}\0${dep.source}`;
    const group = groups.get(key) ?? { dep, places: [] };
    groups.set(key, { dep: group.dep, places: [...group.places, { file: dep.file, line: dep.line, spec: dep.spec }] });
  }
  return [...groups.values()];
}

async function mapLimited      (items              , limit        , work                         )               {
  const results      = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function checkOnline(group                                                        , options                        )                           {
  try {
    const info = await registryInfo(group.dep, { cacheDir: options.cacheDir, fetchImpl: options.fetchImpl, today: options.asOf, crateDelayMs: options.crateDelayMs });
    return checkFrom(group.dep, group.places, fromRegistry(group.dep, info), options.asOf);
  } catch (error) {
    return checkFrom(group.dep, group.places, null, options.asOf, (error         ).message);
  }
}

function gitCheck(group                                                        )                  {
  return { ...checkFrom(group.dep, group.places, null, ''), status: 'git' };
}

/** Crates one at a time, because crates.io asks for one request a second; registry.ts waits between real requests. */
export async function checkDependencies(deps                       , options                        )                             {
  const groups = groupDeclarations(deps);
  const registryGroups = groups.filter((group) => group.dep.source === 'registry');
  const index = packageIndex(options.records);
  const online = async (ecosystem           , limit        ) =>
    mapLimited(registryGroups.filter((group) => group.dep.ecosystem === ecosystem), limit, (group) => checkOnline(group, options));
  const checked = options.online
    ? [...await online('npm', NPM_CONCURRENCY), ...await online('pypi', PYPI_CONCURRENCY), ...await online('crates', 1)]
    : registryGroups.map((group) => checkFrom(group.dep, group.places, fromDatabase(group.dep, index), options.asOf));
  return [...groups.filter((group) => group.dep.source === 'git').map(gitCheck), ...checked];
}
