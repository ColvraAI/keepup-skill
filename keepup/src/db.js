// Reads the real database in data/db, or in an installed client the detection pack's copy of it: src/store.ts says which
// folder, at call time. Lazy and cached per process: the MCP file is large, and most calls need only some of the sources.
// Personal fields are dropped as records come in.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { isoDate, LONG_DATE_SOURCE } from './dates.js';
import {                                              parseChangelog, yearBlindWindowCount } from './changelogs.js';
import { extractRetirements,                                                 withPageRows } from './retirements.js';
import {                searchRecords,                                     } from './search.js';
import { packInfo, rawDir } from './store.js';

const WINDOW = { since: '2026-09-01', until: '2026-10-31' };
const CHANGELOG_PROVIDERS                               = ['openai', 'anthropic', 'gemini'];
const CHANGELOG = 'changelog';
const PERSONAL_FIELDS = new Set(['author', 'authors', 'owner', 'owner_handle', 'ownerHandle', 'maintainer', 'maintainers', 'publisher', 'publishers', 'email', 'emails', 'contributors']);
const DEADLINE_WORDS = new RegExp(LONG_DATE_SOURCE, 'g');
const DEPRECATION_WORDS = /\b(?:deprecat\w*|retir\w*|shut ?down|shuts down|sunset\w*)\b/i;

                                 
                                       
                                        
                                      
                        
 

                         
                           
                           
                                                       
                                                                      
                                          
 

const sourceCache = new Map                             ();
const changelogCache = new Map                                   ();
const retirementCache = new Map                               ();

function readGzip(path        )         {
  try {
    return gunzipSync(readFileSync(path)).toString('utf8');
  } catch (error) {
    throw new Error(`Can't read the database file ${path}: ${(error         ).message}`);
  }
}

function withoutPersonalFields(record          )           {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !PERSONAL_FIELDS.has(key)))            ;
}

function jsonlSources(dir        )           {
  return readdirSync(dir).filter((name) => name.endsWith('.jsonl.gz')).map((name) => name.replace('.jsonl.gz', '')).sort();
}

function loadJsonl(source        , dir        )                      {
  return readGzip(join(dir, `${source}.jsonl.gz`))
    .split('\n')
    .filter(Boolean)
    .map((line) => withoutPersonalFields(JSON.parse(line)            ));
}

/** Every dated entry on the three pages, all years. The exact checks need the old ones too. */
export function changelogEntries(dir = rawDir())                            {
  const cached = changelogCache.get(dir);
  if (cached) return cached;
  const entries = CHANGELOG_PROVIDERS.flatMap((provider) => parseChangelog(provider, readGzip(join(dir, `changelog-${provider}.txt.gz`))));
  changelogCache.set(dir, entries);
  return entries;
}

/** The curated files that go with a raw folder: data/db sits two levels under the root that holds db/, in the repo and in a pack alike. */
function curatedBeside(dir        , ...parts          )         {
  return join(dir, '..', '..', 'db', ...parts);
}

function deprecationPage(dir        )                                                                                   {
  const file = curatedBeside(dir, 'patterns', 'PAT-retired-model-id.json');
  if (!existsSync(file)) return { models: [], undated: [] };
  const page = JSON.parse(readFileSync(file, 'utf8'))                                                             ;
  return { models: page.models ?? [], undated: page.undated_successors ?? [] };
}

export function retirements(dir = rawDir())                        {
  const cached = retirementCache.get(dir);
  if (cached) return cached;
  const page = deprecationPage(dir);
  const found = withPageRows(extractRetirements(changelogEntries(dir)), page.models, page.undated);
  retirementCache.set(dir, found);
  return found;
}

function deadlinesIn(text        , after        )           {
  const dates = [...text.matchAll(DEADLINE_WORDS)].map((match) => isoDate(match[1], match[2], match[3]));
  return [...new Set(dates)].filter((date) => date > after);
}

function changelogRecord(entry                )           {
  const deprecation = DEPRECATION_WORDS.test(entry.text);
  return {
    source: CHANGELOG,
    kind: deprecation ? 'deprecation' : 'api-feature',
    provider: entry.provider,
    name: `${entry.provider} ${entry.date}: ${entry.text.slice(0, 80)}`,
    url: entry.url,
    description: entry.text,
    released: entry.date,
    tags: entry.tags,
    deadline: deadlinesIn(entry.text, entry.date),
  };
}

