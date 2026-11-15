// The words the brief uses in the installed client (contract section 6). A customer's brief compares their code with the
// day's pack and the levers keepup's server returned for the patterns that fired, not with a database on their machine,
// so it says that, from counts the program took. Pure: brief.ts asks for these lines only when a run carries `client`.
import { humanDate } from './dates.js';

/**
 * What served.json can say about the lever request, as client-cli.ts writes it, or that this data folder has none.
 * no_server is no_key in a build with no server, where saying no key is set would be untrue when one is.
 */
                                                                                                                                

                              
                                                                                              
                                                                                                     
                                                                                                                                 
                                                                                                                                                              
 

/** The one sentence for each way lever matching can fail. The unreachable one is pinned word for word by the contract. */
export const SKIPPED                                                        = {
  unreachable: 'lever matching skipped: server unreachable',
  inactive: "lever matching skipped: this account's plan isn't active",
  unknown_key: "lever matching skipped: keepup's server doesn't know this account key",
  no_key: 'lever matching skipped: no account key is set',
  no_server: 'lever matching skipped: this build of keepup has no server to ask',
  offline: 'lever matching skipped: --offline, so nothing was sent',
  not_asked: "lever matching skipped: keepup prepare didn't ask the server for this data folder",
};

/** The last line of a brief with no account, so the person knows what an account adds, once, and isn't told to get one. */
export const LEVERS_NEED_AN_ACCOUNT = 'Levers need a keepup account. This run asked for none.';

/** No account here, or no server to have one with: lever matching never ran, so the brief is the pack's alone. */
export function noAccount(client             )          {
  return client.served.status === 'no_key' || client.served.status === 'no_server';
}

/** No lever reached this run, so what leads is a finding the pack proves, never a lever. */
export function noLeverServed(client             )          {
  return client.served.levers === 0;
}

/** The brief's closing line with no account, after everything else. */
export function accountLines(client             )           {
  return noAccount(client) ? ['', LEVERS_NEED_AN_ACCOUNT] : [];
}

const howMany = (value        , word        )         => `${value.toLocaleString('en-US')} ${word}${value === 1 ? '' : 's'}`;

export function packHeader(client             )         {
  return `pack of ${humanDate(client.pack.as_of)}`;
}

function packCounts(client             )         {
  return `${howMany(client.pack.patterns, 'pattern')}, ${howMany(client.pack.retirements, 'retirement row')}`;
}

function packWords(client             )         {
  return `the pack of ${humanDate(client.pack.as_of)} (${packCounts(client)})`;
}

function servedWords(client             )         {
  return `${howMany(client.served.levers, 'lever')} served for ${howMany(client.served.patterns, 'fired pattern')}`;
}

/** What was compared. With no levers asked about, it says so, and that what follows is the pack's own proof. */
export function clientCheckedLine(client             , reads        , notes                   , fit        )         {
  // With no account no lever was asked about, so a count of levers that fit would say nothing, and "0 fit" reads as nothing found.
  const fitWords = noAccount(client) ? '' : ` ${fit} fit.`;
  if (client.served.status !== 'ok') return `${[`Compared with ${packWords(client)}`, `${SKIPPED[client.served.status]}, so this is what the pack alone proves`, ...notes].join(' · ')}.${fitWords}`;
  return `${[`Compared with ${packWords(client)}`, servedWords(client), `${reads} read closely`, ...notes].join(' · ')}. ${fit} fit.`;
}

/** The one line a quiet client run prints. Without the levers it can't say that nothing applies. */
export function clientQuietLine(client             , reads        , notes                   )         {
  if (client.served.status !== 'ok') return [`keepup: ${packHeader(client)} (${packCounts(client)}) · ${SKIPPED[client.served.status]}`, 'the pack alone proves nothing here', ...notes].join(' · ');
  return ['keepup: nothing new applies', `${packHeader(client)} (${packCounts(client)})`, servedWords(client), `${reads} read closely`, ...notes].join(' · ');
}

/** When the server capped its answer, one line says how many levers it held back. */
export function heldByServer(client             )           {
  const { capped, withheld } = client.served;
  if (!capped && withheld === 0) return [];
  return ['', `keepup's server held back ${withheld.toLocaleString('en-US')} more matching lever${withheld === 1 ? '' : 's'}: this account's limit for one run.`];
}
