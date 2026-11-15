// What the plugin path remembers between keepup commands, in the plugin's data folder: the prepared files, and a log of
// the searches, bundles and reads that really happened, so a brief's coverage line is written from what ran and not from what a model says ran.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const LOG = 'session-log.jsonl';
const SEARCHES_PER_JOB = 2;
const BUNDLE_READ = /^bundles\.(jobs|patterns)\.\d+$/;

/** What keepup bundles built, and how much of it the session really read. */
                                 
                        
                             
                                                                                   
                             
                            
                                 
                                   
                                                                               
                                         
 

/** What keepup itself printed into the session since keepup prepare: the only cost the plugin path can see, since the session's own tokens never reach it. */
                                 
                         
                                                              
                           
                                               
                           
                                 
                           
 

                             
                            
                         
                                    
                                                                                    
                                    
 

/** What the program counted when it logged an event, never what a model says it did. */
                                                                        

                   
                         
                           
                       
                          
                         
                              
                             
                               
                                         
 

/** A plugin's data folder is shared by every repo, so in a session each project gets its own: two open repos must never read each other's files. */
function ownFolder(dir        , env                   )         {
  if (env.KEEPUP_PLUGIN !== '1') return dir;
  const project = realpathSync(env.CLAUDE_PROJECT_DIR ?? process.cwd());
  const safeName = basename(project).replace(/[^\w.-]/g, '-');
  return join(dir, 'repos', `${safeName}-${createHash('sha256').update(project).digest('hex').slice(0, 10)}`);
}

export function dataDir(given         , env                    = process.env)         {
  return ownFolder(given ?? env.CLAUDE_PLUGIN_DATA ?? join(homedir(), '.keepup'), env);
}

export function resetLog(dir        )       {
  mkdirSync(dir, { recursive: true });
  rmSync(join(dir, LOG), { force: true });
}

/** Never gets in the way: a log that can't be written means a brief claims less, not that a command fails. A print is text keepup gave the session that isn't a read, so coverage never counts it. */
export function logEvent(dir                    , kind                                                     , detail        , counts              = {})       {
  if (!dir) return;
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, LOG), `${JSON.stringify({ kind, detail, ...counts, at: new Date().toISOString() })}\n`);
  } catch {
    // Nothing to do.
  }
}

function logLines(path        )            {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line)           ];
    } catch {
      return [];
    }
  });
}

const isBundleRead = (line         )          => line.kind === 'read' && BUNDLE_READ.test(line.detail ?? '');

/** One bundle read twice is one bundle. */
function distinctReads(lines                    , prefix        )            {
  const reads = lines.filter((line) => isBundleRead(line) && (line.detail ?? '').startsWith(prefix));
  return [...new Map(reads.map((line) => [line.detail, line])).values()];
}

/** Patterns are built once, by keepup prepare. Jobs are built again by each keepup bundles, so only what was read since the last one counts. */
function bundleCoverage(lines                    )                             {
  const last = lines.findLastIndex((line) => line.kind === 'bundles');
  if (last === -1) return undefined;
  const built = lines[last];
  const jobReads = distinctReads(lines.slice(last), 'bundles.jobs.');
  return {
    jobs: built.jobs ?? 0,
    jobs_read: jobReads.length,
    job_total: built.job_total ?? 0,
    patterns: built.patterns ?? 0,
    patterns_read: distinctReads(lines, 'bundles.patterns.').length,
    candidates_read: jobReads.reduce((sum, line) => sum + (line.candidates ?? 0), 0),
    ...(built.unmatched?.length ? { unmatched: built.unmatched } : {}),
  };
}

const ANY_BUNDLE = /^bundles\.(?:(?:jobs|patterns|floor_rest)\.\d+|floor)$/;

/** Added up from keepup prepare on. Each line carries the characters the command printed, counted when it printed them. */
function printedSince(lines                    )                             {
  const start = lines.findLastIndex((line) => line.kind === 'prepare');
  if (start === -1) return undefined;
  const since = lines.slice(start);
  const shown = since.filter((line) => line.kind === 'read' || line.kind === 'print');
  return {
    chars: since.reduce((sum, line) => sum + (typeof line.chars === 'number' && line.chars > 0 ? line.chars : 0), 0),
    bundles: new Set(shown.filter((line) => ANY_BUNDLE.test(line.detail ?? '')).map((line) => line.detail)).size,
    windows: since.filter((line) => line.kind === 'read' && !(line.detail ?? '').startsWith('bundles.')).length,
    started: lines[start].at ?? '',
  };
}

export function readLog(dir        )             {
  const lines = logLines(join(dir, LOG));
  const plainReads = lines.filter((line) => line.kind === 'read' && !isBundleRead(line)).length;
  const bundleReads = new Set(lines.filter(isBundleRead).map((line) => line.detail)).size;
  const bundles = bundleCoverage(lines);
  const printed = printedSince(lines);
  return { searches: lines.filter((line) => line.kind === 'search').length, reads: plainReads + bundleReads, ...(bundles ? { bundles } : {}), ...(printed ? { printed } : {}) };
}

/** Every bundle the program built was read, and at least one was for a job, or, for a session that never built any, two searches a job. Otherwise a run hasn't earned the database's count: with no job bundle, nothing was compared with it. */
export function coverageHolds(log            , jobs        )          {
  if (log.bundles) return log.bundles.jobs > 0 && log.bundles.jobs_read >= log.bundles.jobs && log.bundles.patterns_read >= log.bundles.patterns && log.reads > 0;
  return jobs > 0 && log.searches >= jobs * SEARCHES_PER_JOB && log.reads > 0;
}

/**
 * In the installed client there are no job bundles: the profile and job steps search a raw catalogue that never ships.
 * What there is to read is one bundle per pattern with a served lever, so reading every one of those is the whole check.
 * With no lever served there is nothing to read, and that is still a complete run of what the pack proves.
 */
export function clientCoverageHolds(log            )          {
  return log.bundles !== undefined && log.bundles.patterns_read >= log.bundles.patterns;
}

export function clientCoverageShortfall(log            )         {
  if (!log.bundles) return "keepup prepare didn't run in this data folder, so no pattern bundle was read";
  return `${log.bundles.patterns_read} of ${log.bundles.patterns} pattern bundles read, and it takes all of them`;
}

/** What a brief may say ran. Candidates and jobs appear only when the bundles really ran. */
export function coverageFacts(log            )                                                                                                              {
  return { searches: log.searches, reads: log.reads, ...(log.bundles ? { candidates: log.bundles.candidates_read, jobs: log.bundles.job_total } : {}) };
}

/** Why a run hasn't earned the database's count, in what really ran. */
export function coverageShortfall(log            , jobs        )         {
  if (!log.bundles) return `${log.searches} searches ran for ${jobs} jobs, and it takes ${SEARCHES_PER_JOB} for each, with at least one read`;
  const { jobs_read, jobs: built, patterns_read, patterns, unmatched = [] } = log.bundles;
  if (built === 0) return `${unmatched.length ? `nothing in the database matched ${unmatched.join(', ')}, so ` : ''}no job bundle was built, and ${patterns_read} of ${patterns} pattern bundles read`;
  return `${jobs_read} of ${built} job bundles and ${patterns_read} of ${patterns} pattern bundles read, and it takes all of them`;
}
