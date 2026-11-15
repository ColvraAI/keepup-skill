#!/usr/bin/env node
// keepup's command line. stdout carries the answer; stderr carries anything else.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { droppedLine,            HOSTS, renderBrief, renderRetired, renderSummary } from '../src/brief.js';
import { bundlePart, bundlesReport, preparedAsOf, prepareBundles, runBundles, writeBundles } from '../src/bundles-cli.js';
import { formatChange, loadRunFor, runChangeCommand } from '../src/change-cli.js';
import { runMeasureCommand, runWithMeasurement } from '../src/measure-cli.js';
import { formatMeasurement } from '../src/measure.js';
import { commandIssueBody, commandPrBody } from '../src/body-cli.js';
import { claudeSeams } from '../src/claude.js';
import { connect, disconnect, login, logout, prOpened, status } from '../src/client-account.js';
import { afterBrief, clientBriefFacts,                  ClientUsageError, packRefresh, prepareLevers, prepareStart, WaitingError } from '../src/client-cli.js';
import { commandCheck, commandHook, commandHookChild } from '../src/hook-cli.js';
import { fetchedDate, query } from '../src/db.js';
import { loadEnv } from '../src/env.js';
import { buildFacts } from '../src/facts.js';
import { isServable, loadLevers, loadPatternMeta } from '../src/levers.js';
import { maskText, maskValue } from '../src/mask.js';
import { dataDir, logEvent, readLog, resetLog } from '../src/session.js';
import { repoRoot } from '../src/git-files.js';
import { createLlm, DEFAULT_LLM_CACHE, DEFAULT_MAX_USD, DEFAULT_MODEL } from '../src/llm.js';
import { RUNS_DIR, runPipeline,                              writeRun } from '../src/pipeline.js';
import { untrustedBlock } from '../src/repo-text.js';
import { scanRepo } from '../src/scan.js';
import { parseSearchQuery } from '../src/search.js';
import { guardSession, inSession, SessionRefusal } from '../src/session-guard.js';
import { REPO_ROOT } from '../src/signals.js';
import { storeMode, useRun } from '../src/store.js';
import { oneLine } from '../src/text-safety.js';
import { USAGE, UsageError } from '../src/usage.js';
import { maskedFileMap, showLines, verifyFindings,                  } from '../src/verify.js';

const EXIT_ERROR = 1;
const EXIT_USAGE = 2;
const EXIT_WAITING = 3;
/** The installed client is the free path plus served levers. These need the raw catalogue, a model key or both, which it doesn't have. */
const NOT_IN_CLIENT = new Set(['run', 'change', 'measure', 'bundles', 'search']);
const DEFAULT_RADIUS = 20;
const MAX_RADIUS = 60;
const REPLAY_DIR = join(REPO_ROOT, 'data', 'replay');
/** A session start waits for this hook, or its line never reaches the person. A repo too big for this gets silence, and the next session tries again. */
const HOOK_BUDGET_MS = 3_000;
const PREPARED = ['scan', 'facts', 'floor', 'findings', 'verified', 'bundles']         ;
const DEFAULT_GET_LIMIT = 40;

const OPTIONS = {
  commit: { type: 'string' },
  'as-of': { type: 'string' },
  online: { type: 'boolean' },
  name: { type: 'string' },
  out: { type: 'string' },
  'provider-only': { type: 'string' },
  'max-usd': { type: 'string' },
  'no-judge': { type: 'boolean' },
  'no-llm-cache': { type: 'boolean' },
  'weekly-state': { type: 'string' },
  hook: { type: 'boolean' },
  full: { type: 'boolean' },
  retired: { type: 'boolean' },
  publish: { type: 'boolean' },
  force: { type: 'boolean' },
  replay: { type: 'boolean' },
  'replay-fill': { type: 'boolean' },
  'record-replay': { type: 'boolean' },
  radius: { type: 'string' },
  dir: { type: 'string' },
  limit: { type: 'string' },
  stdin: { type: 'boolean' },
  brief: { type: 'boolean' },
  findings: { type: 'string' },
  profile: { type: 'string' },
  'first-sight': { type: 'boolean' },
  'hook-child': { type: 'boolean' },
  finding: { type: 'string' },
  summary: { type: 'string' },
  tests: { type: 'string' },
  limits: { type: 'string' },
  run: { type: 'string' },
  save: { type: 'boolean' },
  count: { type: 'boolean' },
  host: { type: 'string' },
  'print-request': { type: 'boolean' },
  offline: { type: 'boolean' },
  yes: { type: 'boolean' },
  url: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
}         ;

