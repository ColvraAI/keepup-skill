// Step 4: Claude reads each bundle and decides fit or no fit. It gets no tools, and everything it says goes
// through src/check.ts before anyone sees it. Hitting the dollar cap or a refusal keeps what's done and marks the run incomplete.
import {                } from './candidates.js';
import {                  proseProblem, reworded } from './check.js';
                                                  
import {                       placeSendsNothing,                 } from './exact-checks.js';
import { modelFinding,               PROTOCOL_RULE } from './findings.js';
import { humanDate } from './dates.js';
                                                                   
import { callerLines, floorBundle, floorItems,                              jobBundle, patternBundles, recordUrls } from './judge-bundles.js';
import { JUDGE_SCHEMA, JUDGE_SYSTEM,                                                   } from './judge-schema.js';
import { loadLevers, loadPatternMeta,                              } from './levers.js';
import { BudgetExceededError,          } from './llm.js';
                                                                              
import { applyProviderSetting } from './provider-setting.js';
import { repoPrefix, untrustedBlock } from './repo-text.js';
                                                                                                   
                                            

const CONCURRENCY = 3;
const RECENT_VERSIONS = 3;
const MAX_TOKENS = 8000;

                               
                                 
                                 
                                     
                                             
                                          
                                                 
                                                                                       
                                            
 

/** An earlier step wrote this from repo text, so a repo can have steered it. It stays fenced. */
function profileText(profile                )         {
  if (!profile) return 'Nothing is known about the product beyond the text above.';
  const jobs = profile.jobs.map((job) => `- ${job.job}: ${job.how}`).join('\n');
  return untrustedBlock('profile', 'what an earlier step understood about the product', `${profile.one_liner}\nStack: ${profile.stack.join(', ')}\nJobs:\n${jobs}\nCan only adopt: ${profile.stack_lock.join(' ')}`);
}

function modelIdsIn(context                 )                                 {
  const models = context.exact.filter((item)                     => item.kind === 'model');
  const named = (text        , id        ) => new RegExp(`(?<![\\w.-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(text);
  return (finding) => models.filter((model) => named(finding.why, model.model) || named(finding.title, model.model)).map((model) => model.model);
}

/** For a library behind on versions, the code near what its notes name, so the judge can see what's already handled. */
function callersIn(context                 )                               {
  return (finding) => {
    const check = dependencyOf(finding, context.exact);
    return check?.release_notes ? callerLines(check.name, check.release_notes.gains.map((gain) => gain.text), context.files) : '';
  };
}

export function floorItemsFor(context                 , findings                    , levers                  )              {
  return floorItems(findings, levers, modelIdsIn(context), callersIn(context));
}

const HUGGING_FACE = /^https:\/\/huggingface\.co\//;

/** A better model for a job the product already does is a better answer, not a capability it lacked, and with no date nothing stops working. */
function effectOf(raw            )                    {
  const swapsAModel = raw.sources.length > 0 && raw.sources.every((url) => HUGGING_FACE.test(url));
  if (!swapsAModel || !raw.effect.includes('better answers')) return raw.effect;
  return raw.effect.filter((word) => word !== 'new capability' && (word !== 'keeps working' || Boolean(raw.deadline)));
}

function toFinding(raw            )          {
  return {
    title: raw.title,
    effect: effectOf(raw),
    proof: raw.proof                    ,
    effort: raw.effort,
    where: raw.where,
    why: raw.why,
    options: raw.options,
    sources: raw.sources,
    lever: raw.lever || null,
    pr: null,
    deadline: raw.deadline || null,
    evidence: [],
  };
}

function leverOption(lever       )                {
  return { name: lever.name, what: lever.how, needs: lever.needs ?? '', source: lever.source };
}

                          
                                  
                                              
                                         
                                                                
                                                                                                        
 

function dependencyOf(finding         , exact                        )                         {
  return exact.find((item)                          => item.kind === 'dependency' && finding.title.startsWith(`${item.name} is `)) ?? null;
}

/** What the judge showed isn't a gain comes out of the finding. Its reason has to pass the same checks as anything else it says. */
function withoutNotGains(item           , verdict            , context                )                                           {
  const check = dependencyOf(item.finding, context.exact);
  const marks = verdict.not_gains ?? [];
  if (!check || marks.length === 0 || !context.rebuildDependency) return { finding: item.finding, dropped: [] };
  const dropped            = [];
  const clean = marks.map((mark) => {
    const problem = proseProblem(mark.why, `${floorCorpus(item, context)}\n${item.callers ?? ''}`, context.provenance, floorRecords(item, context));
    if (problem) dropped.push({ what: `The judge's note on "${item.finding.title}"`, why: problem, where: placeOf(item.finding) });
    return { text: mark.text, why: problem ? '' : mark.why };
  });
  const rebuilt = context.rebuildDependency(check, clean);
  return { finding: rebuilt ?? item.finding, dropped };
}

