// Step 3: per job, keyword queries over the real database with the stack lock applied. Generous but bounded,
// and everything cut is counted in the log. Exact checks and levers join later, in src/judge-bundles.ts.
                                              
                                                                      
import {                } from './stack-lock.js';

const ALL = 1_000_000;
const MASS_PUBLISHER = 50;
const OFFICIAL_BONUS = 15;
const JOB_CAP = 55;
/** Matches almost everything in the database, so it says nothing about the job. */
const TOO_GENERIC = new Set(['mcp', 'mcp server', 'mcp servers', 'server', 'ai', 'agent', 'agents', 'tool', 'tools', 'llm', 'llms', 'api', 'apis', 'model', 'models', 'sdk', 'library', 'plugin']);
const SOURCE_CAPS                                   = {
  'mcp-registry': 24, npm: 8, huggingface: 10, github: 6, pypi: 4, changelog: 6, openrouter: 3, skills: 2, hn: 2, yc: 2,
};
const DEFAULT_SOURCE_CAP = 2;
const WATCH_MIN_STARS = 500;
const WATCH_MIN_LIKES = 40;
const WATCH_PER_JOB = 2;

                                                
                       
                              
                              
                                                                                  
                         
                                                                                                                  
                                
 

                         
                       
                                    
                           
                                     
                                      
                                   
                                           
                              
                        
                               
 

                               
                                         
                                        
                                   
 

                                   
                           
                                 
                                                 
 

function namespaceOf(record          )                {
  const name = record.registry_name;
  return typeof name === 'string' && name.includes('/') ? name.split('/')[0] : null;
}

/** Namespaces holding more than 50 servers are mass publishers (docs/reference/sources.md). */
export function massPublishers(records                     )              {
  const counts = new Map                ();
  for (const record of records) {
    const namespace = namespaceOf(record);
    if (namespace) counts.set(namespace, (counts.get(namespace) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > MASS_PUBLISHER).map(([namespace]) => namespace));
}

function words(text        )           {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !['mcp', 'server', 'oss', 'io', 'github', 'com', 'inc', 'labs', 'hq', 'get', 'the'].includes(word));
}

/**
 * keepup's own heuristic, not a registry field: a namespace's org and its server name share a word or one holds the other,
 * as in io.github.getsentry/sentry-mcp. It suggests the vendor publishes it. It doesn't say the vendor supports it.
 */
export function isOfficialServer(record          )          {
  const name = record.registry_name;
  if (typeof name !== 'string' || !name.includes('/')) return false;
  const [namespace, server] = name.split('/');
  const org = namespace.split('.').slice(-1)[0];
  const serverWords = words(server);
  return words(org).some((word) => serverWords.some((other) => word.includes(other) || other.includes(word)));
}

/** A provider's own API or model is cut for a product that said it only uses another one. Neutral tools stay. */
export function offProvider(record          , providerOnly                    )          {
  if (!providerOnly) return false;
  if (record.source === 'changelog') return record.provider !== providerOnly;
  if (record.source === 'openrouter') return !String(record.model_id ?? '').startsWith(`${providerOnly}/`);
  return false;
}

                  
                                                             
 

                   
                                           
                                     
                                     
                                     
                                    
 

function keyOf(record          )         {
  return `${record.source}\0${record.url ?? record.name ?? ''}\0${record.name ?? ''}`;
}

/** Popular enough that a founder might have heard of it, and its name or topics say it does this very job. */
function isWorthWatching(record          , terms                   )          {
  const popular = Number(record.stars ?? 0) >= WATCH_MIN_STARS || Number(record.likes ?? 0) >= WATCH_MIN_LIKES;
  const labels = `${record.name ?? ''} ${(record.topics ?? []).join(' ')}`.toLowerCase();
  return popular && terms.some((term) => new RegExp(`(?:^|[^a-z0-9])${term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[ -]')}(?:[^a-z0-9]|$)`).test(labels));
}

function passFilters(pass         )                                                                 {
  const counts         = { lock: 0, mass: 0, provider: 0, seen: 0 };
  const survivors              = [];
  const watch              = [];
  for (const match of pass.matches) {
    const { record } = match;
    const namespace = namespaceOf(record);
    if (!pass.options.lock.allows(record)) {
      counts.lock += 1;
      if ((record.source === 'github' || record.source === 'huggingface') && isWorthWatching(record, pass.terms) && !pass.seen.has(keyOf(record))) watch.push({ ...annotate(match, pass.options), watch_only: true });
    } else if (namespace && pass.mass.has(namespace)) counts.mass += 1;
    else if (offProvider(record, pass.options.providerOnly)) counts.provider += 1;
    else if (pass.seen.has(keyOf(record))) counts.seen += 1;
    else survivors.push(annotate(match, pass.options));
  }
  return { survivors, watch, counts };
}

function annotate(match             , options                  )            {
  const official = isOfficialServer(match.record);
  const pkg = match.record.package;
  return {
    ...match,
    job: '',
    score: match.score + (official ? OFFICIAL_BONUS : 0),
    official,
    declared: typeof pkg === 'string' && options.declaredPackages.has(pkg),
  };
}

function capBySource(candidates                      )              {
  const taken = new Map                ();
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const kept = sorted.filter((candidate) => {
    const count = taken.get(candidate.record.source) ?? 0;
    if (count >= (SOURCE_CAPS[candidate.record.source] ?? DEFAULT_SOURCE_CAP)) return false;
    taken.set(candidate.record.source, count + 1);
    return true;
  });
  return kept.slice(0, JOB_CAP);
}

export function buildCandidates(
  profile         ,
  search                                                ,
  options                  ,
)                                                 {
  const mass = massPublishers(search({ sources: ['mcp-registry'], limit: ALL }).map((match) => match.record));
  const seen = new Set        ();
  const logs           = [];
  const candidates = profile.jobs.flatMap((job) => {
    const terms = (job.search_terms ?? []).filter((term) => !TOO_GENERIC.has(term.toLowerCase().trim()));
    const matches = terms.length ? search({ any: terms, limit: ALL }) : [];
    const { survivors, watch, counts } = passFilters({ matches, seen, mass, options, terms });
    const kept = capBySource(survivors).map((candidate) => ({ ...candidate, job: job.job }));
    const watched = [...watch].sort((a, b) => b.score - a.score).slice(0, WATCH_PER_JOB).map((candidate) => ({ ...candidate, job: job.job }));
    for (const candidate of [...kept, ...watched]) seen.add(keyOf(candidate.record));
    logs.push({
      job: job.job, terms, matched: matches.length, cut_by_stack_lock: counts.lock, cut_mass_publisher: counts.mass,
      cut_by_provider: counts.provider, cut_seen_in_earlier_job: counts.seen, cut_by_cap: survivors.length - kept.length, kept: kept.length, watch_only: watched.length,
    });
    return [...kept, ...watched];
  });
  return { candidates, log: { stack_lock: options.lock.rules, provider_only: options.providerOnly ?? null, jobs: logs } };
}