function parseCommandLine(argv                   ) {
  try {
    return parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true });
  } catch (error) {
    throw new UsageError((error         ).message);
  }
}

/** A run from a subfolder still covers the whole repo, and says so. */
function pathArgument(positionals                   , command        , extra = 0)         {
  if (positionals.length !== 2 + extra) throw new UsageError(`${command} takes one path${extra ? ' and more arguments, see --help' : ''}.`);
  const root = repoRoot(positionals[1]);
  if (resolve(root) !== resolve(positionals[1])) process.stderr.write(`keepup: reading the whole repo at ${root}, not just ${positionals[1]}\n`);
  return root;
}

function asOfDate(value                    )                     {
  if (value !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new UsageError('--as-of takes a date like 2026-10-31.');
  return value;
}

function print(text        )       {
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}

/** To a file when --out says so, because a shell redirect into a plugin's data folder is refused as a sensitive write. */
function printJson(value         , out         )       {
  const text = JSON.stringify(value, null, 1);
  if (!out) return print(text);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${text}\n`);
  process.stderr.write(`keepup: wrote ${out}\n`);
}

/** In a session, what came from a repo or the database reaches the model marked as data, whatever it says. Gives back what it printed, so the session log can count it. */
function printData(kind        , label        , text        )         {
  const shown = inSession() ? untrustedBlock(kind, label, text) : text;
  print(shown);
  return shown;
}

/** Prints and gives back what it printed, for the same count. */
function printed(text        )         {
  print(text);
  return text;
}

function maxUsd(value                    )         {
  if (value === undefined) return DEFAULT_MAX_USD;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new UsageError('--max-usd takes a positive number of dollars.');
  return parsed;
}

                                                            

/** The one place the real fetch is handed out: src/remote.ts is the only module that uses it on our host. */
function clientDeps()             {
  return { fetch: globalThis.fetch, now: () => new Date(), env: process.env };
}

function warn(line        )       {
  process.stderr.write(`${line}\n`);
}

function claudeFor(values        )               {
  const apiKey = values['no-judge'] ? undefined : loadEnv().ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const llm = createLlm({ apiKey, model: DEFAULT_MODEL, maxUsd: maxUsd(values['max-usd']), cacheDir: values['no-llm-cache'] ? undefined : DEFAULT_LLM_CACHE, recordDir: values['record-replay'] ? join(REPLAY_DIR, 'llm') : undefined });
  return claudeSeams({ llm, providerOnly: values['provider-only'], online: true });
}

const refuseNetwork = (() => Promise.reject(new Error('--replay never uses the network')))                           ;

/** --replay-fill is --replay that may ask Claude for what data/replay doesn't hold yet, and saves it there. Nothing else touches the network.
 * A replay judges as of the data's own date unless --as-of says otherwise, so it rebuilds the same run on any day. */
function replaySetup(values        )                                                 {
  const fill = values['replay-fill'] ? loadEnv().ANTHROPIC_API_KEY : undefined;
  if (values['replay-fill'] && !fill) throw new UsageError('--replay-fill needs ANTHROPIC_API_KEY.');
  const llm = createLlm({ apiKey: fill ?? 'replay-has-no-key', model: DEFAULT_MODEL, maxUsd: maxUsd(values['max-usd']), cacheDir: join(REPLAY_DIR, 'llm'), ...(fill ? {} : { fetchImpl: refuseNetwork, sleep: () => Promise.resolve() }) });
  const seams = claudeSeams({ llm, providerOnly: values['provider-only'], online: true, fetchImpl: refuseNetwork, cardCacheDir: join(REPLAY_DIR, 'cards'), registryCacheDir: join(REPLAY_DIR, 'registry') });
  return { seams, options: { online: true, exactIdsOnly: true, asOf: asOfDate(values['as-of']) ?? fetchedDate(), cacheDir: join(REPLAY_DIR, 'registry'), notesCacheDir: join(REPLAY_DIR, 'notes'), fetchImpl: refuseNetwork } };
}

function outFor(values        )                     {
  if (values.out && values.publish) throw new UsageError('--publish writes data/runs, so it takes no --out.');
  return values.publish ? RUNS_DIR : values.out;
}

async function commandRun(path        , values        )                {
  const replay = values.replay || values['replay-fill'] ? replaySetup(values) : null;
  const seams = replay?.seams ?? claudeFor(values);
  if (!seams && !values['no-judge']) process.stderr.write('keepup: no ANTHROPIC_API_KEY, so this run has no profile and no judge: only what the exact checks prove.\n');
  const run = await runPipeline(path, { commit: values.commit, asOf: asOfDate(values['as-of']), online: values.online ?? Boolean(seams), ...replay?.options }, seams ?? {});
  const written = writeRun(run, { name: values.name, out: outFor(values), force: values.force });
  process.stderr.write(`keepup: wrote ${written}\n`);
  for (const dropped of run.checks.dropped) process.stderr.write(`keepup: dropped ${oneLine(maskText(droppedLine(dropped)))}\n`);
  if (run.incomplete) process.stderr.write(`keepup: incomplete: ${oneLine(run.incomplete.reason)}\n`);
  if (run.usage) process.stderr.write(`keepup: spent ${run.usage.usd.toFixed(4)} on ${run.usage.model} (${run.usage.input_tokens} input, ${run.usage.output_tokens} output tokens)\n`);
  // The one screen closes on what this run's own calls cost, as they were counted: nothing is estimated.
  print(values.retired ? renderRetired(run) : values.full ? renderBrief(run) : renderSummary(run.usage ? { ...run, cost: { kind: 'api', usage: run.usage } } : run));
}

/** Only a session someone set up gets logged, so a plain CLI call leaves nothing behind. */
function sessionDir(values        )                     {
  const given = values.dir ?? process.env.CLAUDE_PLUGIN_DATA;
  return given ? dataDir(given) : undefined;
}

function commandSearch(positionals                   , values        )       {
  if (positionals.length !== 2) throw new UsageError("search takes one JSON query, such as '{\"any\":[\"rerank\"]}'.");
  let parsed;
  try {
    parsed = parseSearchQuery(positionals[1]);
  } catch (error) {
    throw new UsageError((error         ).message);
  }
  const result = query(parsed);
  const shown = printData('records', 'the database', JSON.stringify({ version: 1, ...result }, null, 1));
  logEvent(sessionDir(values), 'search', positionals[1], { chars: shown.length });
}

function commandShow(positionals                   , values        )       {
  const path = pathArgument(positionals, 'show', 2);
  const line = Number(positionals[3]);
  const radius = values.radius === undefined ? DEFAULT_RADIUS : Number(values.radius);
  if (!Number.isInteger(line) || line < 1) throw new UsageError('show takes a line number.');
  if (!Number.isInteger(radius) || radius < 0 || radius > MAX_RADIUS) throw new UsageError(`--radius takes a number from 0 to ${MAX_RADIUS}.`);
  const text = showLines(maskedFileMap(path, values.commit), positionals[2], line, radius);
  if (text === null) throw new Error(`${positionals[2]} isn't a file keepup reads in this repo.`);
  const shown = printData('code', positionals[2], text);
  logEvent(sessionDir(values), 'read', `${positionals[2]}:${line}`, { chars: shown.length });
}

/** An argument, because a heredoc is refused in a headless session and a model can't write a file to the data folder. The argument sits in single quotes, and a JSON escape can be undone on its way there, so an apostrophe travels as &apos;. */
function verifyInput(positionals                   , values        , dir                    )              {
  if (values.findings !== undefined && (values.stdin || positionals[2] !== undefined)) throw new UsageError('verify takes its findings one way: a file, --stdin or --findings.');
  const from = values.stdin ? 0 : positionals[2];
  if (from === undefined && values.findings === undefined) throw new UsageError("verify takes a findings file, --stdin or --findings '<json>'.");
  try {
    const text = values.findings?.replaceAll('&apos;', "'") ?? readFileSync(from                   , 'utf8');
    const input = JSON.parse(text)               ;
    if ((values.stdin || values.findings !== undefined) && dir) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'findings.json'), text);
    }
    return input;
  } catch (error) {
    throw new Error(`Can't read ${values.stdin || values.findings !== undefined ? 'the findings' : from}: ${(error         ).message}`);
  }
}

