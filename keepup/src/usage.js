// What `keepup --help` prints, and the error a bad command line raises. Kept apart from bin/keepup.ts so the entry file stays small.
export const USAGE = `keepup: check a product's code against everything new in AI.

  keepup scan <path> [--commit <sha>] [--out <file>]     hits for db/patterns, as JSON
  keepup facts <path> [--commit <sha>] [--out <file>]    the repo's inventory, as JSON
  keepup search '<json>' [--dir <dir>]    search the database, as JSON
  keepup show <path> <file> <line> [--radius <n>] [--commit <sha>] [--dir <dir>]
                                          a masked, numbered window of one file
  keepup verify <path> [<findings.json>] [--findings '<json>'] [--stdin] [--brief] [--host claude|codex] [--commit <sha>] [--dir <dir>]
                                          run the checks over findings someone else judged; prints what survives,
                                          or with --brief the one screen a founder reads, written from them
  keepup prepare <path> [--commit <sha>] [--dir <dir>] [--print-request] [--offline]
                                          write scan, facts, floor and bundles to the data folder in one call. In the installed client, with an
                                          account key, it first fetches the day's pack and the levers for the patterns that fired; with none it
                                          sends nothing and uses the pack it holds; --print-request prints the exact body it would send and
                                          sends nothing, --offline sends nothing and skips lever matching
  keepup bundles <path> --profile '<json>' [--dir <dir>]
                                          add a bundle per job, from a profile you wrote: its candidates, the code at its places and what's known of its
                                          libraries. Prints every citation that didn't check out. Offline
  keepup get <facts|scan|floor|findings|verified|bundles>[.field.field] [--limit <n>] [--dir <dir>]
                                          read part of a prepared file, as JSON; bundles.floor, bundles.floor_rest.<n>, bundles.patterns.<n> and bundles.jobs.<n> print one bundle, whole
  keepup levers [<pattern-id>]            the levers for a pattern, as JSON, with the pattern itself
  keepup served [--count]                 how many levers a person promoted, so may be served, then their ids; --count prints only the number
  keepup check <path> [--as-of <date>] [--commit <sha>] [--weekly-state <file>] [--hook]
                                          the weekly check, one line; with --weekly-state, at most once a week
  keepup run <path> [--commit <sha>] [--as-of <date>] [--name <name>] [--out <dir or file.json>]
             [--provider-only <provider>] [--max-usd <n>] [--no-judge] [--online] [--no-llm-cache]
             [--full] [--retired] [--publish] [--force] [--replay]
                                          the whole pipeline: writes the run file, prints a one-screen brief. --full prints all of it.
                                          It writes to ~/.keepup/runs, or the plugin's data folder; --publish writes data/runs, which the dashboard reads.
                                          --replay rebuilds a demo run from data/replay: no key, no network, no cost.
  keepup pr-body --finding <rank> [--run <run.json>] [--dir <dir>] [--summary <text>] [--tests <text>] [--limits <text>] [--out <file> | --save]
                                          the words for a draft pull request: why, found at, what changed, ROI, proof, the real test result if you give it, and --limits as what to know before merging. Offline.
                                          --save writes them to this repo's data folder, and prints body: <that file> and repo: <origin's owner/name, or none>.

  keepup issue-body [--dir <dir>] [--out <file> | --save]
                                          the weekly issue's words, from the brief keepup verify --brief wrote. Offline.
                                          --save writes them to this repo's data folder, and prints body: <that file>.

  keepup change <path> --finding <rank> [--commit <sha>] [--run <run.json>] [--max-usd <n>]
                                          write the code change for one finding: one commit on a branch in a temporary clone under tmp/live-scans.
                                          It sends masked windows to Claude, refuses anything out of bounds, never pushes and never runs the repo.

  keepup measure <path> --finding <rank> [--commit <sha>] [--run <run.json>]
                                          a real before-and-after on this repo's own literal prompt, on your key. It says what it sends first, refuses a
                                          prompt built at runtime, prints n, and stops at $0.25. No key is "not measured · needs X", with no number.

  keepup login | logout | status          the installed client's account key (from a hidden prompt or stdin, never an argument),
                                          and what it reads from, what it has connected and the last five things it sent
  keepup connect <path> [--yes]           show what a connected repo sends your dashboard after each brief; --yes connects it
  keepup disconnect <path>                stop sending, and delete what the dashboard holds for it
  keepup pr-opened --url <link> --finding <rank> [--dir <dir>]
                                          put a pull request's link on a connected repo's dashboard
  keepup pack-refresh                     fetch the day's detection pack; the session-start hook runs it in the background

In a checkout of this repo, every command but run is offline and sends nothing anywhere. With an account key, the installed client
sends keepup's server only the key, the client version, the ids of the patterns that fired, provider names and public model ids, and
a connected repo's run summary; every body is in its send log, which keepup status shows. With no account key it sends nothing. 'run' sends masked, bounded excerpts, which can
be a whole short file but never a secret, to Claude with your ANTHROPIC_API_KEY, asks npm, crates.io and PyPI about your dependencies,
and reads public model cards and release notes. With --no-judge, or with no key, it stays offline unless you add --online, and says only what the exact checks prove.
`;

/** A command line keepup can't take: exit 2, with the usage after it. */
export class UsageError extends Error {}
