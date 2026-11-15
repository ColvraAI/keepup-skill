// The weekly check, and the session-start hook that runs it. The hook waits on nothing slow: in the installed client it
// first writes the key from the plugin's option and starts the pack refresh in the background, then runs the check in a
// child under its own deadline. It's marked only once it answered, so one killed on a busy machine tries again next
// session instead of losing the week.
import { spawnSync } from 'node:child_process';
import {                  hookSteps } from './client-cli.js';
import { storeMode } from './store.js';
import { firstSight, markShown, weeklyCheck, weeklyDue } from './weekly.js';

/** Git gets less time than the check it's in, so it's never left behind when the check is killed. */
const HOOK_GIT_MARGIN_MS = 1_000;

                               
                                                                      
                          
                         
                           
                                
 

/** `script` is the entry file (bin/keepup.ts in a checkout, bin/keepup.js in a built client), which the hook runs again as its child, within `budgetMs` unless KEEPUP_HOOK_BUDGET_MS says otherwise. */
export function commandHook(path        , options              , script        , budgetMs        , deps            , guard             = () => undefined)       {
  // The key and the pack live under keepup's home, not the data folder, so they never wait on the session guard.
  hookSteps(deps, script);
  try {
    guard();
  } catch {
    // No data folder to keep the weekly state in (or a path the session may not read): only the weekly line is skipped.
    return;
  }
  const { state } = options;
  if (state && !weeklyDue(state, path)) return;
  const first = state ? firstSight(state, path) : false;
  const args = ['check', path, '--hook-child', ...(first ? ['--first-sight'] : []), ...(options.asOf ? ['--as-of', options.asOf] : []), ...(options.commit ? ['--commit', options.commit] : [])];
  const budget = Number(process.env.KEEPUP_HOOK_BUDGET_MS) || budgetMs;
  const gitTimeout = Math.min(Number(process.env.KEEPUP_GIT_TIMEOUT_MS) || Infinity, Math.max(1000, budget - HOOK_GIT_MARGIN_MS));
  const child = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: budget, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024, env: { ...process.env, KEEPUP_GIT_TIMEOUT_MS: String(gitTimeout) } });
  if (child.status !== 0) return;
  if (child.stdout) process.stdout.write(child.stdout);
  if (state) markShown(state, path);
}

/** At most one line a week, shown to the person. A repo with no AI code in it hears nothing, and in the client only a model going away speaks. */
export async function commandHookChild(path        , options              , say                        )                {
  const result = await weeklyCheck(path, { asOf: options.asOf, commit: options.commit, firstSight: Boolean(options.firstSight) });
  const speaks = storeMode() === 'client' ? result.going_away.length > 0 : result.has_ai_code || result.stopped_early;
  if (speaks) say(JSON.stringify({ systemMessage: result.line }));
}

export async function commandCheck(path        , options              , say                        )                {
  const { state } = options;
  if (state && !weeklyDue(state, path)) return;
  const result = await weeklyCheck(path, { asOf: options.asOf, commit: options.commit, firstSight: state ? firstSight(state, path) : false });
  if (state) markShown(state, path);
  say(result.line);
}