/** Which session the brief is printed into, named by the skill that runs it: the engine can't tell Codex from Claude Code by itself. */
function hostOf(value                    )                   {
  if (value === undefined) return undefined;
  const host = HOSTS.find((name) => name === value);
  if (!host) throw new UsageError(`--host takes ${HOSTS.join(' or ')}.`);
  return host;
}

async function commandVerify(positionals                   , values        )                {
  const extra = values.stdin || values.findings !== undefined ? 0 : positionals.length === 3 ? 1 : 0;
  const path = pathArgument(positionals, 'verify', extra);
  const host = hostOf(values.host);
  const dir = sessionDir(values);
  const input = verifyInput(positionals, values, dir);
  const log = values.brief ? readLog(dir ?? dataDir()) : undefined;
  if (storeMode() === 'client') useRun(dataDir(values.dir));
  const client = values.brief ? clientBriefFacts(dataDir(values.dir)) : undefined;
  // The day prepare judged, so a session that crosses a UTC midnight judges one day; today only when prepare never ran here.
  const asOf = preparedAsOf(dataDir(values.dir), path);
  const output = await verifyFindings(path, input, { commit: values.commit, asOf, log, host, ...(client ? { client } : {}) });
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'verified.json'), `${JSON.stringify(output, null, 1)}\n`);
  }
  if (!values.brief) return printJson(output, values.out);
  print(output.brief ?? '');
  const sent = await afterBrief(path, dataDir(values.dir), output, clientDeps());
  if (sent) print(sent);
}

