// Syntax checks on a copy of a changed file. Each parses the text and never executes it, and what a failure means depends
// on whether the file parsed before the change: one that already didn't can't be blamed on the change.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
                                                   

const CHECK_LIMIT_MS = 20_000;
const TSC = fileURLToPath(new URL('../node_modules/.bin/tsc', import.meta.url));
const TSC_ARGS = ['--noEmit', '--noResolve', '--noLib', '--skipLibCheck', '--jsx', 'preserve', '--allowJs', '--target', 'esnext', '--module', 'esnext', '--pretty', 'false'];
/** TS1000 to TS1199: the parser's own errors. A missing type or module says nothing about whether this parses. */
const PARSE_ERROR = /error TS1[01]\d\d:/;
const PY_COMPILE = "import sys;compile(open(sys.argv[1],encoding='utf-8').read(),sys.argv[1],'exec')";
const TOML_LOAD = "import sys,tomllib;tomllib.load(open(sys.argv[1],'rb'))";
/** tomllib came in Python 3.11; macOS still ships 3.9 as python3, so newer names are tried after it. */
const TOML_PYTHONS = ['python3', 'python3.14', 'python3.13', 'python3.12', 'python3.11'];
const PY_VERSION = "import sys;print('.'.join(map(str,sys.version_info[:3])))";

                                                                                                                                
                                                              

function cleanEnv()                    {
  return { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG };
}

function runChecker(command        , args                   , cwd        )          {
  const result = spawnSync(command, args, { cwd, env: cleanEnv(), encoding: 'utf8', timeout: CHECK_LIMIT_MS });
  if (result.error) return { ok: false, message: `${command} couldn't run`, ran: false };
  return { ok: result.status === 0, message: (result.stderr ?? '').trim().split('\n').slice(0, 6).join(' ').slice(0, 300), ran: true };
}

let tomlPythonChoice                                                      ;

/** The first Python here that can import tomllib, or why there's none. Decided once per process. */
export function tomlPython()                                           {
  if (tomlPythonChoice) return tomlPythonChoice;
  const run = (command        , code        ) => spawnSync(command, ['-I', '-c', code], { env: cleanEnv(), encoding: 'utf8', timeout: CHECK_LIMIT_MS });
  const command = TOML_PYTHONS.find((name) => run(name, 'import tomllib').status === 0);
  if (command) return (tomlPythonChoice = { command });
  return (tomlPythonChoice = { reason: `no Python 3.11 or later here to parse TOML (${python3Words(run('python3', PY_VERSION))})` });
}

/**
 * What python3's version probe says about it. "None found" is only for a python3 that isn't on the PATH: a Mac without
 * the Command Line Tools has a /usr/bin/python3 stub that exits 1, and that one is there but didn't run.
 */
export function python3Words(version                                                                                     )         {
  const code = (version.error                                     )?.code;
  if (code === 'ENOENT') return 'no python3 found';
  if (code) return `python3 here didn’t run: ${code === 'ETIMEDOUT' ? 'it timed out' : code}`;
  if (version.status === null) return 'python3 here didn’t run: it was stopped';
  if (version.status !== 0) return `python3 here didn’t run: it exited ${version.status}`;
  return version.stdout.trim() ? `python3 is ${version.stdout.trim()}` : 'python3 here didn’t say its version';
}

function checkToml(file        , name        , before        , after        , dir        )               {
  const python = tomlPython();
  if ('reason' in python) return { file, status: 'not checked', detail: python.reason };
  return checkByRunner(file, name, before, after, dir, `${python.command} tomllib`, (path) => runChecker(python.command, ['-I', '-c', TOML_LOAD, path], dir));
}

/** Node's --check on a bare .js can pass broken module syntax, so a .js is parsed as each kind by name, and passes if it parses as either. */
function nodeCheck(path        , dir        )          {
  if (!path.endsWith('.js')) return runChecker(process.execPath, ['--check', path], dir);
  const parse = (extension        ) => {
    const copy = `${path}.${extension}`;
    copyFileSync(path, copy);
    return runChecker(process.execPath, ['--check', copy], dir);
  };
  const asCommon = parse('cjs');
  if (asCommon.ok) return asCommon;
  const asModule = parse('mjs');
  return asModule.ok ? asModule : asModule.message.length < asCommon.message.length ? asModule : asCommon;
}

/** How many parse errors TypeScript's parser gives, or null when it isn't here. It has no types to load and no project to read. */
function parseErrors(path        , dir        )                                          {
  if (!existsSync(TSC)) return null;
  const result = spawnSync(TSC, [...TSC_ARGS, path], { cwd: dir, env: cleanEnv(), encoding: 'utf8', timeout: CHECK_LIMIT_MS });
  if (result.error) return null;
  const errors = (result.stdout ?? '').split('\n').filter((line) => PARSE_ERROR.test(line));
  return { count: errors.length, first: errors[0]?.replace(/^.*?error /, '') ?? '' };
}

