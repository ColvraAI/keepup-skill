// What the installed client adds around the engine's own steps: the account key, the day's pack, the levers for the
// patterns that fired, and a connected repo's run summary. It calls our server only through src/remote.ts, with the
// fetch bin/keepup.ts hands it. In a checkout of this repo (repo mode) none of it runs and nothing leaves the machine.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACCOUNT_KEY,                   readConnected, readCredentials, writeConnected, writeCredentials } from './client-files.js';
                                                     
import { humanDate } from './dates.js';
import { retirements } from './db.js';
                                        
import { repoName } from './git-files.js';
import { modelPrices } from './lever-prices.js';
import {                     fetchLevers, leversRequest,                     packIsStale, refreshPack,                     repoDashboardLink, sendRun, unnamedModels } from './remote.js';
                                              
import { runSummary } from './run-summary.js';
import { loadPatterns,                 } from './scan.js';
                                             
import { clientConfig, keepupHome, packInfo, SERVED_FILE, storeMode, useRun } from './store.js';
import { CLIENT_VERSION } from './version.js';

/** Waiting on a key or on setup: exit 3. */
export class WaitingError extends Error {}
/** A command this client doesn't run, or a request it can't make: exit 2. */
export class ClientUsageError extends Error {}

                             
                               
                           
                                  
 

/** Where install.sh --codex puts the client. Codex puts no keepup on PATH, so a Codex person is always given this path. */
export const CODEX_KEEPUP = '~/.keepup/client/current/bin/keepup';

export const NO_KEY = `keepup: no account key is set. In Claude Code: /plugin configure keepup@colvra, then restart Claude Code. In Codex: run ${CODEX_KEEPUP} login in your own terminal.`;

/** A build made with no --api: everything that needs our server says this, in one sentence, and waits (exit 3). */
export const NO_SERVER = 'this build of keepup has no server yet, so there is no account to log in to and no dashboard to connect to.';

/** True in a client that can talk to our server at all. Without a server, nothing here makes a network call. */
export function hasServer()          {
  return Boolean(clientConfig()?.api);
}

export function remoteFor(deps            , key        )                {
  const config = clientConfig();
  if (!config) throw new ClientUsageError("This is a checkout of keepup's engine, not the installed client, so it has no server to talk to.");
  if (!config.api) throw new WaitingError(NO_SERVER);
  return { fetch: deps.fetch, now: deps.now, home: keepupHome(deps.env), config: { api: config.api, keys: config.keys }, key };
}

/** Every command that talks to our server starts here, so a checkout of the engine refuses before it touches KEEPUP_HOME. */
export function requireClient(command        )       {
  if (storeMode() !== 'client') throw new ClientUsageError(`keepup ${command} talks to keepup's server, and this is a checkout of the engine, which never does.`);
}

export function keyOrWait(deps            )              {
  const credentials = readCredentials(keepupHome(deps.env), deps.env);
  if (!credentials) throw new WaitingError(NO_KEY.replace(/^keepup: /, ''));
  return credentials;
}

                                                                                             

                        
                                
                      
                               
                                         
                                       
                           
                            
                           
 

function writeServed(dir        , record              )       {
  writeFileSync(join(dir, SERVED_FILE), `${JSON.stringify(record, null, 1)}\n`);
}

function servedStatus(status                         )               {
  return status === 'ok' || status === 'inactive' || status === 'unknown_key' ? status : 'unreachable';
}

                                
                                                                                                                       
                                                               
                       
                               
 

/**
 * Before the scan: forget the last run's levers, check the key, and fetch the day's pack when the cached one is more
 * than 20 hours old. A pack that can't be fetched is fine; a key the server refuses is not, and waits on the person.
 * With no key, or no server in this build, nothing is fetched: the run reads the pack it already holds, and goes on.
 */
export async function prepareStart(dir        , flags                               , deps            , warn                        )                                {
  if (storeMode() !== 'client') return null;
  rmSync(join(dir, SERVED_FILE), { force: true });
  useRun(dir);
  if (flags.offline) return { mode: 'offline', dir };
  const home = keepupHome(deps.env);
  const credentials = readCredentials(home, deps.env);
  if (!credentials || !hasServer()) {
    warnIfOld(warn);
    return { mode: 'no_account', dir };
  }
  const ctx = remoteFor(deps, credentials.key);
  if (packIsStale(home, deps.now())) {
    const refreshed = await refreshPack(ctx);
    if (refreshed.status === 'unknown_key' || refreshed.status === 'inactive') throw new WaitingError(refreshed.message);
    if (refreshed.status !== 'ok' && refreshed.status !== 'not_modified') warn(`keepup: the day's pack wasn't fetched (${refreshed.message}), so this uses the one already here.`);
  }
  useRun(dir);
  warnIfOld(warn);
  return { mode: 'online', dir, ctx };
}

/** From the pack this run uses, however it got here: the session-start hook usually fetched it, in the background. */
function warnIfOld(warn                        )       {
  const minimum = packInfo()?.min_client_version;
  if (minimum && newerThan(minimum, CLIENT_VERSION)) warn(`keepup: this pack asks for keepup ${minimum} or newer, and this is ${CLIENT_VERSION}. Update keepup.`);
}

