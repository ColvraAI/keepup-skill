// What keepup's own records know about the ids a change could move to: which are already shut down, and where a chain of
// successors ends up live. A provider's literal successor can itself be gone by the date of the run.
import { retirements } from './db.js';
import { findRetirement, statusAsOf,                 } from './retirements.js';
                                                 
                                              

const MAX_CHAIN = 8;
const ID_IN_TEXT = /[\w.-]*\d[\w.-]*\w|[a-z]+-[\w.-]*\w/gi;

/** Follow the successors until one is live on this date. Null when the chain runs out, or loops, before that. */
export function liveEnd(id        , asOf        , rows                       , seen                    = [])                {
  const row = findRetirement(id, rows);
  if (!row || statusAsOf(row, asOf) !== 'retired') return id;
  if (seen.includes(id) || seen.length >= MAX_CHAIN) return null;
  return row.successors.map((next) => liveEnd(next, asOf, rows, [...seen, id])).find(Boolean) ?? null;
}

                                                 
                                                                                            
                                                   
 

/** The catalog for one finding on one date. */
export function catalogFor(finding         , asOf        , rows                        = retirements())                 {
  const isRetired = (id        ) => {
    const row = findRetirement(id, rows);
    return Boolean(row) && statusAsOf(row              , asOf) === 'retired';
  };
  const text = [finding.title, finding.why, ...finding.options.flatMap((option) => [option.name, option.what, option.needs]), ...(finding.evidence ?? [])].join('\n');
  const ids = [...new Set([...text.matchAll(ID_IN_TEXT)].map((match) => match[0]))];
  const moves = Object.fromEntries(ids.filter(isRetired).flatMap((id) => {
    const end = liveEnd(id, asOf, rows);
    return end ? [[id, end]] : [];
  }));
  return { isRetired, liveEnds: [...new Set(Object.values(moves))], moves };
}
