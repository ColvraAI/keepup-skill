// The detection pack: one document a day, the same for every account, signed before it leaves us. It holds what the
// scan and the exact checks need and nothing that is the product: patterns, signals, library moves, the three provider
// changelogs the retirement list is read from, and the public model price list. Never a lever, never the raw catalogue.
// Unpacked, it has the layout the loaders already read, so they stay as they are.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { RECORD_SHAPE } from './version.js';

                           
                        
                                   
                         
                                                                                                   
                           
 

                       
                        
                         
                            
                                                                                                    
                         
                           
                                      
                                                                                               
                                      
                                      
 

                           
                           
                        
                          
                                    
                                      
 

export class PackError extends Error {
  constructor(message        ) {
    super(message);
    this.name = 'PackError';
  }
}

/** Every path a pack may hold. A signed pack is still only allowed to write these, so nothing can land outside its folder or on a lever. */
export const PACK_PATH = /^(?:db\/patterns\/PAT-[A-Za-z0-9._-]+\.json|db\/(?:signals|moves)\.json|data\/db\/(?:changelog-[a-z0-9-]+\.txt|[a-z0-9-]+\.jsonl)\.gz)$/;
const PATTERN_FILE = /^PAT-[A-Za-z0-9._-]+\.json$/;
const CURATED_FILES = ['db/signals.json', 'db/moves.json']         ;
/** The only files from data/db that ship: vendor pages parsed by code, and the public price list. The catalogue's other sources are named nowhere here. */
const RAW_FILES = ['data/db/changelog-openai.txt.gz', 'data/db/changelog-anthropic.txt.gz', 'data/db/changelog-gemini.txt.gz', 'data/db/openrouter.jsonl.gz']         ;
const RETIRED_FILE = 'db/patterns/PAT-retired-model-id.json';
/**
 * The only files the daily job may lay over git's: the files it rebuilds by code from vendor pages. Everything else in
 * a pack is what a person reviewed in git, so a row that reached the database by any other way is never signed.
 */
export const OVERLAY_FILES                    = [...RAW_FILES, RETIRED_FILE];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isGzip(path        )          {
  return path.endsWith('.gz');
}

function fileFrom(path        , bytes        )           {
  return isGzip(path) ? { path, base64: bytes.toString('base64') } : { path, text: bytes.toString('utf8') };
}

function bytesOf(file          )         {
  return file.base64 !== undefined ? Buffer.from(file.base64, 'base64') : Buffer.from(file.text ?? '', 'utf8');
}

function isObject(value         )                                   {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsedObject(bytes        , what        )                          {
  let value         ;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new PackError(`${what} is not JSON.`);
  }
  if (!isObject(value)) throw new PackError(`${what} is not a JSON object.`);
  return value;
}

/** The fresh retired-model pattern is code's output from vendor pages, so it must be that pattern with exactly the fields git's copy has. */
function checkRetiredOverlay(root        , bytes        )       {
  const file = join(root, RETIRED_FILE);
  if (!existsSync(file)) throw new PackError(`A fresh ${RETIRED_FILE} has no copy in git to be checked against.`);
  const git = parsedObject(readFileSync(file), `git's ${RETIRED_FILE}`);
  const fresh = parsedObject(bytes, `The fresh ${RETIRED_FILE}`);
  if (fresh.id !== git.id) throw new PackError(`The fresh ${RETIRED_FILE} is another pattern.`);
  const keys = (value                         ) => Object.keys(value).sort().join(',');
  if (keys(fresh) !== keys(git)) throw new PackError(`The fresh ${RETIRED_FILE} has other fields than git's copy.`);
}

/** Throws rather than drops: a file that shouldn't be there means something upstream is wrong, and a person should hear of it. */
function checkOverrides(root        , overrides                             )       {
  for (const [path, bytes] of overrides) {
    if (!PACK_PATH.test(path) || !OVERLAY_FILES.includes(path)) throw new PackError(`A pack can't hold ${path} from the daily job: it lays only its own ${OVERLAY_FILES.length} files over git's.`);
    if (path === RETIRED_FILE) checkRetiredOverlay(root, bytes);
  }
}

/**
 * The pack's payload, as the exact string that gets signed. `overrides` lets the daily job put a fresher copy of one of
 * its own files (today's changelog, today's prices, today's retirement list) over the one in git, and nothing else.
 */