/** Takes the judge's not-live places out of a model finding, and rewrites its facts for the models that are left. */
function withoutPlaces(finding         , notLive                     , context                )          {
  const where = finding.where.filter((place) => !notLive.has(`${place.file}:${place.line}`));
  const models = context.exact.filter((item)                     => item.kind === 'model')
    .filter((check) => check.live_places.some((place) => finding.where.some((w) => w.file === place.file && w.line === place.line)))
    .map((check) => ({ ...check, live_places: check.live_places.filter((place) => !notLive.has(`${place.file}:${place.line}`)) }))
    .filter((check) => check.live_places.length > 0);
  if (notLive.size === 0 || models.length === 0) return { ...finding, where };
  const rebuilt = (context.rebuild ?? modelFinding)(models);
  return { ...rebuilt, lever: finding.lever, options: finding.options, sources: finding.sources };
}

function floorRecords(item           , context                )         {
  const urls = [...item.finding.sources, ...item.levers.map((lever) => lever.source)];
  return [item.finding.why, item.finding.title, ...(item.finding.evidence ?? []), ...urls.map((url) => context.provenance.textFor(url))].join('\n');
}

function floorCorpus(item           , context                )         {
  return [context.provenance.repoText ?? '', floorRecords(item, context), ...item.finding.where.map((place) => place.text)].join('\n');
}

function heldRows(item           , places                        )             {
  return places.map((place) => ({
    thing: `${item.finding.title}, at ${place.file}:${place.line}`,
    date: null,
    reason: place.why,
    source: item.finding.sources[0] ?? null,
  }));
}

/** A place comes off a finding only if it's on that finding. On a locked finding the program also has to see that it sends nothing. */
function checkedNotLive(item           , verdict            , context                )                                                         {
  const dropped            = [];
  const places = verdict.not_live.filter((place) => {
    const onFinding = item.finding.where.some((w) => w.file === place.file && w.line === place.line);
    const line = context.files.get(place.file)?.split('\n')[place.line - 1];
    const provable = line !== undefined && placeSendsNothing(place.file, line);
    if (onFinding && (provable || !item.finding.locked)) return true;
    dropped.push({ what: `The judge's claim that nothing sends ${item.finding.title}`, why: onFinding ? `the program can't see why that line sends nothing: ${place.why}` : `that place isn't on this finding: ${place.why}`, where: `${place.file}:${place.line}` });
    return false;
  });
  return { places, dropped };
}

function withItsLevers(item           )          {
  return {
    ...item.finding,
    lever: item.levers[0]?.id ?? item.finding.lever,
    // A lever is checked against the provider's current page. A changelog's "named successor" can itself be retired by now.
    options: item.levers.length ? item.levers.map(leverOption) : item.finding.options,
    sources: [...new Set([...item.finding.sources, ...item.levers.map((lever) => lever.source)])],
  };
}

