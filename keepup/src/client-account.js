// The account side of the installed client: setting the key, saying what state the client is in, and connecting a repo
// to the dashboard. Connecting is the consent, so without --yes it only shows what would be sent. The key is read from
// a hidden prompt or stdin, never from the command line, and nothing here ever prints it.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { credentialsFile, readConnected, readCredentials, readSendLog, removeCredentials, REPO_NAME,                    writeConnected, writeCredentials } from './client-files.js';
import { ClientUsageError, hasServer, keyOrWait, NO_SERVER, remoteFor, requireClient, summaryFor,                                 WaitingError } from './client-cli.js';
import { repoName } from './git-files.js';
import { connectRepo, disconnectRepo, repoDashboardLink, reportPr } from './remote.js';
import { summaryFinding } from './run-summary.js';
import { dataDir } from './session.js';
import { clientConfig, keepupHome, packInfo, readCurrentPack, storeMode } from './store.js';
import { CLIENT_VERSION } from './version.js';

/** The key, typed where nobody sees it, or piped in. */
export async function readKey(input                   , output                    )                  {
  if (!input.isTTY) {
    const chunks           = [];
    for await (const chunk of input) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0].trim();
  }
  output.write('Account key (it starts with kup_; nothing shows as you type): ');
  input.setRawMode(true);
  input.setEncoding('utf8');
  input.resume();
  return new Promise((resolve, reject) => {
    const typed           = [];
    const finish = () => {
      input.setRawMode(false);
      input.pause();
      input.off('data', onData);
      output.write('\n');
    };
    const onData = (chunk        ) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return (finish(), resolve(typed.join('').trim()));
        if (char === '\u0003') return (finish(), reject(new Error('Stopped. No key was saved.')));
        if (char === '\u007f' || char === '\b') typed.pop();
        else typed.push(char);
      }
    };
    input.on('data', onData);
  });
}

/** A build with no server has no account to log in to and no dashboard: it says so before it asks for anything. */
function refuseWithoutServer()       {
  if (storeMode() === 'client' && !hasServer()) throw new WaitingError(NO_SERVER);
}

export async function login(extraArguments        , deps            , input                   , output                    )                  {
  refuseWithoutServer();
  if (extraArguments > 0) throw new ClientUsageError('login reads the key from a prompt or from stdin, never from the command line, where your shell history and other programs could see it.');
  const key = await readKey(input, output);
  let file        ;
  try {
    file = writeCredentials(keepupHome(deps.env), key);
  } catch (error) {
    throw new ClientUsageError((error         ).message);
  }
  return `keepup: key saved in ${file}, readable only by you.`;
}

export function logout(deps            )         {
  const home = keepupHome(deps.env);
  const removed = removeCredentials(home);
  const still = deps.env.KEEPUP_API_KEY ? ' KEEPUP_API_KEY is still set in this shell, and keepup uses it while it is.' : '';
  return `keepup: ${removed ? `removed the key from ${credentialsFile(home)}` : 'no key was saved here'}.${still}`;
}

function sendSummary(entry              )         {
  const body = (entry.body ?? {})                           ;
  const count = (field        ) => (Array.isArray(body[field]) ? (body[field]             ).length : 0);
  if (Array.isArray(body.patterns)) return `${count('patterns')} pattern ids, ${count('providers')} provider names, ${count('models')} model ids`;
  if (Array.isArray(body.findings)) return `run of ${String(body.repo)}, ${count('findings')} findings`;
  if (typeof body.pr_url === 'string') return `pull request ${body.pr_url} on ${String(body.repo)}`;
  if (typeof body.name === 'string') return body.name;
  return 'nothing but the key and the version';
}

const BASIC_CHECK = 'The basic check works without one, from the detection pack. Levers need a keepup account.';

/** With no account here, or no server to have one with, what still works and what an account adds. Null with both. */
function accountLine(keySet         , server         )                {
  if (!server) return `account: none: this build of keepup has no server yet${keySet ? ', so the key is not used' : ''}. ${BASIC_CHECK}`;
  return keySet ? null : `account: none. ${BASIC_CHECK}`;
}

/** Where this client reads from and what it has sent. Never the key, not even part of it. */
export function status(deps            )         {
  const home = keepupHome(deps.env);
  const config = clientConfig();
  const credentials = readCredentials(home, deps.env);
  const lines = [`keepup ${CLIENT_VERSION} · ${config ? (config.api ? `installed client, talking to ${new URL(config.api).host}` : 'installed client, built with no server, so it calls none') : 'repo mode: reads db/ and data/db from this checkout and calls no server'}`];
  lines.push(`key: ${credentials ? `set, from ${credentials.source === 'env' ? 'KEEPUP_API_KEY' : credentialsFile(home)}` : 'not set'}`);
  const account = config ? accountLine(Boolean(credentials), Boolean(config.api)) : null;
  if (account) lines.push(account);
  if (config && storeMode() === 'client') {
    const pack = packInfo();
    const current = readCurrentPack(home);
    lines.push(`pack: ${pack ? `${pack.id} of ${pack.as_of}, from ${pack.source === 'cache' ? 'the cache' : 'the copy that came with keepup'}` : 'none'}${current ? ` · last checked ${current.fetched_at}` : ' · never fetched'}`);
    for (const note of pack?.notes ?? []) lines.push(`  passed over: ${note}`);
  }
  const repos = Object.entries(readConnected(home));
  lines.push(`connected repos: ${repos.length ? repos.map(([name, repo]) => `${name} (since ${repo.connected_at.slice(0, 10)})`).join(', ') : 'none'}`);
  const sends = readSendLog(home, 5);
  lines.push(sends.length ? 'last sends:' : 'last sends: none');
  for (const entry of sends) lines.push(`  ${entry.at} ${entry.route}: ${sendSummary(entry)}`);
  return lines.join('\n');
}

