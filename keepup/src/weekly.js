// The weekly one-liner: whether a model this repo sends is going away, whether any exact check newly applies,
// and how many records are new in the 7 days before a date. It reads only this machine (the repo, and the records here
// or the client's cached pack) and never prints more than one line. In the installed client the hook may first start a
// pack refresh in the background, which talks to keepup's server; this module never does.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { addDays, humanDate, humanDayMonth } from './dates.js';
import { noAiLine } from './brief.js';
import { fetchedDate, loadRecords, presentSources, recordDates, retirements } from './db.js';
import { caseLookup, catalogUse, exclusionLookup, unloadedExampleLookup } from './catalog-use.js';
import { checkDependencies, checkModels,                                       } from './exact-checks.js';
import { buildFacts } from './facts.js';
import { listRepoFiles } from './git-files.js';
import { maskText } from './mask.js';
import { NoFilesError } from './pipeline.js';
import { loadSignals } from './signals.js';
                                            

const WEEK_DAYS = 7;
export const SOON_DAYS = 30;
const STALE_DB_DAYS = 14;
/** All a due check needs of the 40,000 records: packages' versions, and the rest only as counts by date. Facts needs only where AI calls are. A client's pack has no package records, so there the dependency half finds nothing new. */
const PACKAGE_SOURCES = ['npm', 'pypi'];
const AI_CALL_SIGNALS = /^(?:llm_call|sdk_|raw_http_llm)/;

/** The same count as newRecordCount, from how many records carry each date. */
export function newRecordCountFrom(dates                                  , asOf        )         {
  const after = addDays(asOf, -WEEK_DAYS);
  return Object.entries(dates).reduce((sum, [date, count]) => (date > after && date <= asOf ? sum + count : sum), 0);
}

export function newRecordCount(records                                                   , asOf        )         {
  const after = addDays(asOf, -WEEK_DAYS);
  return records.filter((record) => {
    const date = record.released || record.updated || '';
    return date > after && date <= asOf;
  }).length;
}

/**
 * What's in the database with a date this week, not yet compared to the repo: /keepup does that. Most of it is registry
 * entries, whose date is the newest publish, and the data can't tell a first publish from a republish, so it's "new or updated".
 */
export function weeklyLine(changes        , newThisWeek        , nearest                                                              )         {
  const count = `${newThisWeek.toLocaleString('en-US')} new or updated this week`;
  if (changes > 0) return `keepup: ${changes} new change${changes === 1 ? ' applies' : 's apply'} · ${count} · /keepup`;
  if (nearest?.effective) return `keepup: ${nearest.model} shuts down ${nearest.earliest ? 'no earlier than ' : ''}${humanDate(nearest.effective)} · ${count} · /keepup`;
  return `keepup: no model you use shuts down in the next ${SOON_DAYS} days · ${count} · /keepup to check them`;
}

/** Says the date when it's one model, because the date is what someone acts on. */
export function goingAwayLine(models                                                               )         {
  const retired = models.filter((model) => model.status === 'retired').length;
  const dates = models.filter((model) => model.status !== 'retired' && model.effective).map((model) => model.effective          ).sort();
  if (models.length === 1) {
    const [only] = models;
    return only.status === 'retired' ? `keepup: 1 model you use is already shut down · /keepup` : `keepup: 1 model you use shuts down ${humanDayMonth(only.effective          )} · /keepup`;
  }
  if (dates.length === 0) return `keepup: ${retired} models you use are already shut down · /keepup`;
  return `keepup: ${models.length} models you use are shut down or go by ${humanDayMonth(dates.at(-1)          )} · /keepup`;
}

function stoppedLine(files        )         {
  return `keepup: stopped early, with ${files.toLocaleString('en-US')} file${files === 1 ? '' : 's'} not read, so this can't say what applies · /keepup`;
}

function inWeek(date               , asOf        )          {
  return date !== null && date > addDays(asOf, -WEEK_DAYS) && date <= asOf;
}

function modelNewlyApplies(check            , asOf        )          {
  return check.live_places.length > 0 && (inWeek(check.announced, asOf) || inWeek(check.effective, asOf));
}

