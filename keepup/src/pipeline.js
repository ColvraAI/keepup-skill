// The whole run, in the five steps the real briefs were made with:
// facts, profile, candidates, judge, checks. Profile, candidates and judge are seams: pass a function and it
// replaces the default. With none passed, a run is the deterministic floor: no model, no network unless asked.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { caseLookup, catalogUse, exclusionLookup, unloadedExampleLookup } from './catalog-use.js';
import {                  runJudgeChecks } from './check.js';
import { runChecks } from './checks.js';
import { allSources, changelogEntries, dbInfo, loadRecords, retirements } from './db.js';
import { addReleaseNotes } from './dependency-notes.js';
import { checkDependencies, checkModels,                      } from './exact-checks.js';
import { buildFacts,                       } from './facts.js';
import { findingsFromExact,                  } from './findings.js';
import { listRepoFiles,                } from './git-files.js';
import { markInUse } from './in-use.js';
import { loadLevers } from './levers.js';
import { maskText, maskValue } from './mask.js';
import { openRouterModelIds } from './registry.js';
import { rankFindings } from './rank.js';
import { valueContext } from './lever-prices.js';
import { withValues } from './lever-value.js';
import { recommendationsFor } from './team.js';
                                                                                                                           
import { loadPatterns, scanFiles,          } from './scan.js';
import {                searchRecords,                                    } from './search.js';
import { REPO_ROOT, SCAN_BUDGET_MS } from './signals.js';
import { defang, oneLine, stripControl } from './text-safety.js';

/** What the dashboard reads. Only a run someone chose to publish goes here. */
export const RUNS_DIR = join(REPO_ROOT, 'data', 'runs');

/** Outside the plugin, because its version folder is deleted after an update, and outside anything git commits. */
export function defaultRunsDir(env                    = process.env)         {
  return env.CLAUDE_PLUGIN_DATA ? join(env.CLAUDE_PLUGIN_DATA, 'runs') : join(homedir(), '.keepup', 'runs');
}

export class NoFilesError extends Error {
  constructor(path        ) {
    super(`No files to read in ${path}. Is it a repo with a checkout? For a clone with no checkout, add --commit <sha>.`);
    this.name = 'NoFilesError';
  }
}

                                  
                        
                                 
                        
                        
                                
                                         
                                                                                                  
                                              
 

                             
                                    
                                   
                                              
                                                                                 
                              
 

                              
                                        
                                                                                                       
                                               
                                         
                                          
                                                                    
                                                   
                                
                                                                                                                
                                   
                                                                                                 
                                        
                                          
                                   
                                  
 

                        
                                                                           
                                                                                                                                                                       
                                                               
 

                             
                                                                                     
                                  
                           
                            
                         
                        
                                
                             
                                  
                                    
                                                  
                                 
 

async function timedStep   (steps        , name        , work                      , detail                       )             {
  const started = performance.now();
  const result = await work();
  steps.push({ name, detail: detail(result), ms: Math.round(performance.now() - started) });
  return result;
}

function count(value        , word        )         {
  return `${value.toLocaleString('en-US')} ${word}`;
}

                      
                        
                                        
                        
                                              
                         
 

async function dependencyChecks(input            , options            )                             {
  const declared = input.facts.manifests.flatMap((manifest) => manifest.dependencies);
  const checks = await checkDependencies(declared, { records: input.records, asOf: input.asOf, online: options.online, cacheDir: options.cacheDir, fetchImpl: options.fetchImpl });
  if (!options.online) return checks;
  return addReleaseNotes(checks, { since: input.since, registry: { cacheDir: options.cacheDir, fetchImpl: options.fetchImpl, today: input.asOf }, notes: { cacheDir: options.notesCacheDir, fetchImpl: options.fetchImpl } });
}

/** Only what a registry or the database really answered counts as checked. */
function dependencyDetail(checks                            )         {
  const answered = checks.filter((check) => check.status !== 'no-data' && check.status !== 'git');
  const unchecked = checks.length - answered.length;
  const behind = checks.filter((check) => check.status === 'behind').length;
  return `${count(answered.length, 'dependencies')} checked, ${behind} behind${unchecked ? `, ${count(unchecked, 'more')} not checked` : ''}`;
}

async function exactChecks(input            , options            , steps        )                         {
  const signals = { catalogUse: catalogUse(input.files), exclusionAt: exclusionLookup(input.files), caseAt: caseLookup(input.files), unloadedExample: unloadedExampleLookup(input.files), exactIdsOnly: options.exactIdsOnly };
  const models = await timedStep(steps, 'Check model ids against provider changelogs and deprecation pages', () => checkModels(input.facts.model_ids, retirements(), input.asOf, signals), (r) => count(r.length, 'ids retired, retiring or deprecated'));
  const dependencies = await timedStep(
    steps,
    options.online ? 'Check dependencies against the registries' : 'Check dependencies against the database',
    () => dependencyChecks(input, options),
    (r) => dependencyDetail(r),
  );
  return [...models, ...dependencies];
}

