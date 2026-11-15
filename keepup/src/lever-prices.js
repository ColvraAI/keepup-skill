// Prices for a lever's value: the database's OpenRouter rows, never typed. A model with no row has no price, and a
// database with no price file prices nothing: the brief then says what a change does, not what it saves.
import { fetchedDate, loadRecords, presentSources } from './db.js';
                                        
import { loadLevers } from './levers.js';
                                                               
import { DEFAULT_MODEL } from './llm.js';

export function priceTable(dir         )                                {
  const date = fetchedDate(dir);
  const rows = loadRecords(presentSources(['openrouter'], dir), dir).flatMap((row) => {
    const id = String(row.model_id ?? '');
    const [input, output] = [row.price_in_per_m, row.price_out_per_m];
    return id.includes('/') && typeof input === 'number' && typeof output === 'number' ? [{ tail: id.split('/')[1], model: id.split('/')[1], input, output, source: String(row.url ?? 'data/db/openrouter.jsonl.gz'), date }] : [];
  });
  return new Map(rows.map(({ tail, ...row }) => [tail, row]));
}

/** claude-sonnet-5-5 is listed as claude-sonnet-5.5. */
export function priceLookup(table                                = priceTable())                                     {
  return (model) => {
    const row = table.get(model) ?? table.get(model.replace(/-(\d+)-(\d+)$/, '-$1.$2'));
    return row ? { ...row, model } : null;
  };
}

/** Every model with a real price, for the dashboard's calculator. */
export function modelPrices()             {
  return [...priceTable().values()].sort((a, b) => a.model.localeCompare(b.model));
}

export function valueContext(facts                          , files                             )               {
  return { levers: loadLevers(), files, modelIds: facts.model_ids.map((item) => item.id), priceOf: priceLookup(), exampleModel: DEFAULT_MODEL };
}
