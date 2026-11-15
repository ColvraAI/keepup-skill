// Reads keepup's own .env without ever printing a value. The plugin ships without lab/, so the engine carries this itself.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './signals.js';

function parseEnvFile(text        )                         {
  const pairs = text.split(/\r?\n/).flatMap((raw)                     => {
    const line = raw.trim();
    const eq = line.indexOf('=');
    if (!line || line.startsWith('#') || eq < 1) return [];
    const value = line.slice(eq + 1).trim();
    const plain = value.match(/^(['"])(.*)\1$/)?.[2] ?? value;
    return plain === '' ? [] : [[line.slice(0, eq).trim(), plain]];
  });
  return Object.fromEntries(pairs);
}

/** The environment with .env filled in underneath it. Real env vars win. */
export function loadEnv(root         = REPO_ROOT, env                    = process.env)                                     {
  const path = join(root, '.env');
  return { ...(existsSync(path) ? parseEnvFile(readFileSync(path, 'utf8')) : {}), ...env };
}

export class NeedsKeyError extends Error {
           keys                   ;
  constructor(keys                   ) {
    super(`Needs ${keys.join(' and ')} in .env. Nothing was measured.`);
    this.name = 'NeedsKeyError';
    this.keys = keys;
  }
}
