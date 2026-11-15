// Step 5 for the plugin: when Claude Code is the judge, it writes its findings to a file and this checks them, the same
// way src/check.ts checks the API judge. What it prints is what survives, so a brief only holds what got through.
import {                  runJudgeChecks } from './check.js';
import { changelogEntries, loadRecords, allSources, retirements } from './db.js';
import { recordUrls } from './judge-bundles.js';
import { markInUse } from './in-use.js';
import { loadLevers } from './levers.js';
import { droppedDetail, droppedCategory,            noAiCode, renderSummary,                  } from './brief.js';
                                                     
import { rankFindings } from './rank.js';
import { valueContext } from './lever-prices.js';
import { withValues } from './lever-value.js';
import { clientCoverageHolds, clientCoverageShortfall, coverageFacts, coverageHolds, coverageShortfall,                 } from './session.js';
import { listRepoFiles } from './git-files.js';
import { maskText } from './mask.js';
import { knownWhere,                  runPipeline } from './pipeline.js';
import { unrecognisedOnLists } from './list-ids.js';
import { stemsOf } from './judge.js';
import { loadPinnedSources, moveFacts } from './pinned-sources.js';
                                                                                                      

                              
                                         
                                          
                                           
                                                                                              
                                     
 

                               
                      
                                        
                                         
                                          
                                                                                                                
                                                                                                             
                          
 

const SHAPES                                                               = [
  ['findings', ['title', 'effect', 'proof', 'effort', 'where', 'why', 'options', 'sources']],
  ['watching', ['thing', 'why', 'source']],
  ['held_back', ['thing', 'reason']],
];

/** What a model hands over is checked at the door, and the message says what shape was wanted, so it can fix it. */
export function checkInputShape(input             )       {
  for (const [field, needs] of SHAPES) {
    const rows = input[field] ?? [];
    if (!Array.isArray(rows)) throw new Error(`"${field}" has to be a list.`);
    for (const [index, row] of rows.entries()) {
      const missing = needs.filter((key) => !row || typeof row !== 'object' || (row                                      )[key] === undefined);
      if (missing.length) throw new Error(`"${field}" item ${index + 1} needs ${missing.join(', ')}. Each item is an object with ${needs.join(', ')}.`);
    }
  }
}

/** The same text the online pipeline read: the database, the levers and the provider pages, and what it fetched, pinned. */
function databaseProvenance()                                                                         {
  const texts = new Map                ();
  const add = (url        , text        ) => texts.set(url, `${texts.get(url) ?? ''}\n${text}`);
  for (const record of loadRecords(allSources())) for (const url of recordUrls(record)) add(url, JSON.stringify(record));
  for (const entry of changelogEntries()) add(entry.url, `${entry.date} ${entry.text}`);
  for (const lever of loadLevers()) {
    add(lever.source, JSON.stringify(lever));
    add(lever.id, JSON.stringify(lever));
  }
  for (const row of retirements()) {
    add(row.source, row.sentence);
    if (row.page_source) add(row.page_source, `${row.id ?? ''} ${row.successors.join(' ')}`);
  }
  const pinned = loadPinnedSources().sources;
  for (const [url, text] of Object.entries(pinned)) add(url, text);
  const moves = moveFacts();
  for (const move of moves) add(move.url, move.text);
  const retiredIds = new Set([...retirements().flatMap((row) => (row.id ? [row.id] : [])), ...loadLevers().flatMap((lever) => lever.models ?? [])]);
  return { allowed: new Set(texts.keys()), textFor: (url) => texts.get(url) ?? '', retiredIds, programText: moves.flatMap((move) => [move.text, pinned[move.url] ?? '', pinned[move.from_url] ?? '']).join('\n') };
}

const isText = (value         )                  => typeof value === 'string';

/** One value where a list was wanted is read as a list of one. Anything else isn't what verify takes. */
function listOf(value         )                     {
  return Array.isArray(value) ? value : [value];
}

function placeOf(raw         )               {
  if (!raw || typeof raw !== 'object') return null;
  const { file, line, text } = raw                           ;
  const number = typeof line === 'string' && /^\d+$/.test(line) ? Number(line) : line;
  return isText(file) && typeof number === 'number' && Number.isInteger(number) && isText(text) ? { file, line: number, text } : null;
}

function optionOf(raw         )                       {
  if (!raw || typeof raw !== 'object') return null;
  const { name, what, needs, source } = raw                           ;
  return isText(name) && isText(what) && isText(source) && (needs === undefined || needs === null || isText(needs)) ? { name, what, needs: needs ?? '', source } : null;
}

/** What the program proved stays on a finding with its title: a model can add a place, never lose one. */
function withProvedPlaces(places                  , proved                     )          {
  const seen = new Set((proved?.where ?? []).map((place) => `${place.file}:${place.line}`));
  return [...(proved?.where ?? []), ...places.filter((place) => !seen.has(`${place.file}:${place.line}`))];
}

