// Reads model retirements out of the changelog text. Deliberately narrow: a sentence counts only when
// a model itself is what's going away, so "deprecated fast mode for Claude Opus 4.8" never reads as Opus 4.8 retiring.
                                                                         
import { isoDate, LONG_DATE_SOURCE } from './dates.js';
import { claudeDisplayName, findModelIds } from './model-ids.js';

                                                                     

                             
                                       
                             
                               
                                    
                                    
                                    
                                         
                          
                            
                                                                                                    
                              
                                                                                                                          
                                          
                                                                    
                                
                                                                                                   
                              
                                    
 

const TRIGGER = /\b(?:deprecat\w*|retir\w*|shut ?down|shuts? down|sunset\w*|removed from the API)\b/i;
const NEGATED = /\bnot deprecated\b/i;
const FEATURE_NOUN = /\b(?:beta|mode|window|parameters?|headers?|tools?|endpoints?|APIs?|features?|support|objects?|platform)\b/i;
const DONE = /\b(?:we['’]ve retired|have retired|(?:is|are|now|been) shut down|were deprecated and removed)\b/i;
const SUCCESSOR_WORD = /\b(?:migrat\w+|upgrad\w+|recommend\w*|use|using|replac\w+|switch\w*|instead|in favor of|points? to)\b/i;
const FORWARD_DATE = new RegExp(LONG_DATE_SOURCE);
/** "Deprecated on 30 Sep" isn't "shut down on 30 Sep": only these words make a date a shutdown date. */
const SHUTDOWN_WORD = /\b(?:shut ?down|shuts? down|retir\w*|sunset\w*|removed)\b/i;
const AUTO_ROUTED = /\bAPI requests to ([\w.-]*\w)\s+are automatically routed to ([\w.-]*\w)/gi;
const CLAUDE_NAME = /\bClaude(?: (?:Opus|Sonnet|Haiku|Fable|Mythos))? \d+(?:\.\d+)?(?![\d.]*\d)/g;

function splitSentences(text        )           {
  return text.split(/(?<=\.)\s+(?=[A-Z(])|(?<=\s\.)\s+/).map((sentence) => sentence.trim()).filter(Boolean);
}

function firstDate(sentence        )                {
  const match = sentence.match(FORWARD_DATE);
  return match ? isoDate(match[1], match[2], match[3]) : null;
}

/** The part of a sentence before any "migrate to X" words: the things going away. */
function subjectPart(sentence        )         {
  const cut = sentence.search(SUCCESSOR_WORD);
  return cut === -1 ? sentence : sentence.slice(0, cut);
}

function idsIn(text        )           {
  return [...new Set(findModelIds(text).filter((mention) => mention.route === 'direct').map((mention) => mention.id))];
}

function namesIn(text        )           {
  return [...new Set(text.match(CLAUDE_NAME) ?? [])];
}

                   
                             
                               
 

/** Pairs "Claude Sonnet 4 model ( claude-sonnet-4-20250514 )" when the counts line up; otherwise each stands alone. */
function subjectsOf(part        )            {
  const ids = idsIn(part);
  const names = namesIn(part);
  if (ids.length === names.length) return ids.map((id, i) => ({ id, name: names[i] }));
  return [...ids.map((id) => ({ id, name: null })), ...names.map((name) => ({ id: null, name }))];
}

function isAboutAFeature(sentence        )          {
  const firstModel = Math.min(...[...idsIn(sentence), ...namesIn(sentence)].map((token) => sentence.indexOf(token)));
  const lead = sentence.slice(0, firstModel);
  return FEATURE_NOUN.test(lead.replace(/\bDeprecation announcement\b/i, ''));
}

function successorsFor(sentences                   , index        )                                           {
  for (const [offset, sentence] of sentences.slice(index, index + 3).entries()) {
    if (offset > 0 && TRIGGER.test(sentence) && subjectsOf(subjectPart(sentence)).length > 0) break;
    const cut = sentence.search(SUCCESSOR_WORD);
    if (cut === -1) continue;
    const tail = sentence.slice(cut);
    const names = namesIn(tail);
    const ids = idsIn(tail);
    const named = names.length ? names : ids;
    if (named.length) return { named, respective: /\brespectively\b/i.test(tail) };
  }
  return { named: [], respective: false };
}

/** The date in the sentence itself, or in a following one with no subject of its own: "These models will shut down on ...". */
function dateFor(sentences                   , index        )                {
  const own = firstDate(subjectPart(sentences[index]));
  if (own) return own;
  const next = sentences[index + 1];
  const continues = next !== undefined && TRIGGER.test(next) && idsIn(subjectPart(next)).length === 0;
  return continues ? firstDate(next) : null;
}

/** A date only counts as a shutdown when the words around it say so. */
function shutdownDateFor(sentences                   , index        )                {
  const date = dateFor(sentences, index);
  if (!date) return null;
  const own = firstDate(subjectPart(sentences[index]));
  return own && !SHUTDOWN_WORD.test(sentences[index]) ? null : date;
}

function routedIn(text        )                                                                          {
  return new Map([...text.matchAll(AUTO_ROUTED)].map((match) => [match[1], { to: match[2], sentence: match[0] }]));
}

function retirementsInEntry(entry                )               {
  const sentences = splitSentences(entry.text);
  const routed = routedIn(entry.text);
  const out               = [];
  sentences.forEach((sentence, index) => {
    if (!TRIGGER.test(sentence) || NEGATED.test(sentence)) return;
    const part = subjectPart(sentence);
    const subjects = subjectsOf(part);
    if (subjects.length === 0 || isAboutAFeature(part)) return;
    const { named, respective } = successorsFor(sentences, index);
    const done = DONE.test(sentence);
    const date = shutdownDateFor(sentences, index);
    subjects.forEach((subject, i) => {
      const route = subject.id ? routed.get(subject.id) : undefined;
      out.push({
        provider: entry.provider,
        ...subject,
        status: done ? 'retired' : date ? 'retiring' : 'deprecated',
        announced: entry.date,
        effective: done ? (date ?? entry.date) : date,
        successors: respective && named.length === subjects.length ? [named[i]] : named,
        source: entry.url,
        sentence,
        ...(route ? { routed_to: route.to, routed_sentence: route.sentence } : {}),
      });
    });
  });
  return out;
}

function keyOf(r            )         {
  return r.id ?? `name:${r.name}`;
}

/** Oldest first, so a later "we've retired" entry wins over its earlier announcement and keeps that date. */
function merge(earlier            , later            )             {
  return {
    ...later,
    announced: earlier.announced,
    name: later.name ?? earlier.name,
    successors: !earlier.successors_from_page && later.successors.length ? later.successors : earlier.successors,
    ...(earlier.successors_from_page ? { successors_from_page: true } : {}),
    ...(earlier.page_source ? { page_source: earlier.page_source } : {}),
  };
}

export function extractRetirements(entries                           )               {
  const byKey = new Map                    ();
  const oldestFirst = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const entry of oldestFirst) {
    for (const retirement of retirementsInEntry(entry)) {
      const key = keyOf(retirement);
      const existing = byKey.get(key);
      byKey.set(key, existing ? merge(existing, retirement) : retirement);
    }
  }
  return [...byKey.values()];
}

/** One row of a provider's deprecation page, as db/tools/retired-models.ts wrote it into PAT-retired-model-id.json. */
                          
                      
                            
                        
                                         
                             
                        
                          
 

/** A row with a replacement and no shutdown date. It says what to move to, and only for a model the changelog says is going. */
                             
                      
                                         
                          
 

const PAGE_PROVIDER                                              = { openai: 'openai', anthropic: 'anthropic', google: 'gemini', gemini: 'gemini' };

/**
 * The changelog knows the announcement and whether a model is really gone. The table is the provider's literal answer
 * for the successor, and for the date when the changelog gives none or gives a different one.
 */
function withItsUndatedRow(row            , undated                        )             {
  return undated ? { ...row, successors: undated.successors, successors_from_page: true, page_source: undated.source } : row;
}

function withItsPageRow(row            , page                     )             {
  if (!page) return row;
  const literal = page.successors.length ? { successors: page.successors, successors_from_page: true } : {};
  const base = { ...row, ...literal, page_source: page.source };
  const firm = row.effective !== null && (row.status === 'retired' || row.effective === page.date);
  if (firm) return base;
  return { ...base, status: 'retiring', effective: page.date, sentence: `${row.sentence} ${page.note}`, source: page.source, ...(page.earliest ? { earliest: true } : {}) };
}

/** The changelog's row stands where it has one, since it knows the announcement. The page adds every id the changelog never named. */
export function withPageRows(found                       , rows                    , undated                        = [])               {
  const known = new Set(found.flatMap((retirement) => (retirement.id ? [retirement.id] : [])));
  const pages = new Map(rows.filter((row) => PAGE_PROVIDER[row.provider]).map((row) => [row.id, row]));
  const undatedById = new Map(undated.map((row) => [row.id, row]));
  const merged = found.map((retirement) => withItsUndatedRow(withItsPageRow(retirement, retirement.id ? pages.get(retirement.id) : undefined), retirement.id ? undatedById.get(retirement.id) : undefined));
  const added = rows.filter((row) => !known.has(row.id) && PAGE_PROVIDER[row.provider]).map((row)             => ({
    provider: PAGE_PROVIDER[row.provider],
    id: row.id,
    name: null,
    status: 'retiring',
    announced: null,
    effective: row.date,
    successors: row.successors,
    source: row.source,
    sentence: row.note,
    ...(row.successors.length ? { successors_from_page: true } : {}),
    ...(row.earliest ? { earliest: true } : {}),
  }));
  return [...merged, ...added];
}

/** Exact id first, then the display name for retirements that named no id. */
export function findRetirement(modelId        , retirements                       )                    {
  const exact = retirements.find((r) => r.id === modelId) ?? null;
  const name = claudeDisplayName(modelId);
  const named = name ? retirements.find((r) => r.name === name && r.id === null) ?? null : null;
  if (exact && named) return named.status === 'retired' && exact.status !== 'retired' ? merge(exact, named) : exact;
  return exact ?? named;
}

/** What a repo that asks a gateway for anthropic/claude-sonnet-4 means: the family the provider has retired, under its display name. */
export function findByDisplayName(modelId        , retirements                       )                    {
  const name = claudeDisplayName(modelId);
  return name ? retirements.find((r) => r.name === name) ?? null : null;
}

/** "Retiring" turns into "retired" once its date has passed. */
export function statusAsOf(retirement            , asOf        )                   {
  if (!retirement.effective || retirement.effective > asOf) return retirement.status;
  return retirement.earliest ? 'deprecated' : 'retired';
}