/** A model this code sends that's gone, or goes within 30 days. */
export function modelGoingAway(check                                                                        , today        )          {
  if (check.live_places.length === 0 || check.routed_to) return false;
  if (check.status === 'retired') return true;
  return check.status === 'retiring' && check.effective !== null && check.effective <= addDays(today, SOON_DAYS);
}

/**
 * A brand-new major the declared range doesn't allow. Patches don't count: a busy library ships
 * one most weeks, so counting them would mean this line is never quiet.
 */
export function dependencyNewlyApplies(check                                                            , asOf        )          {
  return check.status === 'behind' && /^\d+\.0\.0$/.test(check.latest ?? '') && inWeek(check.latest_date, asOf);
}

                               
                        
                               
                                                              
                                             
                                                                                                 
                                
                                                                          
                                  
 

                                
                         
                           
                                                                                                      
                          
                                                                                            
                                
 

function staleNote(fetched        , today        )         {
  return addDays(fetched, STALE_DB_DAYS) < today ? ` · database from ${humanDayMonth(fetched)}` : '';
}

export async function weeklyCheck(path        , options                = {})                        {
  const fetched = fetchedDate();
  const asOf = options.asOf ?? fetched;
  const today = options.asOf ?? options.today ?? new Date().toISOString().slice(0, 10);
  const listed = listRepoFiles(path, { commit: options.commit });
  const spec = loadSignals();
  const facts = buildFacts(path, { commit: options.commit, listed, spec: { ...spec, signals: spec.signals.filter((signal) => AI_CALL_SIGNALS.test(signal.name)) } });
  const late = facts.checked.over_time ?? 0;
  if (facts.checked.files === 0 && !late) throw new NoFilesError(path);
  const files = new Map(listed.files.map((file) => [file.path, maskText(file.text)]));
  const signals = { catalogUse: catalogUse(files), exclusionAt: exclusionLookup(files), caseAt: caseLookup(files), unloadedExample: unloadedExampleLookup(files) };
  const allModels = checkModels(facts.model_ids, retirements(), today, signals);
  const models = allModels.filter((check) => modelNewlyApplies(check, asOf));
  const dependencies = (await checkDependencies(facts.manifests.flatMap((manifest) => manifest.dependencies), { records: loadRecords(presentSources(PACKAGE_SOURCES)), asOf }))
    .filter((check) => dependencyNewlyApplies(check, asOf));
  const newRecords = newRecordCountFrom(recordDates().dates, asOf);
  const applies = [...models, ...dependencies];
  const goingAway = allModels.filter((check) => modelGoingAway(check, today) || (options.firstSight === true && check.live_places.length > 0 && check.status === 'retiring'));
  const nearest = allModels.filter((check) => check.status === 'retiring' && check.effective && check.live_places.length > 0 && !check.routed_to).sort((a, b) => (a.effective          ).localeCompare(b.effective          ))[0] ?? null;
  const hasAiCode = facts.ai_call_sites.length > 0 || facts.model_ids.length > 0;
  if (!hasAiCode && !late) return { line: noAiLine(facts.checked.files), new_records: newRecords, applies, going_away: goingAway, has_ai_code: false, stopped_early: false };
  const line = goingAway.length > 0 ? goingAwayLine(goingAway) : late ? stoppedLine(late) : weeklyLine(applies.length, newRecords, nearest);
  return { line: `${line}${staleNote(fetched, today)}`, new_records: newRecords, applies, going_away: goingAway, has_ai_code: hasAiCode, stopped_early: late > 0 };
}

function readState(file        )                         {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8'))                          ;
  } catch {
    return {};
  }
}

function today(now                    )         {
  return (now ?? new Date().toISOString()).slice(0, 10);
}

/** True when this repo's line hasn't been shown in the last 7 days. */
export function weeklyDue(file        , repo        , now         )          {
  const last = readState(file)[resolve(repo)];
  return !last || addDays(last, WEEK_DAYS) <= today(now);
}

/** True until this repo's line has been shown once. */
export function firstSight(file        , repo        )          {
  return !readState(file)[resolve(repo)];
}

export function markShown(file        , repo        , now         )       {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ ...readState(file), [resolve(repo)]: today(now) }));
}