function sourceTextReader(records                     )                          {
  let byUrl                             = null;
  return (url) => {
    if (!byUrl) {
      byUrl = new Map();
      for (const record of records) if (record.url) byUrl.set(record.url, `${byUrl.get(record.url) ?? ''}\n${JSON.stringify(record)}`);
      for (const entry of changelogEntries()) byUrl.set(entry.url, `${byUrl.get(entry.url) ?? ''}\n${entry.date} ${entry.text}`);
    }
    return byUrl.get(url) ?? '';
  };
}

function lineReader(files                             )                                         {
  return (file, line) => files.get(file)?.split('\n')[line - 1] ?? '';
}

function distinctPatterns(hits                )         {
  return new Set(hits.map((hit) => hit.pattern)).size;
}

                   
                                        
                                         
                                          
                                
 

function checkJudged(judged             , files                             , records                     )          {
  const trusted = judged.trusted_held_back ?? [];
  if (judged.provenance) return runJudgeChecks({ findings: judged.findings, exact_findings: judged.exact_findings, watching: judged.watching, held_back: judged.held_back, trusted_held_back: trusted, files, provenance: judged.provenance });
  return { ...runChecks({ findings: judged.findings, files, sourceText: sourceTextReader(records) }), watching: judged.watching, held_back: [...trusted, ...judged.held_back] };
}

/** A library can't be "no action needed" in one row while a kept finding needs it moved. */
function withoutRowsFindingsNeed(rows                     , findings                    , exact                        )             {
  const needed = findings.map((finding) => `${finding.title} ${finding.why} ${finding.options.map((option) => `${option.name} ${option.what} ${option.needs}`).join(' ')}`).join('\n');
  const names = exact.flatMap((item) => (item.kind === 'dependency' ? [item.name] : []));
  const scoped = (row          ) => row.thing.match(/^@[\w.-]+\/[\w.-]+/)?.[0];
  return rows.filter((row) => !names.some((name) => row.thing.startsWith(name) && needed.includes(name)) && !(scoped(row) && needed.includes(scoped(row)          )));
}

/** Where it sends from comes before the tables that merely offer it, so a brief opens on the real place. */
function codeBeforeTables(findings                    , exact                        )            {
  const tablePlaces = new Set(exact.flatMap((item) => (item.kind === 'model' ? item.live_places.filter((place) => place.catalog).map((place) => `${place.file}:${place.line}`) : [])));
  const isTable = (place                          ) => tablePlaces.has(`${place.file}:${place.line}`);
  return findings.map((finding) => ({ ...finding, where: [...finding.where.filter((place) => !isTable(place)), ...finding.where.filter(isTable)] }));
}

/** What a repo stopped this run from reading, in words a founder can read. A run that couldn't finish never reads as a clean one. */
function stoppedEarly(listed           , facts       , scanOverTime        )                    {
  const late = Math.max(facts.checked.over_time ?? 0, scanOverTime);
  const big = listed.skipped.over_budget;
  if (!late && !big) return undefined;
  const skipped = [...(late ? [`${count(late, 'files')} not read: the time budget ran out`] : []), ...(big ? [`${count(big, 'files')} not read: the read budget ran out`] : [])];
  return { reason: late ? 'The read stopped at its time budget, so this covers only what it reached.' : 'The read stopped at its size budget, so this covers only what it reached.', skipped };
}

function mergedIncomplete(a                   , b                   )                    {
  if (!a || !b) return a ?? b;
  return { reason: `${a.reason} ${b.reason}`, skipped: [...a.skipped, ...b.skipped] };
}

/** A dropped finding's place comes from a model's reply, so it's only said if that's a file keepup really read. */
export function knownWhere(item         , files                             )          {
  const { where, ...rest } = item;
  if (where === undefined) return item;
  const file = where.match(/^(.*):\d+$/)?.[1];
  return file !== undefined && files.has(file) ? { ...rest, where: oneLine(where) } : rest;
}