/** The program's facts stay as they are; the judge decides if they matter here and adds a checked note. */
function applyVerdict(given           , verdict                        , context                )                                                                                     {
  if (!verdict) return { finding: withItsLevers(given), exact: withItsLevers(given), held: [], dropped: [] };
  const marked = withoutNotGains(given, verdict, context);
  const item = { ...given, finding: marked.finding };
  const withLevers = withItsLevers(item);
  const givenNote = reworded(verdict.note);
  const problem = givenNote ? proseProblem(givenNote, floorCorpus(item, context), context.provenance, floorRecords(item, context)) : null;
  const dropped            = problem ? [{ what: `The judge's note on "${item.finding.title}"`, why: problem, where: placeOf(item.finding) }] : [];
  const note = problem ? '' : givenNote;
  if (!verdict.keep && !item.finding.locked) {
    return { finding: null, dropped: [...marked.dropped, ...dropped], held: [{ thing: item.finding.title, date: null, reason: note || 'The judge found it doesn\'t matter to this product.', source: item.finding.sources[0] ?? null }] };
  }
  const refused            = verdict.keep ? [] : [{ what: `The judge's wish to drop "${item.finding.title}"`, why: `it stays, because ${item.finding.locked}`, where: placeOf(item.finding) }];
  const keptNote = verdict.keep ? note : '';
  const notLive = checkedNotLive(item, verdict, context);
  const trimmed = withoutPlaces(withLevers, new Set(notLive.places.map((place) => `${place.file}:${place.line}`)), context);
  const held = heldRows(item, notLive.places);
  const all = [...marked.dropped, ...dropped, ...refused, ...notLive.dropped];
  if (trimmed.where.length === 0) return { finding: null, dropped: all, held };
  return { finding: { ...trimmed, why: keptNote ? `${trimmed.why} ${keptNote}` : trimmed.why, effort: item.finding.locked === PROTOCOL_RULE || item.finding.sdk_unverified ? trimmed.effort : verdict.effort }, exact: trimmed, held, dropped: all };
}

function placeOf(finding         )                     {
  const place = finding.where[0];
  return place ? `${place.file}:${place.line}` : undefined;
}

async function askBundle(llm                  , prefix        , bundle        )                      {
  return llm.ask            ({ purpose: bundle.id, system: JUDGE_SYSTEM, prefix, prompt: bundle.prompt, schema: JUDGE_SCHEMA, maxTokens: MAX_TOKENS, effort: 'medium' });
}

                         
                          
                              
                         
 

/** The first bundle runs alone so it can write the prompt cache; the rest read it. */
async function askAll(llm                  , prefix        , bundles                   )                           {
  const askOne = async (bundle        )                         => {
    try {
      return { bundle, reply: await askBundle(llm, prefix, bundle) };
    } catch (error) {
      return { bundle, error: error          };
    }
  };
  const results                  = [];
  for (let start = 0; start < bundles.length;) {
    const size = start === 0 ? 1 : CONCURRENCY;
    results.push(...await Promise.all(bundles.slice(start, start + size).map(askOne)));
    start += size;
  }
  return results;
}

function buildProvenance(input            , bundles                   , options              )             {
  const texts = new Map                ();
  const add = (url        , text        ) => texts.set(url, `${texts.get(url) ?? ''}\n${text}`);
  for (const bundle of bundles) for (const { url, text } of bundle.urls) add(url, text);
  for (const finding of input.floor.findings) for (const url of finding.sources) add(url, (finding.evidence ?? []).join('\n'));
  for (const row of input.floor.held_back) if (row.source) add(row.source, row.date ?? '');
  const repoText = input.context.facts.manifests.flatMap((manifest) => manifest.dependencies.map((dep) => `${dep.name} ${dep.spec}`)).join('\n');
  const watched = (input.candidates                        ).filter((candidate) => candidate.watch_only).flatMap((candidate) => recordUrls(candidate.record));
  const knownIds = new Set(input.context.facts.model_ids.map((model) => model.id));
  const programText = (options.libraryFacts ?? []).map((fact) => fact.text).join('\n');
  const repoFiles = new Set([...[...input.context.files.keys()].map((path) => (path.split('/').pop() ?? path).toLowerCase()), (input.context.facts.repo.split('/').pop() ?? '').toLowerCase()]);
  const repoStems = stemsOf(input.context.files.keys());
  const leverNames = new Map((options.levers ?? loadLevers()).map((lever) => [lever.id, lever.name]));
  return { leverNames, repoStems, allowed: new Set([...texts.keys(), ...(options.libraryFacts ?? []).map((fact) => fact.url)]), textFor: (url) => texts.get(url) ?? '', repoText, programText, knownIds, retiredIds: options.retiredIds, watchOnly: new Set(watched), repoFiles };
}

