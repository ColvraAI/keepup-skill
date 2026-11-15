// The plugin path: a model that has read repo text can run keepup, so inside a session keepup keeps to the project it was
// started in and the plugin's data folder, and what spends money waits for a person. In a checkout nothing a session runs
// uses the network. In the installed client prepare, verify --brief, connect, disconnect, pr-opened and pack-refresh talk
// to keepup's own server, only through src/remote.ts, and every body sent is in the send log. The shim says when it's a
// session, by how it was reached, so a person's own terminal and the dashboard are untouched.
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { keepupHome } from './store.js';

export class SessionRefusal extends Error {}

export function inSession(env                    = process.env)          {
  return env.KEEPUP_PLUGIN === '1';
}

/** Follows every symlink that exists yet, so a link inside an allowed folder can't lead out of it. */
function realOf(path        )         {
  const full = resolve(path);
  if (existsSync(full)) return realpathSync(full);
  const parent = dirname(full);
  return parent === full ? full : join(realOf(parent), full.slice(parent.length).replace(/^[/\\]/, ''));
}

function isInside(path        , root        )          {
  const real = realOf(path);
  const realRoot = realOf(root);
  return real === realRoot || real.startsWith(`${realRoot}${sep}`);
}

function dataRoots(env                   )           {
  const config = env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  // keepup's own home as the client finds it: KEEPUP_HOME when it is set, so a moved folder's <home>/data is a data root.
  return [...(env.CLAUDE_PLUGIN_DATA ? [env.CLAUDE_PLUGIN_DATA] : []), join(config, 'plugins', 'data'), keepupHome(env)];
}

export function projectOf(env                    = process.env)         {
  return env.CLAUDE_PROJECT_DIR ?? process.cwd();
}

                              
                           
                                          
                                                   
                               
 

const TAKES_A_PATH = new Set(['scan', 'facts', 'show', 'verify', 'prepare', 'bundles', 'check', 'run', 'measure', 'connect', 'disconnect']);

/** Throws what's refused. Outside a session it does nothing. */
export function guardSession(call             , env                    = process.env)       {
  if (!inSession(env)) return;
  if (call.command === 'run' && !call.stdinIsTty) throw new SessionRefusal('keepup run spends money and uses the network, so a person starts it, from their own terminal. Nothing ran.');
  if (call.command === 'measure' && !call.stdinIsTty) throw new SessionRefusal('keepup measure sends a prompt to a provider on your key, so a person starts it, from their own terminal. Nothing ran.');
  for (const file of call.writes) {
    if (file !== undefined && !dataRoots(env).some((root) => isInside(file, root))) throw new SessionRefusal(`In a session, keepup writes only to its data folder, and ${file} isn't in it.`);
  }
  const target = call.positionals[1];
  if (TAKES_A_PATH.has(call.command) && target !== undefined && !isInside(target, projectOf(env))) throw new SessionRefusal(`In a session, keepup reads only the project it was started in, and ${target} isn't in it.`);
  const findings = call.command === 'verify' ? call.positionals[2] : undefined;
  if (findings !== undefined && ![projectOf(env), ...dataRoots(env)].some((root) => isInside(findings, root))) throw new SessionRefusal(`In a session, keepup reads a findings file only from the project or its data folder, and ${findings} isn't in either.`);
}
