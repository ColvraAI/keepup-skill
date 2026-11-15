// The free path's evidence: what the pipeline shows its judge, built by the program with no network call of its own, so the session's own Claude
// only has to judge. keepup prepare writes what needs no model, and keepup bundles adds a bundle per job from the session's profile.
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCandidates,                } from './candidates.js';
import { declaredPackages } from './claude.js';
import { allSources, loadRecords } from './db.js';
import { promptParts } from './bundle-parts.js';
import { RETIRED_PATTERN,              jobBundle } from './judge-bundles.js';
import { JUDGE_SYSTEM } from './judge-schema.js';
import { candidatesFor, floorItemsFor, repoBundles } from './judge.js';
import { loadLevers, loadPatternMeta } from './levers.js';
import { libraryFacts } from './library-moves.js';
import { maskText, maskValue } from './mask.js';
                                                     
import { parseProfile, verifyContextOf, verifyProfile } from './profile.js';
import { sessionPrefix } from './repo-text.js';
                                                   
import { searchRecords } from './search.js';
import { logEvent } from './session.js';
import { stackLock } from './stack-lock.js';
import { oneLine } from './text-safety.js';
import { maskedFileMap } from './verify.js';

const BUNDLES_FILE = 'bundles.json';
const PROFILE_FILE = 'profile.json';
const FLOOR_FILE = 'floor.json';

/** A bundle as the session reads it. Its links aren't kept: verify checks a source against the whole database. */
                                
                      
                                
                          
                               
 

                                 
                      
                                                                                                      
                        
                                 
                          
                         
                                       
                                                      
                                                 
                                              
                                          
 

/** One bundle, or, if it's too long to print as one, its parts, each a bundle of its own to read. A job's candidates count on its last part, the one reached by reading the others. */
function toSession({ id, kind, prompt }        , candidates         )                  {
  const counted = candidates === undefined ? {} : { candidates };
  const parts = promptParts(prompt);
  if (parts.length === 1) return [{ id, kind, prompt, ...counted }];
  return parts.map((text, index) => ({
    id: `${id} (part ${index + 1} of ${parts.length})`,
    kind,
    prompt: `Part ${index + 1} of ${parts.length} of one bundle, split so that each prints whole. Read them all, then judge them together, as one bundle.\n\n${text}`,
    ...(index === parts.length - 1 ? counted : {}),
  }));
}

function contextOf(run     , path        , files                             )                  {
  return { path, commit: run.commit, asOf: run.as_of, facts: run.facts, hits: run.pattern_hits, exact: run.exact, files };
}

/** Retirements take one line in a brief, so the floor says them and no pattern bundle is spent on them. */
export function prepareBundles(path        , floor     , commit         )                 {
  const context = contextOf(floor, path, maskedFileMap(path, commit));
  const levers = loadLevers();
  const changelog = loadRecords(allSources().filter((source) => source === 'changelog'));
  const patterns = loadPatternMeta().filter((pattern) => pattern.id !== RETIRED_PATTERN);
  const built = repoBundles(context, { patterns, changelog }, floorItemsFor(context, maskValue(floor.findings), levers), levers);
  const [first = null, ...rest] = built.floor ? toSession(built.floor) : [];
  return { version: 1, root: realpathSync(path), commit: commit ?? null, prefix: maskText(sessionPrefix(context)), rules: JUDGE_SYSTEM, floor: first, floor_rest: rest, patterns: built.patterns.flatMap((bundle) => toSession(bundle)), jobs: [] };
}

/** Repo text is masked where it's read, in the file map and above. Masked again here it would hit a public lever's id, and a finding needs that id to be priced. */
export function writeBundles(dir        , bundles                )       {
  writeFileSync(join(dir, BUNDLES_FILE), `${JSON.stringify(bundles, null, 1)}\n`);
}

function readPrepared   (dir        , file        )    {
  const path = join(dir, file);
  if (!existsSync(path)) throw new Error(`${file} isn't there yet. Run keepup prepare first.`);
  return JSON.parse(readFileSync(path, 'utf8'))     ;
}

/**
 * The day keepup prepare judged retirements as of, when it prepared this repo in this folder, so verify judges the
 * same day even after a UTC midnight. None when prepare never did, or wrote no date it can trust.
 */
export function preparedAsOf(dir        , path        )                     {
  if (!existsSync(join(dir, BUNDLES_FILE)) || !existsSync(join(dir, FLOOR_FILE))) return undefined;
  if (readPrepared                (dir, BUNDLES_FILE).root !== realpathSync(path)) return undefined;
  const asOf          = readPrepared     (dir, FLOOR_FILE).as_of;
  return typeof asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : undefined;
}

const isText = (value         )                  => typeof value === 'string';
const safeLine = (text        )         => oneLine(maskText(text));

                                
                                          
                                       
                                                                                        
                                        
                            
                          
                               
                                                                   
                                                                                                            
 

function candidatesByJob(context                 , profile                                             )                       {
  const records = loadRecords(allSources());
  return buildCandidates(profile, (query) => searchRecords(records, query).matches, { lock: stackLock(context.facts), declaredPackages: declaredPackages(context) }).candidates;
}