export async function runPipeline(path        , options             = {}, seams        = {})               {
  const db = dbInfo();
  // Retirements are judged as of today, never before the data's own date; --as-of and a replay pin the day instead.
  const today = (options.now ?? new Date().toISOString()).slice(0, 10);
  const asOf = options.asOf ?? (today > db.fetched ? today : db.fetched);
  const listed = listRepoFiles(path, { commit: options.commit, budgetMs: options.readBudgetMs });
  if (listed.files.length === 0 && !listed.skipped.over_time) throw new NoFilesError(path);
  const facts = buildFacts(path, { commit: options.commit, listed });
  const steps         = [...facts.steps];
  const files = new Map(listed.files.map((file) => [file.path, maskText(file.text)]));
  const records = loadRecords(allSources());
  const scanned = await timedStep(steps, 'Run patterns', () => scanFiles(listed.files, loadPatterns(options.patternsDir), listed.deadline === undefined ? SCAN_BUDGET_MS : listed.deadline - performance.now()), (r) => `${count(r.hits.length, 'hits')} in ${count(r.checked.files, 'files')}`);
  const { hits } = scanned;
  const exact = await exactChecks({ facts, records, asOf, files, since: db.window.since }, options, steps);
  const context                  = { path, commit: listed.commit, asOf, facts, hits, exact, files };

  const profile = seams.profile ? await timedStep(steps, 'Understand the product', () => seams.profile (context), (r) => (r ? `${r.jobs.length} AI jobs` : 'no profile')) : null;
  const search = (query             ) => searchRecords(records, query).matches;
  const candidates = seams.candidates ? await timedStep(steps, 'Search the database', () => seams.candidates (context, profile, search), (r) => count(r.length, 'candidates')) : [];
  const openRouterIds = options.online && exact.some((item) => item.kind === 'model' && item.not_live.some((place) => place.route === 'gateway')) ? await openRouterModelIds({ cacheDir: options.cacheDir, fetchImpl: options.fetchImpl }) : null;
  const floor = findingsFromExact(exact, { lineText: lineReader(files), window: db.window, levers: loadLevers(), asOf, retirements: retirements(), changelog: changelogEntries(), files, openRouterIds });
  const judged              = seams.judge
    ? await timedStep(steps, 'Judge each candidate against the code', () => seams.judge ({ context, profile, candidates, floor }), (r) => `${r.findings.length} fit, ${r.held_back.length} held back`)
    : floor;

  const checked = await timedStep(steps, 'Check every claim', () => checkJudged(judged, files, records), (r) => `${r.checks.passed} checks passed, ${r.checks.dropped.length} findings dropped`);
  const ranked = rankFindings(withValues(markInUse(checked.findings, files, loadLevers()), valueContext(facts, files)), asOf);
  const incomplete = mergedIncomplete(stoppedEarly(listed, facts, scanned.checked.over_time ?? 0), judged.incomplete);

  return {
    version: 1,
    repo: facts.repo,
    commit: listed.commit,
    ...(listed.base_commit ? { base_commit: listed.base_commit } : {}),
    commit_date: facts.commit_date,
    scanned_at: options.now ?? new Date().toISOString(),
    as_of: asOf,
    db,
    ran: { search: Boolean(seams.candidates) && profile !== null, judge: Boolean(seams.judge), online: Boolean(options.online) },
    steps,
    facts,
    pattern_hits: hits,
    exact,
    profile,
    candidates_considered: candidates.length + exact.length + distinctPatterns(hits),
    findings: codeBeforeTables(ranked.findings, exact),
    watching: checked.watching,
    held_back: withoutRowsFindingsNeed(checked.held_back, checked.findings, exact),
    checks: { passed: checked.checks.passed, dropped: [...(judged.dropped ?? []), ...checked.checks.dropped].map((item) => knownWhere(item, files)) },
    rank_explanation: ranked.explanation,
    usage: judged.usage ?? null,
    ...(incomplete ? { incomplete } : {}),
    ...(judged.candidate_log ? { candidate_log: judged.candidate_log } : {}),
    ...(judged.provider_only ? { provider_only: judged.provider_only } : {}),
    ...(floor.moves?.length ? { moves: floor.moves } : {}),
    recommendations: recommendationsFor(facts, files, records, { levers: loadLevers(), hits }),
  };
}

/** <name>.json, named after the repo unless told otherwise. */
export function runFileName(run                   , name         )         {
  const base = name ?? run.repo.split('/').pop() ?? run.repo;
  return `${base.replace(/[^A-Za-z0-9._-]/g, '-')}.json`;
}

export class WouldReplaceJudgedRunError extends Error {
  constructor(path        ) {
    super(`${path} holds a judged run, and this one has no judge. Name another --out, or add --force.`);
    this.name = 'WouldReplaceJudgedRunError';
  }
}

function isJudgedRunFile(path        )          {
  if (!existsSync(path)) return false;
  try {
    return Boolean((JSON.parse(readFileSync(path, 'utf8'))       ).usage);
  } catch {
    return false;
  }
}

/** What goes on disk: every string masked once more, model replies included, and any rejected link dead. */
export function safeRun(run     )      {
  const masked = maskValue(run);
  return { ...masked, checks: { ...masked.checks, dropped: masked.checks.dropped.map((item) => ({ ...item, what: defang(item.what), why: defang(item.why), ...(item.where === undefined ? {} : { where: stripControl(item.where) }) })) } };
}

                               
                         
                                                   
                        
                           
 

export function writeRun(run     , options               = {})         {
  const out = options.out ?? defaultRunsDir();
  const path = out.endsWith('.json') ? out : join(out, runFileName(run, options.name));
  if (!run.usage && !options.force && isJudgedRunFile(path)) throw new WouldReplaceJudgedRunError(path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(safeRun(run), null, 1)}\n`);
  return path;
}