export function buildPack(root        , meta          , overrides                              = new Map())         {
  const patternsDir = join(root, 'db', 'patterns');
  const patterns = existsSync(patternsDir) ? readdirSync(patternsDir).filter((name) => PATTERN_FILE.test(name)).map((name) => `db/patterns/${name}`) : [];
  const fromDisk = [...patterns, ...CURATED_FILES, ...RAW_FILES].filter((path) => existsSync(join(root, path)));
  checkOverrides(root, overrides);
  const paths = [...new Set([...fromDisk, ...overrides.keys()])].sort();
  const files = paths.map((path) => fileFrom(path, overrides.get(path) ?? readFileSync(join(root, path))));
  const pack       = {
    kind: 'pack',
    shape: RECORD_SHAPE,
    built_at: meta.builtAt,
    as_of: meta.asOf,
    git_sha: meta.gitSha,
    min_client_version: meta.minClientVersion,
    revoked: [...meta.revoked].sort(),
    files,
  };
  return JSON.stringify(pack);
}

/** A short, stable name for a payload: the cache folder it unpacks to, and the ETag the server answers with. */
export function packId(payload        )         {
  return createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 16);
}

function isText(value         )                  {
  return typeof value === 'string';
}

function checkedFile(value         )           {
  if (typeof value !== 'object' || value === null) throw new PackError('A pack file is not an object.');
  const { path, text, base64 } = value                           ;
  if (!isText(path) || !PACK_PATH.test(path)) throw new PackError(`A pack can't hold ${isText(path) ? path.slice(0, 80) : 'a file with no path'}.`);
  if (isText(text) === isText(base64)) throw new PackError(`${path} needs its content once, as text or as base64.`);
  return isText(text) ? { path, text } : { path, base64: base64           };
}

/** Reads a payload whose signature already held. Unknown fields are ignored; anything it relies on is checked. */
export function parsePack(payload        )       {
  let raw         ;
  try {
    raw = JSON.parse(payload);
  } catch {
    throw new PackError('The pack is not JSON.');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new PackError('The pack is not a JSON object.');
  const value = raw                           ;
  if (value.kind !== 'pack') throw new PackError('This record is not a pack.');
  if (value.shape !== RECORD_SHAPE) throw new PackError(`This pack has shape ${String(value.shape)}, and this client reads shape ${RECORD_SHAPE}. Update keepup.`);
  if (!isText(value.built_at) || Number.isNaN(Date.parse(value.built_at))) throw new PackError('The pack has no build time.');
  if (!isText(value.as_of) || !DAY.test(value.as_of)) throw new PackError('The pack has no date.');
  if (!isText(value.git_sha) || !isText(value.min_client_version)) throw new PackError('The pack is missing its commit or its minimum client version.');
  if (!Array.isArray(value.revoked) || !value.revoked.every(isText)) throw new PackError('The pack has no list of revoked levers.');
  if (!Array.isArray(value.files)) throw new PackError('The pack has no files.');
  const files = value.files.map(checkedFile);
  if (new Set(files.map((file) => file.path)).size !== files.length) throw new PackError('The pack lists a file twice.');
  return {
    kind: 'pack',
    shape: RECORD_SHAPE,
    built_at: value.built_at,
    as_of: value.as_of,
    git_sha: value.git_sha,
    min_client_version: value.min_client_version,
    revoked: value.revoked            ,
    files,
  };
}

/** Writes the pack's files under `dir` and nothing else: whatever was there before is gone. */
export function materializePack(pack      , dir        )       {
  const staging = `${dir}.tmp-${process.pid}-${createHash('sha256').update(String(process.hrtime.bigint())).digest('hex').slice(0, 8)}`;
  rmSync(staging, { recursive: true, force: true });
  for (const file of pack.files) {
    const target = join(staging, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytesOf(file));
  }
  mkdirSync(staging, { recursive: true });
  mkdirSync(dirname(dir), { recursive: true });
  try {
    rmSync(dir, { recursive: true, force: true });
    renameSync(staging, dir);
  } catch (error) {
    // Another keepup process unpacked the same pack at the same moment. Its copy is as good as this one.
    rmSync(staging, { recursive: true, force: true });
    if (!packMatchesDir(pack, dir)) throw error;
  }
}

function filesUnder(dir        , prefix = '')           {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? filesUnder(join(dir, entry.name), path) : [path];
  });
}

/** True only when `dir` holds exactly the pack's files with exactly their bytes. The client checks this before every read of its cache. */
export function packMatchesDir(pack      , dir        )          {
  const expected = pack.files.map((file) => file.path).sort();
  const found = filesUnder(dir).sort();
  if (expected.length !== found.length || expected.some((path, index) => path !== found[index])) return false;
  try {
    return pack.files.every((file) => readFileSync(join(dir, file.path)).equals(bytesOf(file)));
  } catch {
    // A link or a folder where a file should be is not a match.
    return false;
  }
}