/** The one line prepare prints with no account: why nothing was sent, and what the brief is instead. No setup to do. */
function noAccountLine()         {
  const why = hasServer() ? 'no account key is set' : 'this build of keepup has no server yet';
  const asOf = packInfo()?.as_of;
  return `keepup: ${why}, so nothing was sent and lever matching was skipped. The brief shows what the detection pack${asOf ? ` of ${humanDate(asOf)}` : ''} alone proves; levers need a keepup account.`;
}

function newerThan(a        , b        )          {
  const parts = (version        ) => version.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let index = 0; index < Math.max(x.length, y.length); index += 1) {
    if ((x[index] ?? 0) !== (y[index] ?? 0)) return (x[index] ?? 0) > (y[index] ?? 0);
  }
  return false;
}

/** The model ids the pack itself makes public: the retirement list and the price list. Only these are ever named to the server. */
function publicLists()                                                                                  {
  return { retired: new Set(retirements().flatMap((row) => (row.id ? [row.id] : []))), listed: new Set(modelPrices().map((row) => row.model)) };
}

const plural = (count        , one        , many = `${one}s`)         => `${count} ${count === 1 ? one : many}`;

function askedAbout(request               , facts                          )         {
  const unnamed = unnamedModels(facts, request);
  return `${plural(request.patterns.length, 'pattern id')}, ${plural(request.providers.length, 'provider name')} and ${plural(request.models.length, 'model id')}${unnamed ? ` (${plural(unnamed, 'other model id')} counted here, not named)` : ''}`;
}

function sentLine(request               , facts                          , fetched               )         {
  if (fetched.status === 'ok') {
    const held = fetched.capped || fetched.withheld ? ` · ${plural(fetched.withheld, 'more lever')} held back by this account's limits` : '';
    const refused = fetched.refused ? ` · ${plural(fetched.refused, 'lever')} refused for a failed check` : '';
    return `keepup: sent keepup's server ${askedAbout(request, facts)}; ${plural(fetched.levers.length, 'lever')} came back${held}${refused}. Every request is logged: keepup status (in Codex, ${CODEX_KEEPUP} status).`;
  }
  return `keepup: ${fetched.message}. It asked about ${askedAbout(request, facts)}; the brief shows what the pack alone proves.`;
}

                            
                                                               
                          
                         
 

/** Between the scan and the pipeline: build the fixed body, send it, and keep what verifies for this run. */
export async function prepareLevers(start               , scan                          , facts                                      , deps            )                     {
  const lists = publicLists();
  const request = leversRequest(scan, facts, lists.retired, lists.listed);
  if (start.mode === 'print') return { print: JSON.stringify(request) };
  const pack = packInfo()?.id ?? null;
  if (start.mode === 'no_account') {
    // The pack is recorded, so verify reads the one this run read. Nothing was asked for, so there is no request.
    const line = noAccountLine();
    writeServed(start.dir, { status: 'no_key', at: deps.now().toISOString(), pack, request: null, levers: [], capped: false, withheld: 0, message: line.replace(/^keepup: /, '') });
    useRun(start.dir);
    return { line };
  }
  const fetched                = start.mode === 'offline' || !start.ctx
    ? { status: 'unreachable', levers: [], capped: false, withheld: 0, refused: 0, message: 'lever matching skipped: --offline, so nothing was sent' }
    : await fetchLevers(start.ctx, request, packInfo()?.revoked ?? []);
  const status = start.mode === 'offline' ? 'offline' : servedStatus(fetched.status);
  writeServed(start.dir, { status, at: deps.now().toISOString(), pack, request: start.mode === 'offline' ? null : request, levers: fetched.levers, capped: fetched.capped, withheld: fetched.withheld, message: fetched.message });
  useRun(start.dir);
  if (status === 'unknown_key' || status === 'inactive') throw new WaitingError(fetched.message);
  return { line: start.mode === 'offline' ? 'keepup: --offline: nothing was sent, and lever matching was skipped.' : sentLine(request, facts, fetched) };
}

function readJson   (file        )           {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8'))     ) : null;
  } catch {
    return null;
  }
}

/** How many distinct patterns fired, from the scan prepare wrote. A count, never the hits. */
function patternsFired(dir        )         {
  const scan = readJson                                    (join(dir, 'scan.json'));
  return new Set((scan?.hits ?? []).map((hit) => hit.pattern).filter((id) => typeof id === 'string')).size;
}

/** What the client brief compared with, counted from the pack this run reads and the served.json prepare wrote. Undefined in a checkout. */
export function clientBriefFacts(dir        )                          {
  if (storeMode() !== 'client') return undefined;
  const pack = packInfo();
  const served = readJson                       (join(dir, SERVED_FILE));
  const recorded = served?.status ?? 'not_asked';
  // served.json says no_key for a build with no server too; the brief then says which, so neither sentence is untrue.
  const status = recorded === 'no_key' && !hasServer() ? 'no_server' : recorded;
  return {
    pack: { as_of: pack?.as_of ?? '', patterns: loadPatterns().length, retirements: retirements().length },
    served: {
      status,
      levers: Array.isArray(served?.levers) ? served.levers.length : 0,
      patterns: Array.isArray(served?.request?.patterns) ? served.request.patterns.length : 0,
      capped: served?.capped === true,
      withheld: typeof served?.withheld === 'number' ? served.withheld : 0,
    },
  };
}

                           
                                        
                                         
 

