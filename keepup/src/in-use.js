// Whether a repo already uses what a lever offers, from the lever's in_use_signals: a dependency a manifest declares, an
// environment variable the code reads, or a literal in the code. A repo-level sign never drops a finding. It turns "adopt"
// into "extend", so a team that already pays a vendor isn't sold that vendor again. Pure: it reads only the text it's given.
import { contextFor, pathContext } from './code-context.js';
                                                      
import {                 parseManifest } from './manifests.js';
                                                     

const KINDS                                 = ['dependency', 'env', 'text'];
const MAX_TEXT = 200;
/** What each kind's value may be, so a lever can't hand the program a pattern or a line break to look for. */
const VALUES                                                                                           = {
  dependency: { rule: /^@?[\w.-]+(?:\/[\w.-]+)*$/, words: 'a package name, such as @typesafe-ai/sdk' },
  env: { rule: /^[A-Za-z_]\w*$/, words: 'an environment variable name, such as TYPESAFE_API_KEY' },
  text: { rule: new RegExp(`^(?=.*\\S)[^\\n\\r]{1,${MAX_TEXT}}$`), words: `one line of text, at most ${MAX_TEXT} characters` },
};
/** Code that can read an environment variable. A README or a doc that names one reads nothing. */
const CODE_FILE = /\.(?:[cm]?[jt]sx?|py|rs|go|rb|java|kt|php|ex|exs|cs|swift|scala|vue|svelte)$/;
/** The example env files the file list keeps: they hold names, never values. */
const EXAMPLE_ENV = /(?:^|\/)\.env\.(?:example|sample|template|dist|defaults)$/;
const DOC_FILE = /\.(?:md|mdx|markdown|rst|adoc|txt)$/i;

function signalOf(id        , item         , index        )              {
  const at = `${id}: in_use_signals[${index}]`;
  const { kind, value } = (item && typeof item === 'object' ? item : {})                           ;
  const known = KINDS.find((name) => name === kind);
  if (!known) throw new Error(`${at}: "kind" must be one of ${KINDS.join(', ')}.`);
  if (typeof value !== 'string' || !VALUES[known].rule.test(value)) throw new Error(`${at}: "value" must be ${VALUES[known].words}.`);
  return { kind: known, value };
}

/** A lever's signals in its own order, or none. One the program can't read is refused by name, as an unreadable lever file is. */
export function inUseSignals(lever                                      )                {
  const raw          = lever.in_use_signals;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error(`${lever.id}: "in_use_signals" must be a list of {kind, value}.`);
  return raw.map((item, index) => signalOf(lever.id, item, index));
}

/** npm names are exact. PyPI folds case and runs of - _ . (PEP 503), and crates.io treats - and _ as one. */
function sameName(ecosystem           , declared        , wanted        )          {
  if (ecosystem === 'npm') return declared === wanted;
  const fold = (name        ) => name.toLowerCase().replace(ecosystem === 'pypi' ? /[-_.]+/g : /_/g, '-');
  return fold(declared) === fold(wanted);
}

                                          

function sortedFiles(files                             )           {
  return [...files.keys()].sort();
}

/** Read with the manifest parser the facts use, so a lockfile, a README or an import never counts as declared. */
function declared(name        , files                             )               {
  for (const file of sortedFiles(files)) {
    const dependency = parseManifest(file, files.get(file) ?? '')?.dependencies.find((dep) => sameName(dep.ecosystem, dep.name, name));
    if (dependency) return { file: dependency.file, line: dependency.line };
  }
  return null;
}

function envReads(name        )         {
  const quote = '["\'`]';
  return new RegExp([
    `process\\.env\\.${name}(?![\\w$])`,
    `process\\.env\\[\\s*${quote}${name}${quote}\\s*\\]`,
    `import\\.meta\\.env\\.${name}(?![\\w$])`,
    `os\\.environ\\[\\s*${quote}${name}${quote}\\s*\\]`,
    `os\\.(?:getenv|environ\\.get)\\(\\s*${quote}${name}${quote}`,
    `env::var(?:_os)?\\(\\s*"${name}"`,
    `os\\.(?:Getenv|LookupEnv)\\(\\s*"${name}"`,
    `ENV(?:\\.fetch\\(|\\[)\\s*${quote}${name}${quote}`,
  ].join('|'));
}

/** The first line of a file the test accepts, outside comments. */
function firstLine(file        , text        , test                           )               {
  const lines = text.split('\n');
  const at = contextFor(file, text);
  const index = lines.findIndex((line, i) => test(line) && !at(i + 1).commented);
  return index === -1 ? null : { file, line: index + 1 };
}

/** A read in code, or a line in an example env file. A commented-out one reads nothing. */
function envRead(name        , files                             )               {
  const reads = envReads(name);
  const declares = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`);
  for (const file of sortedFiles(files)) {
    const text = files.get(file) ?? '';
    if (!text.includes(name)) continue;
    const found = EXAMPLE_ENV.test(file) ? firstLine(file, text, (line) => declares.test(line)) : CODE_FILE.test(file) && pathContext(file) !== 'docs' ? firstLine(file, text, (line) => reads.test(line)) : null;
    if (found) return found;
  }
  return null;
}

/** The literal anywhere but a doc or a comment, in sorted order. */
function literal(value        , files                             )               {
  for (const file of sortedFiles(files)) {
    const text = files.get(file) ?? '';
    if (DOC_FILE.test(file) || pathContext(file) === 'docs' || !text.includes(value)) continue;
    const found = firstLine(file, text, (line) => line.includes(value));
    if (found) return found;
  }
  return null;
}

function placeFor(signal             , files                             )               {
  if (signal.kind === 'dependency') return declared(signal.value, files);
  return signal.kind === 'env' ? envRead(signal.value, files) : literal(signal.value, files);
}

/** The first of the lever's signals, in its order, that this repo shows, and where. */
export function inUseFor(lever                                      , files                             )               {
  for (const signal of inUseSignals(lever)) {
    const place = placeFor(signal, files);
    if (place) return { kind: signal.kind, value: signal.value, ...place };
  }
  return null;
}

/** Each finding whose lever this repo already uses carries where. A mark a model sent is never kept: only this sets one. */
export function markInUse(findings                    , files                             , levers                  )            {
  const byId = new Map(levers.map((lever) => [lever.id, lever]));
  return findings.map((finding) => {
    const { in_use: claimed, ...rest } = finding;
    const lever = finding.lever ? byId.get(finding.lever) : undefined;
    const found = lever ? inUseFor(lever, files) : null;
    if (found) return { ...rest, in_use: found };
    return claimed ? rest : finding;
  });
}