export function stemsOf(paths                  )              {
  return new Set([...paths].flatMap((path) => path.toLowerCase().split('/').map((part) => part.replace(/\.[a-z0-9]+$/, ''))));
}

function dedupeKey(finding         )         {
  return finding.lever ?? finding.options[0]?.source ?? finding.title;
}

/** Lines this close are the same call. */
const SAME_CALL_LINES = 5;

const samePlace = (a         , b         )          => a.where.some((one) => b.where.some((other) => one.file === other.file && Math.abs(one.line - other.line) <= SAME_CALL_LINES));

/** No lever, nothing to pick and no date: at a lever's own call, with the same effect, it's that lever said again. */
const saysNothingMore = (finding         , all                    )          =>
  !finding.lever && !finding.deadline && finding.options.length === 0 && all.some((other) => other.lever && samePlace(finding, other) && finding.effect.some((word) => other.effect.includes(word)));

/** One finding per lever: two bundles landing on the same thing become one, with both sets of places. */
export function mergeFindings(findings                    )            {
  const merged = new Map                 ();
  for (const finding of findings) {
    const key = dedupeKey(finding);
    const earlier = merged.get(key);
    if (!earlier) { merged.set(key, finding); continue; }
    const places = new Map([...earlier.where, ...finding.where].map((place) => [`${place.file}:${place.line}`, place]));
    merged.set(key, { ...earlier, where: [...places.values()] });
  }
  const all = [...merged.values()];
  return all.filter((finding) => !saysNothingMore(finding, all));
}

function dedupeRows   (rows              , key                    )      {
  return [...new Map(rows.map((row) => [key(row), row])).values()];
}

export function candidatesFor(job                         , candidates                      )              {
  return candidates.filter((candidate) => candidate.job === job.job);
}

function exactPlaces(context                 )              {
  const models = context.exact.filter((item)                     => item.kind === 'model');
  return new Set(models.flatMap((model) => [...model.live_places, ...model.not_live].map((place) => `${place.file}:${place.line}`)));
}

/** What needs no profile: the floor, and each pattern with its levers and the code at its hits. */
export function repoBundles(context                 , options                                              , items                      , levers                  )                                               {
  return {
    floor: floorBundle(items, context.files),
    patterns: patternBundles({ hits: context.hits, exactPlaces: exactPlaces(context), levers, patterns: options.patterns ?? loadPatternMeta(), changelog: options.changelog, files: context.files }),
  };
}

function assembleBundles(input            , options              , items                      , levers                  )           {
  const { floor, patterns } = repoBundles(input.context, options, items, levers);
  const jobs = (input.profile?.jobs ?? []).flatMap((job) => {
    const bundle = jobBundle(job, candidatesFor(job, input.candidates                        ), input.context.files, options.libraryFacts ?? []);
    return bundle ? [bundle] : [];
  });
  return [...(floor ? [floor] : []), ...patterns, ...jobs];
}

                     
                               
                            
                                
                            
                              
                             
 

function collect(outcomes                          , items                      , context                )            {
  const replies = outcomes.flatMap((outcome) => (outcome.reply ? [outcome.reply] : []));
  const verdicts = new Map(replies.flatMap((reply) => reply.floor_verdicts).map((verdict) => [verdict.id, verdict]));
  const applied = items.map((item) => applyVerdict(item, verdicts.get(item.id), context));
  return {
    exact: applied.flatMap((result) => (result.exact ? [result.exact] : [])),
    findings: [...applied.flatMap((result) => (result.finding ? [result.finding] : [])), ...replies.flatMap((reply) => reply.findings).map(toFinding)],
    watching: replies.flatMap((reply) => reply.watching),
    held: [...applied.flatMap((result) => result.held), ...replies.flatMap((reply) => reply.held_back).map((row) => ({ thing: row.thing, date: row.date || null, reason: row.reason, source: row.source || null }))],
    dropped: applied.flatMap((result) => result.dropped),
    skipped: outcomes.flatMap((outcome) => (outcome.error ? [`${outcome.bundle.id}: ${outcome.error.message}`] : [])),
  };
}

