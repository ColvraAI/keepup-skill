// What `keepup change` and the dashboard share: reading the run, the model with its dollar cap, and the one-screen result.
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { CHANGE_MAX_USD, makeChange,                   } from './change.js';
import { createLlm, DEFAULT_LLM_CACHE, DEFAULT_MODEL, resolveApiKey } from './llm.js';
import { RUNS_DIR } from './pipeline.js';
                                          
import { REPO_ROOT } from './signals.js';

export const LIVE_SCANS = join(REPO_ROOT, 'tmp', 'live-scans');

export function loadRunFor(path        , runFile         )      {
  const file = runFile ?? join(RUNS_DIR, `${basename(path)}.json`);
  if (!existsSync(file)) throw new Error(`No run at ${file}. Run keepup first, or name one with --run <run.json>.`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'))       ;
  } catch (error) {
    throw new Error(`Can't read ${file}: ${(error         ).message}`);
  }
}

                                
                        
                                                                                               
                        
                           
                           
                         
                                                           
 

export function runChangeCommand(command               )                        {
  const llm = createLlm({ apiKey: resolveApiKey(), model: DEFAULT_MODEL, maxUsd: command.maxUsd ?? CHANGE_MAX_USD, cacheDir: DEFAULT_LLM_CACHE });
  return makeChange({ path: command.path, run: command.run, rank: command.rank, commit: command.commit, llm, base: command.base ?? LIVE_SCANS, onStep: command.onStep });
}

export function formatChange(result              )         {
  const head = [`keepup change · ${result.repo}@${result.commit.slice(0, 7)} · finding ${result.finding_rank}: ${result.title}`, `Spent $${result.usd.toFixed(4)} on ${result.model}.`];
  const where = join(LIVE_SCANS, result.id);
  if (result.refused) return [...head, `Refused: ${result.refused}`, `Nothing was committed. Record: ${where}/change.json`].join('\n');
  if (result.kind === 'steps') return [...head, 'Kind: steps. No code change, because this needs an install, an account or a project.', ...(result.steps ?? []).map((step, index) => `  ${index + 1}. ${step}`), `Record: ${where}/change.json`].join('\n');
  return [
    ...head,
    `Kind: ${result.kind}. ${result.summary}`,
    `Branch ${result.branch} at ${result.commit_sha?.slice(0, 7)}, in a temporary clone. Nothing was pushed.`,
    'Files:',
    ...result.syntax.map((item) => `  ${item.file}: ${item.status} (${item.detail})`),
    result.tests,
    `Diff and patch: ${where}/change.patch`,
  ].join('\n');
}