/** The summary a connected repo sends, from facts.json and what verify kept. Null when the prepared files are for another repo. */
export function summaryFor(path        , dir        , verified                 , now      ) {
  const facts = readJson                                (join(dir, 'facts.json'));
  const found = verified ?? readJson          (join(dir, 'verified.json'));
  if (!facts || !found || facts.repo !== repoName(path)) return null;
  return runSummary({ repo: facts.repo, commit: facts.commit, findings: found.findings, heldBack: found.held_back.length, patternsFired: patternsFired(dir), ranAt: now.toISOString() });
}

/** After the brief, for a connected repo only. Whatever happens, the brief already printed and the command succeeds. */
export async function afterBrief(path        , dir        , verified          , deps            )                         {
  if (storeMode() !== 'client') return null;
  try {
    const name = repoName(path);
    const repo = readConnected(keepupHome(deps.env))[name];
    if (!repo) return null;
    const summary = summaryFor(path, dir, verified, deps.now());
    if (!summary) return `keepup: nothing was sent to your dashboard: the prepared files here are for another repo. Run keepup prepare on ${name} first.`;
    const credentials = readCredentials(keepupHome(deps.env), deps.env);
    if (!credentials) return `keepup: nothing was sent to your dashboard: ${NO_KEY.replace(/^keepup: /, '')}`;
    const ctx = remoteFor(deps, credentials.key);
    const sent = await sendRun(ctx, summary);
    if (sent.status === 'not_connected') {
      // Disconnected on the dashboard: forget it here too, so this refused send is the last one with its file paths.
      const home = keepupHome(deps.env);
      writeConnected(home, Object.fromEntries(Object.entries(readConnected(home)).filter(([repo]) => repo !== name)));
      return `keepup: this run's summary was sent and refused, not stored: ${name} isn't connected on your dashboard any more, so keepup has stopped sending its runs. To send them again, connect it again.`;
    }
    if (sent.status !== 'ok') return `keepup: nothing could be sent to your dashboard: ${sent.message}`;
    // Built here from the id: neither the reply nor connected.json is signed, so no link either holds is printed.
    const link = repoDashboardLink(ctx.config.api, repo.id);
    return `keepup: sent this run's summary to your dashboard (no code: titles, labels, files and lines)${link ? `: ${link}` : '.'}`;
  } catch (error) {
    return `keepup: nothing could be sent to your dashboard: ${(error         ).message}`;
  }
}

/** A session start must never fail or wait on this, so each step stands alone and any failure is the step not happening. */
function attempt(step            )       {
  try {
    step();
  } catch {
    // Nothing to do: the next session start tries again.
  }
}

/** Claude Code hands the sensitive option to hook processes only, so the hook is where it reaches the file every command reads. */
function syncPluginKey(home        , env                   )       {
  const given = env.CLAUDE_PLUGIN_OPTION_API_KEY?.trim();
  if (!given || !ACCOUNT_KEY.test(given)) return;
  if (readCredentials(home, {})?.key !== given) writeCredentials(home, given);
}

function startRefresh(script        , env                   )       {
  // stdio ignored and the child let go: an inherited pipe would keep the session waiting on the hook.
  const child = spawn(process.execPath, [script, 'pack-refresh'], { detached: true, stdio: 'ignore', env });
  child.on('error', () => undefined);
  child.unref();
}

/** The hook's first two steps: the key from the plugin's option, then a pack refresh in the background when it's due. */
export function hookSteps(deps            , script        )       {
  attempt(() => {
    if (storeMode() !== 'client') return;
    const home = keepupHome(deps.env);
    attempt(() => syncPluginKey(home, deps.env));
    // With no key, or no server in this build, the hook calls nothing: its weekly line comes from the pack already here.
    attempt(() => {
      if (readCredentials(home, deps.env) && hasServer() && packIsStale(home, deps.now())) startRefresh(script, deps.env);
    });
  });
}

/** A build made with no --api has nothing to fetch a pack from, whether or not a key is set. */
export const NO_SERVER_PACK = 'this build of keepup has no server yet, so there is no pack to fetch.';

/** What the hook starts: the day's pack, nothing about the project. */
export async function packRefresh(deps            )                  {
  requireClient('pack-refresh');
  if (!hasServer()) throw new WaitingError(NO_SERVER_PACK);
  const credentials = keyOrWait(deps);
  const refreshed = await refreshPack(remoteFor(deps, credentials.key));
  if (refreshed.status === 'unknown_key' || refreshed.status === 'inactive') throw new WaitingError(refreshed.message);
  if (refreshed.status !== 'ok' && refreshed.status !== 'not_modified') throw new Error(`the pack wasn't refreshed: ${refreshed.message}`);
  return `keepup: ${refreshed.message}`;
}