function incompleteFrom(outcomes                          , skipped                   )                            {
  if (skipped.length === 0) return undefined;
  const hitCap = outcomes.some((outcome) => outcome.error instanceof BudgetExceededError);
  return { reason: hitCap ? 'Stopped at the dollar cap. This is what was checked before it.' : 'Some steps failed. This is what was checked without them.', skipped };
}

const WATCH_REASON_LIMIT = 3;
/** Two search terms hit it, on top of its popularity: a single word in a description is too thin to tell a founder about. */
const WATCH_MIN_SCORE = 20;
const NOT_SOFTWARE = /\bawesome\b|\bcollection of\b|\bcurated\b|\bprompts?\b/i;
/** A model that names the engines that run it: a language label on its repo doesn't say this product can't call it. */
const RUNS_ELSEWHERE = /\bllama\.cpp\b|\bvllm\b|\bmlx\b|\bollama\b|\bopenai[- ]compatible\b|\bonnx\b/i;
/** A vendor's own record says what's unmeasured; "no independent results" is only said of a repo's plain listing. */
const STACK_LANGUAGE = (languages                   ) => languages.filter((language) => !['JSON', 'Markdown', 'YAML', 'TOML', 'HTML', 'CSS', 'Shell', 'SQL'].includes(language)).slice(0, 2).join(' and ') || 'stack';

/** Weights this runtime can't load won't get closer by waiting, unlike a library that may gain a port, so they're held back, not watched. */
function splitWatching(rows                     , candidates                      )                                             {
  const weights = new Set(candidates.filter((candidate) => candidate.watch_only && candidate.record.source === 'huggingface').flatMap((candidate) => recordUrls(candidate.record)));
  return {
    watching: rows.filter((row) => !weights.has(row.source)),
    held: rows.filter((row) => weights.has(row.source)).map((row) => ({ thing: row.thing, date: null, reason: row.why, source: row.source })),
  };
}

/** A thing the stack lock cut, which the judge placed nowhere, still gets said, if the row can name the job and what blocks it. */
function unplacedWatch(candidates                      , placed                                               , languages                   )             {
  const urls = new Set(placed.flatMap((row) => (row.source ? [row.source] : [])));
  const popular = (candidate           ) => Number(candidate.record.stars ?? 0) + Number(candidate.record.likes ?? 0) * 10;
  const open = candidates.filter((candidate) => candidate.watch_only && candidate.score >= WATCH_MIN_SCORE && !NOT_SOFTWARE.test(String(candidate.record.name ?? '') + String(candidate.record.description ?? '')) && !recordUrls(candidate.record).some((url) => urls.has(url)));
  return [...open].sort((a, b) => popular(b) - popular(a)).slice(0, WATCH_REASON_LIMIT).flatMap(({ record, job }) => {
    if (!record.url || typeof record.language !== 'string' || RUNS_ELSEWHERE.test(String(record.description ?? ''))) return [];
    return [{ thing: String(record.name), why: `It could do this job: ${job}. What blocks it: its repo is ${record.language}, this product is ${STACK_LANGUAGE(languages)}, and its listing shows no independent results yet.`, source: record.url }];
  });
}

