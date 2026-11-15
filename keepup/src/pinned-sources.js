// What the online pipeline read and the plugin's offline gate can't fetch: the release notes, registry pages and model cards
// behind the published runs, and where a moved library went. scripts/pin-replay.ts writes db/pinned-sources.json from data/replay,
// which doesn't ship with the plugin, so a finding is checked against the same text on every path.
// In an installed client the pack carries no pinned pages, so this reads as empty there and verify relies on the rest.
import { existsSync, readFileSync } from 'node:fs';
import { curatedDir } from './store.js';

                                
                        
                                                     
 

export function loadPinnedSources(file = curatedDir('pinned-sources.json'))                {
  if (!existsSync(file)) return { note: '', sources: {} };
  return JSON.parse(readFileSync(file, 'utf8'))                 ;
}

/** Where each moved library went, in the words a finding uses, and the page it's named on. */
export function moveFacts(file = curatedDir('moves.json'))                                                                               {
  if (!existsSync(file)) return [];
  const { moves } = JSON.parse(readFileSync(file, 'utf8'))                                                                ;
  return moves.filter((move) => move.ecosystem === 'npm').map((move) => ({ url: `https://www.npmjs.com/package/${move.to}`, from_url: `https://www.npmjs.com/package/${move.from}`, text: `${move.from} moved to ${move.to}.` }));
}
