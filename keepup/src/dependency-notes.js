// For a library far enough behind to matter, reads its own release notes. Online runs only: a dependency that's only
// old stays held back, because age alone is never a finding. A note that can't be read changes nothing.
import { AI_LIBRARY } from './findings.js';
                                                         
import { registryRepository,                      } from './registry.js';
import { fetchReleaseNotes, gainsBetween, gainWindow,                    parseReleaseNotes, specGains } from './release-notes.js';
import { lowestVersionIn, compareVersions } from './semver.js';

const MIN_MAJORS_BEHIND = 2;
const PROTOCOL_LIBRARY = /^rmcp$|^@modelcontextprotocol\/|^mcp$|^mcp-sdk$/;
const ALL_TIME = '0000-00-00';

                                         
                         
                                      
                                
 

function farBehind(check                 )          {
  return AI_LIBRARY.test(check.name) && check.status === 'behind' && check.majors_behind >= MIN_MAJORS_BEHIND && Boolean(check.latest);
}

/** A protocol library whose lockfile sits behind what its range allows: the notes between them are a person's call to weigh. */
function lockedBehind(check                 )          {
  return PROTOCOL_LIBRARY.test(check.name) && check.status === 'allowed-by-range' && Boolean(check.latest && check.locked) && compareVersions(check.locked?.version          , check.latest          ) < 0;
}

function worthReading(check                 )          {
  return farBehind(check) || lockedBehind(check);
}

async function withNotes(check                 , options                        )                           {
  try {
    const repository = await registryRepository({ ecosystem: check.ecosystem, name: check.name }, options.registry ?? {});
    const notes = await fetchReleaseNotes({ name: check.name, ecosystem: check.ecosystem }, repository, options.notes ?? {});
    const window = lockedBehind(check) ? { declared: check.locked?.version          , latest: check.latest          , since: ALL_TIME } : gainWindow(check.spec, check.latest          , options.since);
    if (!notes || !window) return check;
    const entries = parseReleaseNotes(notes.text);
    const declared = lowestVersionIn(check.spec);
    const spec = PROTOCOL_LIBRARY.test(check.name) && declared && farBehind(check) ? specGains(entries, declared, check.latest          ) : [];
    return { ...check, release_notes: { url: notes.url, gains: gainsBetween(entries, window), ...(spec.length ? { spec } : {}) } };
  } catch {
    return check;
  }
}

export async function addReleaseNotes(checks                            , options                        )                             {
  const out                    = [];
  for (const check of checks) out.push(worthReading(check) ? await withNotes(check, options) : check);
  return out;
}