/** The repo or vendor a row is about, so two names for one thing count as one. */
function familyOf(thing        , source               )         {
  const fromSource = source?.match(/^https:\/\/(?:github\.com|huggingface\.co)\/[^/]+\/([\w.-]+)/)?.[1];
  const name = (fromSource ?? thing.split(/[\s:(]/)[0].split('/').pop() ?? thing).toLowerCase();
  return name.split(/[^a-z0-9]+/)[0];
}

/** A thing can't be both "watching" and "can't run here, held back": watching holds what's on the way, so it wins. */
function withoutWatched(rows                     , watching                     )             {
  const families = new Set(watching.map((item) => familyOf(item.thing, item.source)));
  return rows.filter((row) => !families.has(familyOf(row.thing, row.source)));
}

function moveLine(move             , floor                                             )         {
  const min = floor ? `${move.to} ${floor.version} or later` : move.to;
  const manifests = move.manifests.map((place) => `${place.file}:${place.line}`).join(' and ');
  const stale = move.stale_since ? ` ${move.declared} has had no release since ${humanDate(move.stale_since)}.` : '';
  const shipped = move.versions.slice(-RECENT_VERSIONS).map((item) => `${item.version} on ${humanDate(item.date)}`).join(', ');
  const floorNote = floor ? ` ${floor.version}, released ${humanDate(floor.date)}, is its first release on or after this model's own.` : '';
  return `Moving means changing ${move.declared} to ${min} at ${manifests}, and these files load the old package and move with it: ${move.loaders.join(', ')}.${stale}${shipped ? ` ${move.to} shipped ${shipped}.` : ''}${floorNote}`;
}

/** The first stable release on or after the day the model it runs was released. */
function floorVersion(move             , finding         , candidates                      )                                              {
  const urls = new Set([...finding.sources, ...finding.options.map((option) => option.source)]);
  const released = candidates.find((candidate) => recordUrls(candidate.record).some((url) => urls.has(url)))?.record.released;
  return typeof released === 'string' ? move.versions.find((item) => item.date >= released) : undefined;
}

/** Any finding that needs a library moved gets the same exact sentence and places, whatever the judge wrote. */
function withMoveFacts(finding         , facts                        , candidates                      )          {
  const text = `${finding.title} ${finding.why} ${finding.options.map((option) => `${option.name} ${option.what} ${option.needs}`).join(' ')}`;
  const fact = facts.find((item) => item.move && text.includes(item.move.to));
  if (!fact?.move) return finding;
  const places = new Map([...finding.where, ...fact.move.defaults, ...fact.move.manifests].map((place) => [`${place.file}:${place.line}`, place]));
  return {
    ...finding,
    where: [...places.values()],
    why: `${finding.why} ${moveLine(fact.move, floorVersion(fact.move, finding, candidates))}`,
    sources: [...new Set([...finding.sources, fact.url])],
    evidence: [...(finding.evidence ?? []), fact.text],
  };
}

/** An absence is raised once: however the judge split it across its levers, it's one finding. */
export function oneFindingPerAbsence(findings                    , levers                  , patterns                        )            {
  const absent = new Set(patterns.filter((pattern) => pattern.absence).map((pattern) => pattern.id));
  const patternOf = (finding         ) => levers.find((lever) => lever.id === finding.lever)?.pattern;
  return findings.filter((finding, index) => {
    const pattern = patternOf(finding);
    return !pattern || !absent.has(pattern) || findings.findIndex((other) => patternOf(other) === pattern) === index;
  });
}

/** Runs the judge over every bundle. The floor is never lost: a bundle that fails leaves its facts as they were. */
export async function judgeAll(input            , options              )                       {
  const levers = options.levers ?? loadLevers();
  const items = floorItemsFor(input.context, input.floor.findings, levers);
  const bundles = assembleBundles(input, options, items, levers);
  const prefix = `${repoPrefix(input.context)}\n\n${profileText(input.profile)}`;
  const outcomes = await askAll(options.llm, prefix, bundles);
  const provenance = buildProvenance(input, bundles, options);
  const collected = collect(outcomes, items, { provenance, files: input.context.files, exact: input.context.exact, rebuild: input.floor.rebuild, rebuildDependency: input.floor.rebuildDependency });
  const candidates = input.candidates                        ;
  const judged = splitWatching(dedupeRows(collected.watching, (row) => row.thing), candidates);
  const placed = [...collected.held, ...judged.held, ...judged.watching.map((row) => ({ source: row.source }))];
  const languages = input.context.facts.languages.map((entry) => entry.language);
  const watching = [...judged.watching, ...unplacedWatch(candidates, placed, languages)];
  return applyProviderSetting({
    findings: oneFindingPerAbsence(mergeFindings(collected.findings), levers, options.patterns ?? loadPatternMeta()).map((finding) => withMoveFacts(finding, options.libraryFacts ?? [], candidates)),
    exact_findings: collected.exact,
    watching,
    held_back: withoutWatched(dedupeRows([...collected.held, ...judged.held], (row) => row.thing), watching),
    trusted_held_back: dedupeRows(input.floor.held_back, (row) => row.thing),
    provenance,
    dropped: collected.dropped,
    incomplete: incompleteFrom(outcomes, collected.skipped),
  }, options.providerOnly, levers);
}