const FLOW = /[[\]{}]/g;
const QUOTED = /"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'/g;
const BLOCK_SCALAR = /(?:^|[:\-]\s)\s*[|>][+-]?\d*\s*$/;
const STRAY_COLON = /(?:^|\s):\s+:(?:\s|$)/;

function yamlLineProblem(raw        )                {
  if (/^\s*\t/.test(raw)) return 'a tab in the indent';
  const text = raw.replace(QUOTED, '""').replace(/(?:^|\s)#.*$/, '');
  if (/["']/.test(text.replace(/\w['"]\w/g, ''))) return 'a quote that never closes';
  return STRAY_COLON.test(text) ? 'a stray colon' : null;
}

/** No parser ships with Node, so a change is held to what a YAML file can't be: brackets that don't close, a stray colon, a bad indent. */
function yamlProblem(text        )                {
  const lines = text.split('\n');
  let depth = 0;
  let blockIndent = -1;
  for (const raw of lines) {
    const indent = raw.length - raw.trimStart().length;
    if (blockIndent >= 0 && (raw.trim() === '' || indent > blockIndent)) continue;
    blockIndent = -1;
    const problem = yamlLineProblem(raw);
    if (problem) return problem;
    const code = raw.replace(QUOTED, '""').replace(/(?:^|\s)#.*$/, '');
    if (BLOCK_SCALAR.test(code)) blockIndent = indent;
    for (const [mark] of code.matchAll(FLOW)) depth += mark === '[' || mark === '{' ? 1 : -1;
    if (depth < 0) return 'a closing bracket with nothing to close';
  }
  return depth > 0 ? 'a bracket that never closes' : null;
}

const copyInto = (dir        , name        , label        , text        )         => {
  const path = join(dir, `${label}-${name}`);
  writeFileSync(path, text);
  return path;
};

function checkWithTsc(file        , name        , before        , after        , dir        )               {
  const now = parseErrors(copyInto(dir, name, 'after', after), dir);
  const was = parseErrors(copyInto(dir, name, 'before', before), dir);
  if (!now || !was) return { file, status: 'not checked', detail: 'the TypeScript parser isn’t installed here' };
  if (now.count > was.count) return { file, status: 'failed', detail: now.first };
  return now.count === 0 ? { file, status: 'ok', detail: 'TypeScript parser' } : { file, status: 'not checked', detail: 'the TypeScript parser can’t read this file even before the change' };
}

function checkByRunner(file        , name        , before        , after        , dir        , tool        , check                           )               {
  const now = check(copyInto(dir, name, 'after', after));
  if (now.ok) return { file, status: 'ok', detail: tool };
  if (!now.ran || !check(copyInto(dir, name, 'before', before)).ok) return { file, status: 'not checked', detail: `${tool} can’t read this file even before the change, or isn’t here` };
  return { file, status: 'failed', detail: now.message || tool };
}

function checkJs(file        , name        , before        , after        , dir        )               {
  const direct = checkByRunner(file, name, before, after, dir, 'node --check', (path) => nodeCheck(path, dir));
  return direct.status === 'not checked' ? checkWithTsc(file, name, before, after, dir) : direct;
}

function checkJson(file        , after        )               {
  try {
    JSON.parse(after);
    return { file, status: 'ok', detail: 'JSON.parse' };
  } catch (error) {
    return { file, status: 'failed', detail: (error         ).message };
  }
}

function checkYaml(file        , before        , after        )               {
  const problem = yamlProblem(after);
  if (!problem) return { file, status: 'ok', detail: 'a basic structure check, not a full YAML parser' };
  return yamlProblem(before) ? { file, status: 'not checked', detail: 'this file trips the basic YAML check even before the change' } : { file, status: 'failed', detail: problem };
}

function syntaxOf(file        , before        , after        , dir        )               {
  const name = basename(file);
  if (/\.json$/i.test(name)) return checkJson(file, after);
  if (/\.ya?ml$/i.test(name)) return checkYaml(file, before, after);
  if (/\.[cm]?js$/i.test(name)) return checkJs(file, name, before, after, dir);
  if (/\.(?:[cm]?ts|[jt]sx)$/i.test(name)) return checkWithTsc(file, name, before, after, dir);
  if (/\.py$/i.test(name)) return checkByRunner(file, name, before, after, dir, 'python3 compile()', (path) => runChecker('python3', ['-I', '-c', PY_COMPILE, path], dir));
  if (/\.toml$/i.test(name)) return checkToml(file, name, before, after, dir);
  return { file, status: 'not checked', detail: 'no parser here for this file type' };
}

export function checkSyntax(changed                             , original                               , dir        )                 {
  mkdirSync(dir, { recursive: true });
  return [...changed].map(([file, text], index) => {
    const own = join(dir, String(index));
    mkdirSync(own, { recursive: true });
    return syntaxOf(file, original.get(file)?.text ?? '', text, own);
  });
}