/** The deterministic files in one approved call, so the skill needs no mkdir, no loop and no shell. */
async function commandPrepare(path        , values        )                {
  const deps = clientDeps();
  if (values['print-request']) {
    const shown = await prepareLevers({ mode: 'print', dir: '' }, scanRepo(path, { commit: values.commit }), buildFacts(path, { commit: values.commit }), deps);
    return print(shown.print ?? '');
  }
  const dir = dataDir(values.dir);
  resetLog(dir);
  const client = await prepareStart(dir, { offline: Boolean(values.offline) }, deps, warn);
  const scan = scanRepo(path, { commit: values.commit });
  const facts = buildFacts(path, { commit: values.commit });
  const levers = client ? await prepareLevers(client, scan, facts, deps) : {};
  const floor = await runPipeline(path, { commit: values.commit, online: false }, {});
  writeFileSync(join(dir, 'scan.json'), `${JSON.stringify(scan, null, 1)}\n`);
  writeFileSync(join(dir, 'facts.json'), `${JSON.stringify(facts, null, 1)}\n`);
  writeRun(floor, { out: join(dir, 'floor.json'), force: true });
  const bundles = prepareBundles(path, floor, values.commit);
  writeBundles(dir, bundles);
  const shown = printed([
    `keepup: prepared ${facts.repo} in ${dir}`,
    `${facts.checked.files} files, ${facts.ai_call_sites.length} AI call sites, ${facts.model_ids.length} model ids, ${scan.hits.length} pattern hits, ${floor.findings.length} exact findings, ${bundles.patterns.length} pattern bundles.`,
    `Read them with: keepup get facts.ai_call_sites, keepup get bundles.prefix, keepup get bundles.rules`,
    ...(levers.line ? [levers.line] : []),
  ].join('\n'));
  // The start of the session's count: the cost line adds up what keepup printed from here, and the minutes since.
  logEvent(dir, 'prepare', 'keepup prepare', { chars: shown.length });
  // The client has no keepup bundles step, so prepare records how many pattern bundles there are to read: coverage is all of them.
  if (client) logEvent(dir, 'bundles', 'keepup prepare', { jobs: 0, job_total: 0, patterns: bundles.patterns.length, candidates: 0 });
}

/** An argument for the same reason verify's findings are, and an apostrophe travels the same way. */
async function commandBundles(path        , values        )                {
  if (values.profile === undefined) throw new UsageError("bundles takes --profile '<json>'.");
  if (values.commit !== undefined) throw new UsageError('bundles reads the commit keepup prepare read, so it takes no --commit.');
  const result = await runBundles({ path, text: values.profile, dir: dataDir(values.dir) });
  const shown = printed(bundlesReport(result));
  logEvent(dataDir(values.dir), 'print', 'keepup bundles', { chars: shown.length });
  if (result.jobs.length === 0) process.exitCode = EXIT_ERROR;
}