const WHAT_CONNECT_SENDS = 'From now on, after each brief for this repo, keepup sends your dashboard: the repo\'s name, the commit and the time, and for each finding its rank, lever id, title, effect, proof label, file and line. Never code, never a file\'s contents, never a prompt.';

function repoNameOrRefuse(path        )         {
  const name = repoName(path);
  if (!REPO_NAME.test(name)) throw new Error(`${name} has no GitHub origin, so it has no owner/repo name the dashboard can show. Nothing was sent.`);
  return name;
}

function lastVerified(dir        )                  {
  const file = join(dir, 'verified.json');
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8'))            ) : null;
  } catch {
    return null;
  }
}

/**
 * Without --yes it shows, with a real example when there is one, and sends nothing. --yes never reads --dir, and the
 * connect skill pre-approves only lines that carry --dir, so --yes with --dir, in any order, is refused: no line a
 * session may run without asking can connect.
 */
export async function connect(path        , flags                                                  , deps            )                  {
  refuseWithoutServer();
  if (flags.yes && flags.dir !== undefined) throw new ClientUsageError(`keepup connect --yes takes no --dir, so nothing was connected and nothing was sent. To connect: keepup connect ${path} --yes`);
  const name = repoNameOrRefuse(path);
  if (!flags.yes) {
    const dir = dataDir(flags.dir);
    const example = summaryFor(path, dir, lastVerified(dir), deps.now());
    return [`keepup: connecting ${name} to your dashboard.`, WHAT_CONNECT_SENDS, example ? `What the last brief would have sent:\n${JSON.stringify(example, null, 1)}` : 'Run /keepup once to see a real example here.', `Nothing was sent. To connect: keepup connect ${path} --yes`].join('\n');
  }
  requireClient('connect --yes');
  const credentials = keyOrWait(deps);
  const ctx = remoteFor(deps, credentials.key);
  const result = await connectRepo(ctx, name);
  if (result.status !== 'ok') throw new Error(`${name} was not connected: ${result.message}`);
  const url = result.id ? repoDashboardLink(ctx.config.api, result.id) : undefined;
  if (!result.id || !url) throw new Error(`keepup's server answered with no repo id keepup can read, so ${name} was not saved as connected here and nothing will be sent. Try connecting again.`);
  const home = keepupHome(deps.env);
  writeConnected(home, { ...readConnected(home), [name]: { id: result.id, url, connected_at: deps.now().toISOString() } });
  return `keepup: connected ${name}. Its runs show at ${url}`;
}

/** Stops the sending here first, so nothing more leaves even when the server can't be told. */
export async function disconnect(path        , deps            )                  {
  requireClient('disconnect');
  const name = repoNameOrRefuse(path);
  const home = keepupHome(deps.env);
  writeConnected(home, Object.fromEntries(Object.entries(readConnected(home)).filter(([repo]) => repo !== name)));
  const credentials = keyOrWait(deps);
  const result = await disconnectRepo(remoteFor(deps, credentials.key), name);
  if (result.status !== 'ok') throw new Error(`${name} sends nothing more from here, but the dashboard wasn't told, so its runs are still there: ${result.message} Run keepup disconnect again.`);
  return `keepup: disconnected ${name}, and the dashboard deleted its runs.`;
}

/** The link to a pull request the apply skill opened, for a connected repo's dashboard. */
export async function prOpened(input                                                                            , deps            )                  {
  requireClient('pr-opened');
  const rank = Number(input.finding);
  if (!input.url || !Number.isInteger(rank) || rank < 1) throw new ClientUsageError('pr-opened takes --url <pull request link> and --finding <rank>.');
  const facts = (() => {
    try {
      return JSON.parse(readFileSync(join(input.dir, 'facts.json'), 'utf8'))                     ;
    } catch {
      return null;
    }
  })();
  const findings = lastVerified(input.dir)?.findings ?? [];
  const index = findings.findIndex((item, at) => (item.rank ?? at + 1) === rank);
  if (!facts?.repo || index < 0) throw new Error(`There's no finding ${rank} in this repo's last brief. Run /keepup first.`);
  if (!readConnected(keepupHome(deps.env))[facts.repo]) return `keepup: ${facts.repo} isn't connected to your dashboard, so nothing was sent.`;
  // The lever and title exactly as the run summary sent them: the server matches a lever-less finding by its title.
  const shown = summaryFinding(findings[index], index);
  if (!shown) return `keepup: finding ${rank} is not one a run summary sends, so your dashboard has nothing to show the link with, and nothing was sent.`;
  const credentials = keyOrWait(deps);
  const result = await reportPr(remoteFor(deps, credentials.key), { repo: facts.repo, lever: shown.lever, title: shown.title, pr_url: input.url });
  if (result.status === 'bad_request') throw new ClientUsageError(result.message);
  if (result.status !== 'ok') throw new Error(`the pull request wasn't reported: ${result.message}`);
  return prReported(result.matched, input.url, rank);
}

/**
 * Only a match puts the link on the dashboard: an unmatched one is stored nowhere. A new brief renumbers findings (and
 * on the branch the change was made on, the finding is gone), so the way through is that brief's own number.
 */
function prReported(matched                     , url        , rank        )         {
  if (matched === true) return `keepup: your dashboard now shows ${url} for finding ${rank}.`;
  if (matched === false) return "keepup: sent, but your dashboard holds no run with this finding, so the link isn't shown there and wasn't kept. A finding reaches the dashboard in the summary a connected repo sends after each brief: once a brief with it has been sent, run keepup pr-opened again with the finding's number in that brief.";
  return `keepup: sent the link for finding ${rank} to keepup's server, which didn't say whether your dashboard shows it.`;
}
