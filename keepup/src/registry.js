// The only place in keepup that talks to a package registry, and only when asked (--online).
// Answers are cached under tmp/, reduced to what the checks need. The scan itself stays offline.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
                                                
import { REPO_ROOT } from './signals.js';

export const DEFAULT_CACHE_DIR = join(REPO_ROOT, 'tmp', 'registry-cache');
const TIMEOUT_MS = 20_000;
const USER_AGENT = 'keepup-demo/0.1 (dependency check)';
const CRATE_DELAY_MS = 1100;
const SAFE_NAME = /^(?:@[a-z0-9][\w.-]*\/)?[A-Za-z0-9][\w.-]*$/;

                               
                                
                        
                          
                               
                                                           
                          
                              
                                                                                         
                                      
 

                                  
                             
                                    
                          
                                 
 

                  
                          
                                                           
                                     
 

function githubUrl(raw         )                {
  const url = typeof raw === 'string' ? raw : (raw                                        )?.url;
  if (typeof url !== 'string') return null;
  const match = url.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#].*)?$/);
  return match ? `https://github.com/${match[1]}/${match[2]}` : null;
}

function dayOf(stamp        )         {
  return stamp.slice(0, 10);
}

function parseNpm(body                                                                                            )         {
  const latest = body['dist-tags']?.latest;
  if (!latest) throw new Error('npm gave no latest version');
  const entries = Object.entries(body.time ?? {}).filter(([version]) => version !== 'created' && version !== 'modified');
  return { latest, version_dates: Object.fromEntries(entries.map(([version, stamp]) => [version, dayOf(stamp)])), repository: githubUrl(body.repository) };
}

function parseCrate(body                                                                                                                                           )         {
  const latest = body.crate?.max_stable_version ?? body.crate?.max_version;
  if (!latest) throw new Error('crates.io gave no latest version');
  return { latest, version_dates: Object.fromEntries((body.versions ?? []).map((v) => [v.num, dayOf(v.created_at)])), repository: githubUrl(body.crate?.repository) };
}

function parsePypi(body                                                                                                                                                                      )         {
  const latest = body.info?.version;
  if (!latest) throw new Error('PyPI gave no latest version');
  const dates = Object.entries(body.releases ?? {}).flatMap(([version, files]) => {
    const stamp = files[0]?.upload_time_iso_8601 ?? files[0]?.upload_time;
    return stamp ? [[version, dayOf(stamp)]] : [];
  });
  const urls = Object.values(body.info?.project_urls ?? {});
  return { latest, version_dates: Object.fromEntries(dates), repository: urls.map(githubUrl).find(Boolean) ?? null };
}

                    
                       
                          
                                          
 

function endpointFor(ecosystem           , name        )           {
  if (ecosystem === 'npm') return { url: `https://registry.npmjs.org/${encodeURIComponent(name)}`, source: `https://www.npmjs.com/package/${name}`, parse: parseNpm };
  if (ecosystem === 'crates') return { url: `https://crates.io/api/v1/crates/${name}`, source: `https://crates.io/crates/${name}`, parse: parseCrate };
  return { url: `https://pypi.org/pypi/${name}/json`, source: `https://pypi.org/project/${name}/`, parse: parsePypi };
}

function cachePath(cacheDir        , ecosystem           , name        )         {
  return join(cacheDir, ecosystem, `${encodeURIComponent(name)}.json`);
}

function readCache(path        )                      {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'))                ;
  } catch {
    return null;
  }
}

function writeCache(path        , dir        , info              )       {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(info));
}

/** Registry facts for one package. Throws with a plain message when the registry can't answer. */
export async function registryInfo(dep                                        , options                  = {})                        {
  if (!SAFE_NAME.test(dep.name)) throw new Error(`Not a package name: ${dep.name}`);
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const path = cachePath(cacheDir, dep.ecosystem, dep.name);
  const cached = readCache(path);
  if (cached) return cached;
  const endpoint = endpointFor(dep.ecosystem, dep.name);
  if (dep.ecosystem === 'crates') await new Promise((resolve) => setTimeout(resolve, options.crateDelayMs ?? CRATE_DELAY_MS));
  const response = await (options.fetchImpl ?? fetch)(endpoint.url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${endpoint.source} answered ${response.status}`);
  const parsed = endpoint.parse((await response.json())         );
  const info               = {
    ecosystem: dep.ecosystem,
    name: dep.name,
    latest: parsed.latest,
    latest_date: parsed.version_dates[parsed.latest] ?? '',
    version_dates: parsed.version_dates,
    source: endpoint.source,
    fetched_on: options.today ?? new Date().toISOString().slice(0, 10),
    repository: parsed.repository,
  };
  writeCache(path, join(cacheDir, dep.ecosystem), info);
  return info;
}

/** A cached answer from before repositories were kept keeps its versions: only the missing field is asked for. */
export async function registryRepository(dep                                        , options                  = {})                         {
  const info = await registryInfo(dep, options);
  if (info.repository !== undefined) return info.repository;
  const endpoint = endpointFor(dep.ecosystem, dep.name);
  if (dep.ecosystem === 'crates') await new Promise((resolve) => setTimeout(resolve, options.crateDelayMs ?? CRATE_DELAY_MS));
  const response = await (options.fetchImpl ?? fetch)(endpoint.url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) return null;
  const { repository } = endpoint.parse((await response.json())         );
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  writeCache(cachePath(cacheDir, dep.ecosystem, dep.name), join(cacheDir, dep.ecosystem), { ...info, repository });
  return repository;
}

const OPENROUTER_LIST = 'https://openrouter.ai/api/v1/models';

/** The ids OpenRouter lists right now, saved beside the registry answers. Null when it can't be asked: then nobody says an id is gone. */
export async function openRouterModelIds(options                  = {})                                      {
  const dir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const path = join(dir, 'openrouter-models.json');
  if (existsSync(path)) {
    try {
      return new Set((JSON.parse(readFileSync(path, 'utf8'))                     ).ids);
    } catch {
      return null;
    }
  }
  try {
    const response = await (options.fetchImpl ?? fetch)(OPENROUTER_LIST, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return null;
    const ids = ((await response.json())                                 ).data?.flatMap((row) => (typeof row.id === 'string' ? [row.id] : [])) ?? [];
    if (ids.length === 0) return null;
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify({ fetched_on: new Date().toISOString().slice(0, 10), ids }));
    return new Set(ids);
  } catch {
    return null;
  }
}