function loadChangelogWindow(dir        )                      {
  return changelogEntries(dir).filter((entry) => entry.date >= WINDOW.since && entry.date <= WINDOW.until).map(changelogRecord);
}

function loadSource(source        , dir        )                      {
  const key = `${dir}\0${source}`;
  const cached = sourceCache.get(key);
  if (cached) return cached;
  const rows = source === CHANGELOG ? loadChangelogWindow(dir) : loadJsonl(source, dir);
  sourceCache.set(key, rows);
  return rows;
}

export function allSources(dir = rawDir())           {
  return [...jsonlSources(dir), CHANGELOG];
}

/** No sources named means every source in that folder, not in the default one. */
export function loadRecords(sources                    , dir = rawDir())                      {
  return (sources ?? allSources(dir)).flatMap((source) => loadSource(source, dir));
}

/** Those of the named sources this folder holds. A client's pack carries no package records, and a check that needs them says less instead of failing. */
export function presentSources(sources                   , dir = rawDir())           {
  const here = new Set(allSources(dir));
  return sources.filter((source) => here.has(source));
}

/**
 * The date of the newest file, from its gzip header. Not the file's own mtime, which a copy would change.
 * In a client the pack states its own date, and a file the daily job wrote may carry no header date at all.
 */
export function fetchedDate(dir = rawDir())         {
  const pack = packInfo();
  if (pack && resolve(dir) === resolve(rawDir())) return pack.as_of;
  const stamps = readdirSync(dir)
    .filter((name) => name.endsWith('.gz'))
    .map((name) => {
      const path = join(dir, name);
      const seconds = readFileSync(path).readUInt32LE(4);
      return seconds > 0 ? seconds * 1000 : statSync(path).mtimeMs;
    });
  return new Date(Math.max(...stamps)).toISOString().slice(0, 10);
}

export function dbInfo(dir = rawDir())         {
  const sources = allSources(dir);
  const counts = sources.map((source) => [source, loadSource(source, dir).length]         );
  const bySource = Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]));
  const records = counts.reduce((sum, [, count]) => sum + count, 0);
  const inWindow = bySource[CHANGELOG];
  const yearBlind = yearBlindWindowCount(changelogEntries(dir), WINDOW.since, WINDOW.until);
  return {
    fetched: fetchedDate(dir),
    records,
    by_source: bySource,
    window: WINDOW,
    reconciliation: {
      changelog_in_window: inWindow,
      changelog_year_blind: yearBlind,
      records_year_blind: records - inWindow + yearBlind,
      note: `${yearBlind - inWindow} of the ${yearBlind} changelog entries counted without the year are OpenAI's Sep and Oct entries from earlier years; ${inWindow} are in the window.`,
    },
  };
}

/** A record's date as a day, keeping whether it had a time on it, which is all a count by date compares. */
export function dateKey(record                                        )         {
  const date = String(record.released || record.updated || '');
  return date.length > 10 ? `${date.slice(0, 10)}T` : date;
}

                              
                           
                           
                                                   
 

/** How many records carry each date, computed from every record. scripts/pin-replay.ts writes it to db/record-dates.json. */
export function computeRecordDates(dir = rawDir())              {
  const dates = new Map                ();
  const records = loadRecords(allSources(dir), dir);
  for (const record of records) {
    const key = dateKey(record);
    if (key) dates.set(key, (dates.get(key) ?? 0) + 1);
  }
  return { fetched: fetchedDate(dir), records: records.length, dates: Object.fromEntries([...dates].sort(([a], [b]) => a.localeCompare(b))) };
}

/** The saved counts beside this database when they match it, so the weekly line needn't read every record to count them. */
export function recordDates(dir = rawDir())              {
  const fetched = fetchedDate(dir);
  const file = curatedBeside(dir, 'record-dates.json');
  if (existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, 'utf8'))               ;
    if (saved.fetched === fetched) return saved;
  }
  return computeRecordDates(dir);
}

/** search.py's query. It reads only the sources the query names. */
export function query(q             , dir = rawDir())               {
  return searchRecords(loadRecords(q.sources?.length ? q.sources : allSources(dir), dir), q);
}