/** Each place in a list has one spelling. The session log counts bundles by the path read, so 0 and 00 mustn't both reach the first one. */
function readField(value         , field        )          {
  if (Array.isArray(value) && /^(?:0|[1-9]\d*)$/.test(field)) return value[Number(field)];
  return value && typeof value === 'object' && Object.hasOwn(value, field) ? (value                           )[field] : undefined;
}

/** Part of a prepared file, by name. It takes no path, so it can't be pointed at anything else. */
function commandGet(positionals                   , values        )       {
  const [name, ...fields] = (positionals[1] ?? '').split('.');
  if (positionals.length !== 2 || !(PREPARED                     ).includes(name)) throw new UsageError(`get takes ${PREPARED.join(', ')}, then any fields, as in facts.ai_call_sites.`);
  const path = join(dataDir(values.dir), `${name}.json`);
  if (!existsSync(path)) throw new Error(`${name}.json isn't there yet. Run keepup prepare first.`);
  const value = fields.reduce         (readField, JSON.parse(readFileSync(path, 'utf8')));
  if (value === undefined) throw new Error(`${positionals[1]} isn't in ${name}.json.`);
  const part = name === 'bundles' ? bundlePart(fields, value) : null;
  if (part) {
    const shown = part.fence ? printData('prepared', positionals[1], part.text) : printed(part.text);
    // A read is what coverage counts, as it always has; anything else printed is counted only for the cost line.
    logEvent(sessionDir(values), part.read ? 'read' : 'print', positionals[1], { ...part.read, chars: shown.length });
    return;
  }
  const limit = values.limit === undefined ? DEFAULT_GET_LIMIT : Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1) throw new UsageError('--limit takes a positive number.');
  if (Array.isArray(value) && value.length > limit) process.stderr.write(`keepup: showing ${limit} of ${value.length}. --limit shows more.\n`);
  const shown = printData('prepared', positionals[1], JSON.stringify(maskValue(Array.isArray(value) ? value.slice(0, limit) : value), null, 1));
  logEvent(sessionDir(values), 'print', positionals[1], { chars: shown.length });
}

async function commandChange(path        , values        )                {
  const rank = Number(values.finding);
  if (!Number.isInteger(rank) || rank < 1) throw new UsageError('change takes --finding <rank>, a finding\'s number in the run.');
  const run = loadRunFor(path, values.run);
  const result = await runChangeCommand({ path, run, rank, commit: values.commit, maxUsd: values['max-usd'] === undefined ? undefined : maxUsd(values['max-usd']), onStep: (name, detail) => process.stderr.write(`keepup: ${name}: ${detail}\n`) });
  print(formatChange(result));
}

async function commandMeasure(path        , values        )                {
  const rank = Number(values.finding);
  if (!Number.isInteger(rank) || rank < 1) throw new UsageError('measure takes --finding <rank>, a finding\'s number in the run.');
  const file = values.run ?? join(RUNS_DIR, `${basename(path)}.json`);
  const run = loadRunFor(path, values.run);
  const result = await runMeasureCommand({ path, run, rank, commit: values.commit, onStep: (name, detail) => process.stderr.write(`keepup: ${name}: ${detail}\n`) });
  writeFileSync(file, `${JSON.stringify(runWithMeasurement(run, result), null, 1)}\n`);
  process.stderr.write(`keepup: saved with the run in ${file}\n`);
  print(formatMeasurement(result));
}

function commandLevers(positionals                   , values        )       {
  if (storeMode() === 'client') useRun(dataDir(values.dir));
  const id = positionals[1];
  const patterns = loadPatternMeta();
  if (id && !patterns.some((pattern) => pattern.id === id)) throw new UsageError(`No pattern ${id}. Patterns: ${patterns.map((pattern) => pattern.id).join(', ')}`);
  const shown = printData('levers', id ?? 'all patterns', JSON.stringify({ version: 1, patterns: id ? patterns.filter((pattern) => pattern.id === id) : patterns, levers: loadLevers().filter((lever) => !id || lever.pattern === id) }, null, 1));
  logEvent(sessionDir(values), 'print', `levers ${id ?? ''}`.trim(), { chars: shown.length });
}

