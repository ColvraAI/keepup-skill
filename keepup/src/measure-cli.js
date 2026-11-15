// What `keepup measure` and the dashboard share: read the run and the file at its commit, run the measure, save it with the run.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIVE_SCANS } from './change-cli.js';
import { modelAtCall } from './call-prompt.js';
import { readAtCommit, resolveCommit } from './change-git.js';
import { loadEnv } from './env.js';
import { listRepoFiles } from './git-files.js';
import { loadLevers } from './levers.js';
import { modelPrice } from './llm.js';
import { maskText, maskValue } from './mask.js';
import { measureFinding,                   } from './measure.js';
                                                       

const CHEAPER_TIER = ['claude-haiku-5-5', 'claude-haiku-4-5', 'claude-sonnet-5-5'];

function claudePrice(model        )                      {
  try { return modelPrice(model); } catch { return null; }
}

                                 
                        
                                                          
                        
                           
                                                           
                         
 

export async function runMeasureCommand(command                )                       {
  const finding = command.run.findings.find((item) => item.rank === command.rank);
  if (!finding) throw new Error(`No finding ranked ${command.rank} in this run.`);
  const commit = resolveCommit(command.path, command.commit ?? command.run.commit ?? undefined);
  const file = finding.where[0]?.file;
  if (!file) throw new Error('This finding has no place in the code to read a prompt from.');
  const text = readAtCommit(command.path, commit, file).text;
  const lever = loadLevers().find((item) => item.id === finding.lever) ?? null;
  const others = new Map(listRepoFiles(command.path, { commit }).files.map((item) => [item.path, maskText(item.text)]));
  const own = modelAtCall(maskText(text), finding.where[0].line, others);
  const current = own && claudePrice(own) ? own : null;
  const cheaper = current ? CHEAPER_TIER.find((model) => model !== current && (claudePrice(model)?.input ?? Infinity) < (claudePrice(current)?.input ?? 0)) ?? null : null;
  const result = await measureFinding({
    repo: command.run.repo, commit, finding, lever, text, file, env: loadEnv(), others,
    priceOf: claudePrice, models: { current, own, cheaper }, onStep: command.onStep,
  });
  const dir = join(command.base ?? LIVE_SCANS, result.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'measure.json'), `${JSON.stringify(maskValue(result), null, 1)}\n`);
  return maskValue(result);
}

/** Additive: the run with this result added, newest last. */
export function runWithMeasurement                                                              (run   , result             )    {
  return { ...run, measurements: [...(run.measurements ?? []), result] };
}