/** The pipeline's step 3 and its job bundles, on the session's profile. Offline: no card, no registry. */
export async function runBundles(input                                                                        )                         {
  const raw = parseProfile(input.text);
  const prepared = readPrepared                (input.dir, BUNDLES_FILE);
  if (prepared.root !== realpathSync(input.path)) throw new Error(`What's in ${input.dir} was prepared for another repo. Run keepup prepare on this one first.`);
  const context = contextOf(readPrepared     (input.dir, FLOOR_FILE), input.path, maskedFileMap(input.path, prepared.commit ?? undefined));
  const { profile, dropped } = verifyProfile(raw, verifyContextOf(context));
  const counts = { patterns: prepared.patterns.length, floor: prepared.floor !== null, floor_rest: prepared.floor_rest?.length ?? 0, pattern_list: pathsOf('patterns', prepared.patterns) };
  if (profile.jobs.length === 0) return { jobs: [], dropped, unmatched: [], ...counts };
  const candidates = candidatesByJob(context, profile);
  const facts = await libraryFacts(context, { online: false });
  const built = profile.jobs.map((job) => {
    const shown = candidatesFor(job, candidates);
    const bundle = jobBundle(job, shown, context.files, facts);
    return { job: job.job, parts: bundle ? toSession(bundle, shown.length) : [] };
  });
  const jobs = built.flatMap(({ parts }) => parts);
  const unmatched = built.flatMap(({ job, parts }) => (parts.length ? [] : [job]));
  writeBundles(input.dir, { ...prepared, jobs });
  writeFileSync(join(input.dir, PROFILE_FILE), `${JSON.stringify(maskValue({ version: 1, ...profile, stack_lock: [...profile.stack_lock, ...stackLock(context.facts).rules], dropped }), null, 1)}\n`);
  logEvent(input.dir, 'bundles', 'keepup bundles', { jobs: jobs.length, job_total: profile.jobs.length, patterns: prepared.patterns.length, candidates: jobs.reduce((sum, job) => sum + (job.candidates ?? 0), 0), unmatched: unmatched.map(safeLine) });
  return { jobs, dropped, unmatched, ...counts };
}

function readingOrder(result               )         {
  const range = (name        , count        ) => (count === 1 ? `bundles.${name}.0` : `bundles.${name}.0 to bundles.${name}.${count - 1}`);
  const parts = [...(result.patterns ? [range('patterns', result.patterns)] : []), ...(result.jobs.length ? [range('jobs', result.jobs.length)] : []), ...(result.floor ? ['bundles.floor'] : []), ...(result.floor_rest ? [range('floor_rest', result.floor_rest)] : [])];
  return parts.length ? `Read each with its own keepup get, in this order: ${parts.join(', then ')}.` : 'There are no bundles to read.';
}

function jobLine(job               , index        )         {
  const name = safeLine(job.id.replace(/^Job: /, ''));
  return `bundles.jobs.${index}: ${job.candidates === undefined ? '' : `${job.candidates} candidates for `}${name}, ${job.prompt.length} chars`;
}

/** Every dropped citation is printed, so the session can fix it and run this again. */
export function bundlesReport(result               )         {
  const dropped = result.dropped.map((item) => `dropped: ${safeLine(item.what)}: ${safeLine(item.why)}`);
  if (result.jobs.length === 0 && result.unmatched.length === 0) return [...dropped, 'keepup: no job stood up, so nothing was written. Fix what\'s above and run keepup bundles again.'].join('\n');
  return [
    ...dropped,
    ...(result.pattern_list ?? []).map(({ path, id, chars }) => `${path}: ${safeLine(id)}, ${chars} chars`),
    ...result.jobs.map(jobLine),
    ...result.unmatched.map((job) => `no bundle: nothing in the database matched ${safeLine(job)}. Better search_terms would help.`),
    readingOrder(result),
  ].join('\n');
}

const pathsOf = (name        , bundles                          ) => bundles.map((bundle, index) => ({ path: `bundles.${name}.${index}`, id: bundle.id, chars: bundle.prompt.length, ...(bundle.candidates === undefined ? {} : { candidates: bundle.candidates }) }));

                             
                        
                                                                                                                                                                                                       
                          
                                                            
                                                   
 

function bundleIndex(all                )         {
  const chars = { prefix: all.prefix.length, rules: all.rules.length, floor: all.floor?.prompt.length ?? 0 };
  return JSON.stringify({ prefix: 'bundles.prefix', rules: 'bundles.rules', floor: all.floor ? 'bundles.floor' : null, floor_rest: pathsOf('floor_rest', all.floor_rest ?? []), patterns: pathsOf('patterns', all.patterns), jobs: pathsOf('jobs', all.jobs), chars }, null, 1);
}

/** What keepup get prints for part of bundles.json, or nothing when it's a plain field. One bundle at a time, whole, never a list of them. */
export function bundlePart(fields                   , value         )                    {
  const [first, index, ...rest] = fields;
  if (first === undefined) return { text: bundleIndex(value                  ), fence: true };
  if (rest.length > 0) return null;
  if (first === 'rules' && index === undefined) return value === JUDGE_SYSTEM ? { text: JUDGE_SYSTEM, fence: false } : null;
  if (first === 'prefix' && index === undefined) return isText(value) ? { text: value, fence: true } : null;
  if (first === 'floor' && index === undefined) return value ? { text: (value                 ).prompt, fence: false } : null;
  if (first !== 'patterns' && first !== 'jobs' && first !== 'floor_rest') return null;
  if (index === undefined) return { text: JSON.stringify(pathsOf(first, value                   ), null, 1), fence: true };
  const bundle = value                 ;
  if (first === 'floor_rest') return { text: bundle.prompt, fence: false };
  return { text: bundle.prompt, fence: false, read: bundle.candidates === undefined ? {} : { candidates: bundle.candidates } };
}