/** Only a lever a person promoted reaches a customer, so this is the number publish would send. */
function commandServed(positionals                   , values        )       {
  if (positionals.length !== 1) throw new UsageError('served takes no path: it reads db/levers.');
  const served = loadLevers().filter(isServable);
  print(values.count ? String(served.length) : [String(served.length), ...served.map((lever) => lever.id)].join('\n'));
}

async function main(argv                   )                {
  const { values, positionals } = parseCommandLine(argv);
  const command = positionals[0];
  if (values.help || !command) {
    print(USAGE);
    if (!command && !values.help) process.exitCode = EXIT_USAGE;
    return;
  }
  const guard = () => guardSession({ command, positionals, writes: [values.out, values.dir, values['weekly-state']], stdinIsTty: Boolean(process.stdin.isTTY) });
  // The session-start hook writes the key and starts the pack refresh whatever the guard says; the guard holds back only its weekly line.
  const hook = command === 'check' && Boolean(values.hook);
  if (!hook) guard();
  if (NOT_IN_CLIENT.has(command) && storeMode() === 'client') throw new UsageError(`keepup ${command} is not part of this client.`);
  const client = await clientCommand(command, positionals, values);
  if (client !== null) return print(client);
  if (command === 'scan') return printJson(scanRepo(pathArgument(positionals, command), { commit: values.commit }), values.out);
  if (command === 'facts') return printJson(buildFacts(pathArgument(positionals, command), { commit: values.commit }), values.out);
  if (command === 'search') return commandSearch(positionals, values);
  if (command === 'show') return commandShow(positionals, values);
  if (command === 'verify') return commandVerify(positionals, values);
  if (command === 'prepare') return commandPrepare(pathArgument(positionals, command), values);
  if (command === 'bundles') return commandBundles(pathArgument(positionals, command), values);
  if (command === 'get') return commandGet(positionals, values);
  if (command === 'levers') return commandLevers(positionals, values);
  if (command === 'served') return commandServed(positionals, values);
  if (command === 'check') {
    const check = { state: values['weekly-state'], asOf: values['as-of'], commit: values.commit };
    if (values.hook) return commandHook(positionals[1] ?? '', check, fileURLToPath(import.meta.url), HOOK_BUDGET_MS, clientDeps(), guard);
    if (values['hook-child']) return commandHookChild(positionals[1] ?? '', { ...check, asOf: asOfDate(values['as-of']), firstSight: Boolean(values['first-sight']) }, print);
    return commandCheck(pathArgument(positionals, command), { ...check, asOf: asOfDate(values['as-of']) }, print);
  }
  if (command === 'run') return commandRun(pathArgument(positionals, command), values);
  if (command === 'change') return commandChange(pathArgument(positionals, command), values);
  if (command === 'pr-body') return commandPrBody(values, print);
  if (command === 'issue-body') return commandIssueBody(values, print);
  if (command === 'measure') return commandMeasure(pathArgument(positionals, command), values);
  throw new UsageError(`Unknown command: ${command}`);
}

/** The client's own commands, or null for one of the engine's. */
async function clientCommand(command        , positionals                   , values        )                         {
  const deps = clientDeps();
  if (command === 'login') return login(positionals.length - 1, deps, process.stdin, process.stderr);
  if (command === 'logout') return logout(deps);
  if (command === 'status') return status(deps);
  if (command === 'connect') return connect(pathArgument(positionals, command), { dir: values.dir, yes: Boolean(values.yes) }, deps);
  if (command === 'disconnect') return disconnect(pathArgument(positionals, command), deps);
  if (command === 'pr-opened') return prOpened({ url: values.url, finding: values.finding, dir: dataDir(values.dir) }, deps);
  if (command === 'pack-refresh') return packRefresh(deps);
  return null;
}

main(process.argv.slice(2)).catch((error       ) => {
  // The weekly line is a courtesy: whatever went wrong, the session starting doesn't hear about it.
  if (process.argv.includes('--hook')) return;
  const isUsage = error instanceof UsageError;
  process.stderr.write(`keepup: ${error.message.replace(/^keepup: /, '')}\n`);
  if (isUsage) process.stderr.write(`\n${USAGE}`);
  process.exitCode = error instanceof WaitingError ? EXIT_WAITING : isUsage || error instanceof SessionRefusal || error instanceof ClientUsageError ? EXIT_USAGE : EXIT_ERROR;
});
