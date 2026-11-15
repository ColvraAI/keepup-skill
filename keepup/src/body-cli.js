// The words for a draft pull request and for the weekly issue, from a run file or from what a session verified. Offline.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { changedFiles, originRepo } from './git-files.js';
import { maskValue } from './mask.js';
import { renderIssueBody, renderPrBody } from './pr-body.js';
                                              
import { dataDir } from './session.js';
import { inSession, projectOf, SessionRefusal } from './session-guard.js';
import { UsageError } from './usage.js';

const PR_BODY_FILE = 'pr-body.md';
const ISSUE_BODY_FILE = 'issue.md';
const REPO_NONE = 'none';

                              
                        
                        
                          
                            
                        
                            
                          
                           
 

function printOrWrite(text        , out                    , say                        )       {
  if (!out) return say(text);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${text}\n`);
  process.stderr.write(`keepup: wrote ${out}\n`);
}

function refuseOutWithSave(values             )       {
  if (values.out !== undefined && values.save) throw new UsageError('--save picks its own file in the data folder, so it takes no --out.');
}

/** In this repo's own data folder, because a shared file would let a yes waiting in one repo send another repo's words. */
function saveBody(text        , name        , values             , say                        )         {
  const file = join(dataDir(values.dir), name);
  printOrWrite(text, file, say);
  return file;
}

/** The words for a draft pull request, from a run file or from what this session verified. */
export function commandPrBody(values             , say                        )       {
  refuseOutWithSave(values);
  const rank = Number(values.finding);
  if (!Number.isInteger(rank) || rank < 1) throw new UsageError("pr-body takes --finding <rank>, a finding's number in the brief.");
  if (values.run && inSession()) throw new SessionRefusal('In a session, pr-body reads only what this session verified, so it takes no --run.');
  const dir = dataDir(values.dir);
  const read = (file        ) => {
    if (!existsSync(file)) throw new Error(`${file} isn't there yet. Run /keepup or keepup run first.`);
    return JSON.parse(readFileSync(file, 'utf8'));
  };
  const run = values.run ? read(values.run) : { ...read(join(dir, 'facts.json')), findings: read(join(dir, 'verified.json')).findings };
  const finding = run.findings.find((item         ) => item.rank === rank) ?? run.findings[rank - 1];
  if (!finding) throw new Error(`There's no finding ${rank} in that run.`);
  const project = projectOf();
  const repo = originRepo(project);
  const text = maskValue(renderPrBody({ finding, repo: values.run ? run.repo : repo ?? run.repo, commit: run.commit, summary: values.summary, files: values.run ? undefined : changedFiles(project, run.commit), tests: values.tests, limits: values.limits }));
  if (!values.save) return printOrWrite(text, values.out, say);
  say(`body: ${saveBody(text, PR_BODY_FILE, values, say)}\nrepo: ${repo ?? REPO_NONE}`);
}

/** The weekly issue's words, from the brief this session verified. */
export function commandIssueBody(values             , say                        )       {
  refuseOutWithSave(values);
  const file = join(dataDir(values.dir), 'verified.json');
  const brief = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8'))                      ).brief : undefined;
  if (!brief) throw new Error('There\'s no brief yet. Run keepup verify --brief first.');
  const text = maskValue(renderIssueBody(brief));
  if (!values.save) return printOrWrite(text, values.out, say);
  say(`body: ${saveBody(text, ISSUE_BODY_FILE, values, say)}`);
}
