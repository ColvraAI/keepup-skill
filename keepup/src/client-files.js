// What the installed client keeps under KEEPUP_HOME besides the pack cache: the account key (mode 0600, written through a
// temp file so a reader never sees half of it), the repos the person connected, and a log of every body sent to our
// server, so `keepup status` can show exactly what left this machine. The key itself is never logged or printed.
// The layout: <home>/credentials, <home>/cache/ (packs), <home>/state/ (connected.json, send-log.jsonl), <home>/data/
// (Codex session data) and <home>/client/ (the Codex install). Codex's sandbox may write only cache/, state/ and data/,
// so a command it runs can't change the key or the client code the session-start hook runs.
import { randomBytes } from 'node:crypto';
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const ACCOUNT_KEY = /^kup_[A-Za-z0-9_-]{43}$/;
export const REPO_NAME = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const STATE = 'state';
const SEND_LOG = 'send-log.jsonl';
const CREDENTIALS = 'credentials';
const CONNECTED = 'connected.json';

                              
                       
                                  
 

                               
                      
                         
                         
 

                                
                      
                       
                                
 

                                                                

function isObject(value         )                                   {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(file        )          {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/** The whole file or nothing: a temp file beside it, then a rename. Folders this makes are the person's alone. */
export function writeFileAtomic(file        , text        , mode = 0o600)       {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  try {
    writeFileSync(temp, text, { mode });
    chmodSync(temp, mode);
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

export function credentialsFile(home        )         {
  return join(home, CREDENTIALS);
}

export function sendLogFile(home        )         {
  return join(home, STATE, SEND_LOG);
}

export function connectedFile(home        )         {
  return join(home, STATE, CONNECTED);
}

/** KEEPUP_API_KEY first, then the file. Anything that isn't an account key is no key at all. */
export function readCredentials(home        , env                    = process.env)                     {
  const fromEnv = env.KEEPUP_API_KEY?.trim();
  if (fromEnv && ACCOUNT_KEY.test(fromEnv)) return { key: fromEnv, source: 'env' };
  const saved = readJson(credentialsFile(home));
  const key = isObject(saved) && typeof saved.api_key === 'string' ? saved.api_key : '';
  return ACCOUNT_KEY.test(key) ? { key, source: 'file' } : null;
}

export function writeCredentials(home        , key        )         {
  if (!ACCOUNT_KEY.test(key)) throw new Error("That isn't a keepup account key. It starts with kup_ and comes from your dashboard.");
  const file = credentialsFile(home);
  writeFileAtomic(file, `${JSON.stringify({ api_key: key })}\n`);
  return file;
}

export function removeCredentials(home        )          {
  const file = credentialsFile(home);
  if (!existsSync(file)) return false;
  rmSync(file, { force: true });
  return true;
}

export function appendSendLog(home        , entry              )       {
  const file = sendLogFile(home);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  appendFileSync(file, `${JSON.stringify({ at: entry.at, route: entry.route, body: entry.body })}\n`, { mode: 0o600 });
}

/** The last `limit` entries, oldest first. A line that doesn't read is skipped, not fatal. */
export function readSendLog(home        , limit        )                 {
  const file = sendLogFile(home);
  if (!existsSync(file)) return [];
  const entries = readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((line) => {
    const value = (() => {
      try {
        return JSON.parse(line)           ;
      } catch {
        return undefined;
      }
    })();
    return isObject(value) && typeof value.at === 'string' && typeof value.route === 'string' ? [{ at: value.at, route: value.route, body: value.body }] : [];
  });
  return entries.slice(-limit);
}

export function readConnected(home        )            {
  const value = readJson(connectedFile(home));
  const repos = isObject(value) && isObject(value.repos) ? value.repos : {};
  return Object.fromEntries(Object.entries(repos).flatMap(([name, repo]) => (REPO_NAME.test(name) && isObject(repo) && typeof repo.id === 'string' && typeof repo.url === 'string' && typeof repo.connected_at === 'string' ? [[name, { id: repo.id, url: repo.url, connected_at: repo.connected_at }]] : [])));
}

export function writeConnected(home        , repos           )       {
  writeFileAtomic(connectedFile(home), `${JSON.stringify({ repos }, null, 1)}\n`);
}