/** A floor finding's options are what its sources name. A model's own "just move to the successor" can't sit beside a warning that it may break. */
function withProvedOptions(options                          , proved                     )                           {
  return proved?.options.length ? proved.options : options;
}

/** What goes on to the checks, field by field. A field verify doesn't know stays behind, and so does anything only the program may say. */
function rebuiltFinding(raw         , proved                     , leverIds                     )                   {
  const effect = listOf(raw.effect);
  const sources = listOf(raw.sources);
  const where = listOf(raw.where).map(placeOf);
  const options = listOf(raw.options).map(optionOf);
  if (!isText(raw.title)) return 'its shape: "title" has to be text';
  if (!isText(raw.why) || !isText(raw.effort) || !isText(raw.proof)) return 'its shape: "why", "effort" and "proof" have to be text';
  if (!effect.every(isText)) return 'its shape: "effect" has to be a list of words';
  if (!sources.every(isText)) return 'its shape: "sources" has to be a list of links';
  if (where.some((place) => place === null)) return 'its shape: "where" has to be a list of file, line and text';
  if (options.some((option) => option === null)) return 'its shape: "options" has to be a list of name, what, needs and source';
  return {
    title: raw.title,
    effect,
    proof: raw.proof,
    effort: proved?.sdk_unverified ? proved.effort : raw.effort,
    where: withProvedPlaces(where           , proved),
    why: proved?.why ?? raw.why,
    options: withProvedOptions(options                   , proved),
    sources: [...new Set([...sources, ...(proved?.sources ?? [])])],
    // A floor finding sent back by its title keeps the lever the program matched, so a retirement is still priced and applied by it.
    lever: proved?.lever ?? (isText(raw.lever) && leverIds.has(raw.lever) ? raw.lever : null),
    pr: null,
    deadline: proved?.deadline ?? (isText(raw.deadline) ? raw.deadline : null),
    evidence: proved?.evidence ?? [],
    ...(proved?.reach ? { reach: proved.reach } : {}),
    ...(proved?.sdk_unverified ? { sdk_unverified: proved.sdk_unverified } : {}),
  };
}

                     
                     
                              
 

/** Anything a model supplies as evidence is ignored. A floor finding gets its evidence back from the program, by its exact title. */
function withProgramEvidence(findings                    , floor                    )                  {
  const proved = new Map(floor.map((finding) => [finding.title, finding]));
  const leverIds = new Set(loadLevers().map((lever) => lever.id));
  const rebuilt = findings.map((finding) => ({ finding, result: rebuiltFinding(finding, proved.get(finding.title), leverIds) }));
  return {
    kept: rebuilt.flatMap(({ result }) => (typeof result === 'string' ? [] : [result])),
    dropped: rebuilt.flatMap(({ finding, result }) => (typeof result === 'string' ? [{ what: String(finding.title), why: result }] : [])),
  };
}

function rowsOfShape                  (rows              , fields                      , rebuild               )            {
  const fits = (row   ) => fields.every((field) => isText(row[field]));
  return {
    kept: rows.filter(fits).map(rebuild),
    dropped: rows.filter((row) => !fits(row)).map(() => ({ what: 'a row', why: `its shape: ${fields.map(String).join(', ')} have to be text` })),
  };
}

/** A held-back row that names a floor finding by its title is about what the program read, so it carries that source when the session gave none. */
function heldBackRow(row          , floor                              )           {
  const { thing, reason, date, source } = row;
  const proved = floor.get(thing);
  return { thing, reason, date: isText(date) ? date : null, source: isText(source) ? source : proved?.sources[0] ?? null };
}

function placeOfFinding(finding         )                     {
  const place = finding.where[0];
  return place ? `${place.file}:${place.line}` : undefined;
}

/** What the program proved can't vanish because a session left it out: like a floor item with no verdict on the API path, it goes back as the program wrote it, and a row says so. Only a held-back row, with a reason, takes it out. */
function leftOutFloor(floor                    , kept                    , heldBack                     )                  {
  const answered = new Set([...kept.map((finding) => finding.title), ...heldBack.map((row) => row.thing)]);
  const missing = floor.filter((finding) => !answered.has(finding.title));
  return {
    kept: [...missing],
    dropped: missing.map((finding) => ({ what: finding.title, why: `the session left out "${finding.title}"; it stays, because ${finding.locked ?? 'only a held-back row with a reason takes out what the program proved'}`, ...(placeOfFinding(finding) ? { where: placeOfFinding(finding) } : {}) })),
  };
}

function publicDropped(items                    , files                             )                          {
  return items.map((item) => knownWhere(item, files)).map((item) => {
    const detail = droppedDetail(item);
    return { ...(item.where ? { where: item.where } : {}), category: droppedCategory(item), ...(detail ? { detail } : {}) };
  });
}

export function maskedFileMap(path        , commit         )                              {
  return new Map(listRepoFiles(path, { commit }).files.map((file) => [file.path, maskText(file.text)]));
}

function jobsOf(input             )         {
  return Array.isArray(input.jobs) ? input.jobs.length : 0;
}

