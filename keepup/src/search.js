// search.py in TypeScript: keyword retrieval with filters, ranked by term hits and traction.
// Pure over any list of records; db.ts feeds it.

                           
                          
                         
                         
                        
                                       
                                    
                                   
                                
                                         
                                               
                                             
                                              
                                        
                                  
 

                              
                                   
                                   
                                    
                                       
                                     
                                     
                          
                               
                          
                                      
 

                              
                         
                            
 

                               
                         
                      
                                           
 

const DEFAULT_LIMIT = 25;
const TRACTION_WEIGHTS                                         = [
  ['stars', 1], ['downloads_week', 0.5], ['downloads', 0.05], ['likes', 3], ['points', 4], ['installs', 2],
];

function textOf(record          )         {
  const tags = Array.isArray(record.tags) ? record.tags.join(' ') : '';
  return [
    record.name ?? '', record.description ?? '', (record.keywords ?? []).join(' '), (record.topics ?? []).join(' '),
    record.registry_name ?? '', record.task ?? '', tags,
  ].join(' ').toLowerCase();
}

export function signalOf(record                                   )         {
  return TRACTION_WEIGHTS.reduce((best, [key, weight]) => {
    const value = record[key];
    return typeof value === 'number' && value > 0 ? Math.max(best, value * weight) : best;
  }, 0);
}

function termMatcher(term        )         {
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`);
}

function passesFilters(record          , query             )          {
  if (query.sources?.length && !query.sources.includes(record.source)) return false;
  if (query.kinds?.length && !query.kinds.includes(record.kind ?? '')) return false;
  if (query.tasks?.length && !query.tasks.includes(record.task ?? '')) return false;
  const date = record.released || record.updated || '';
  return !(query.since && date < query.since);
}

function scoreRecord(record          , query             , matchers          )                {
  if (!passesFilters(record, query)) return null;
  const text = textOf(record);
  if (matchers.none.some((re) => re.test(text))) return null;
  if (!matchers.all.every((re) => re.test(text))) return null;
  const hits = matchers.any.filter((re) => re.test(text)).length;
  if (matchers.any.length > 0 && hits === 0) return null;
  const signal = signalOf(record);
  if (signal < (query.min_signal ?? 0)) return null;
  return hits * 10 + Math.log10(1 + signal);
}

                    
                                  
                                  
                                   
 

export function searchRecords(rows                     , query             )               {
  const matchers           = {
    any: (query.any ?? []).map(termMatcher),
    all: (query.all ?? []).map(termMatcher),
    none: (query.none ?? []).map(termMatcher),
  };
  const matched                = [];
  for (const record of rows) {
    const score = scoreRecord(record, query, matchers);
    if (score !== null) matched.push({ score, record });
  }
  const sorted = matched.sort((a, b) => b.score - a.score);
  return { total: sorted.length, of: rows.length, matches: sorted.slice(0, query.limit ?? DEFAULT_LIMIT) };
}

/** Parses and checks a query from outside; throws a plain message when it's wrong. */
export function parseSearchQuery(json        )              {
  let raw         ;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    throw new Error(`The query isn't JSON: ${(error         ).message}`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('The query must be a JSON object.');
  const query = raw                           ;
  for (const key of ['any', 'all', 'none', 'sources', 'kinds', 'tasks', 'fields']) {
    const value = query[key];
    if (value !== undefined && !(Array.isArray(value) && value.every((item) => typeof item === 'string'))) {
      throw new Error(`"${key}" must be a list of strings.`);
    }
  }
  return query               ;
}