const MINUTE_MS = 60_000;

/** What keepup printed into this session since keepup prepare, and how long ago that was. Nothing at all for a log prepare never started. */
function sessionCost(log            , now        )                          {
  const printed = log.printed;
  if (!printed) return undefined;
  const elapsed = Date.parse(now) - Date.parse(printed.started);
  return { kind: 'session', chars: printed.chars, bundles: printed.bundles, windows: printed.windows, ...(Number.isFinite(elapsed) && elapsed >= 0 ? { minutes: elapsed / MINUTE_MS } : {}) };
}

function briefFor(floorRun     , checked                                   , ranked                    , input             , log            , files                             , options               )         {
  const covered = options.client ? clientCoverageHolds(log) : coverageHolds(log, jobsOf(input));
  const cost = sessionCost(log, options.now ?? new Date().toISOString());
  const brief = renderSummary({
    ...floorRun,
    ...(options.host ? { host: options.host } : {}),
    ...(cost ? { cost } : {}),
    ...(options.client ? { client: options.client } : {}),
    profile: null,
    findings: [...ranked],
    watching: checked.watching,
    held_back: checked.held_back,
    checks: checked.checks,
    ran: { search: covered, judge: true, online: false },
    coverage: coverageFacts(log),
    unrecognised: unrecognisedOnLists(floorRun.facts.model_ids, files),
  });
  if (covered || (noAiCode(floorRun) && ranked.length === 0)) return brief;
  if (options.client) return `${brief}Not checked against the served levers: ${clientCoverageShortfall(log)}.\n`;
  return `${brief}Not checked against the database: ${coverageShortfall(log, jobsOf(input))}.\n`;
}

                                                   
                                                                                                 
                            
                                                                                       
                       
                                                                                                                               
                                
 

export async function verifyFindings(path        , input             , options                = {})                        {
  checkInputShape(input);
  const floorRun = await runPipeline(path, options);
  const files = maskedFileMap(path, options.commit);
  const base = databaseProvenance();
  const exactSources = floorRun.exact.flatMap((item) => [...(item.source ? [item.source] : []), ...(item.kind === 'dependency' && item.release_notes ? [item.release_notes.url] : [])]);
  const provenance             = {
    ...base,
    allowed: new Set([...base.allowed, ...exactSources]),
    knownIds: new Set(floorRun.facts.model_ids.map((model) => model.id)),
    repoText: floorRun.facts.manifests.flatMap((manifest) => manifest.dependencies.map((dep) => `${dep.name} ${dep.spec}`)).join('\n'),
  };
  const findings = withProgramEvidence(input.findings ?? [], floorRun.findings);
  const watching = rowsOfShape(input.watching ?? [], ['thing', 'why', 'source'], ({ thing, why, source }) => ({ thing, why, source }));
  const floorByTitle = new Map(floorRun.findings.map((finding) => [finding.title, finding]));
  const heldBack = rowsOfShape(input.held_back ?? [], ['thing', 'reason'], (row) => heldBackRow(row, floorByTitle));
  const atTheDoor = [...findings.dropped, ...watching.dropped, ...heldBack.dropped];
  const judged = runJudgeChecks({
    findings: findings.kept,
    watching: watching.kept,
    held_back: heldBack.kept,
    files,
    provenance: { ...provenance, leverNames: new Map(loadLevers().map((lever) => [lever.id, lever.name])), repoFiles: new Set([...files.keys()].map((file) => (file.split('/').pop() ?? file).toLowerCase())), repoStems: stemsOf(files.keys()) },
  });
  const leftOut = leftOutFloor(floorRun.findings, judged.findings, judged.held_back);
  const checked = { ...judged, findings: [...judged.findings, ...leftOut.kept], checks: { ...judged.checks, dropped: [...atTheDoor, ...judged.checks.dropped, ...leftOut.dropped].map((item) => knownWhere(item, files)) } };
  // The saved findings carry the brief's numbers and ROI, because a person says yes to a number, and the pull request prints the ROI.
  // Whether the repo already uses a lever is the program's call, from the repo's own text: a session can't send it.
  const marked = markInUse(checked.findings, files, loadLevers());
  const ranked = rankFindings(withValues(marked, valueContext(floorRun.facts, files)), floorRun.as_of).findings;
  return { version: 1, findings: ranked, watching: checked.watching, held_back: checked.held_back, dropped: publicDropped(checked.checks.dropped, files), ...(options.log ? { brief: briefFor(floorRun, checked, ranked, input, options.log, files, options) } : {}) };
}

/** A masked, numbered window of one file: the only way the plugin path reads code. */
export function showLines(files                             , file        , line        , radius        )                {
  const text = files.get(file);
  if (text === undefined) return null;
  const lines = text.split('\n');
  const from = Math.max(1, line - radius);
  const to = Math.min(lines.length, line + radius);
  return maskText(lines.slice(from - 1, to).map((value, index) => `${from + index}| ${value.slice(0, 300)}`).join('\n'));
}
