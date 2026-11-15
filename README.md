# keepup

keepup checks your AI product's code against what is new in AI and tells you the few changes worth making, each with a file, a line and a source. It works inside your own Claude Code or Codex session, and nothing in your code changes until you say yes.

## Where it stands today

This is an early version. One part works today with no account, and the rest is not live yet.

### What it does with no account

keepup reads the AI code in your repo, on your machine, and finds the models their provider has retired or is retiring. For each one it records the file and the line, the date it stops working, the model to move to when the provider names one, and the provider's own page that says so. That is all it checks without an account.

When you say yes to a change, `/keepup:apply N` (in Codex, `$keepup-apply N`) makes it on a local branch, one commit per finding, and runs your tests if the repo has them. It asks again before it pushes or opens a draft pull request.

### What is not live yet

- The lever database: the bigger changes worth making, such as a cheaper or faster way to make a call you already make. It comes with an account.
- Accounts. keepup's site is not open yet.
- Daily data updates. The list of models and their dates ships inside keepup as a snapshot. This release's snapshot is from 10 Nov 2026, and every brief names its date on its first line, such as `pack of 10 Nov 2026`. Each new release carries a newer one. The daily job that will refresh it is built and tested, but it has not run for real yet.

## Install

In Claude Code, type these two lines:

```text
/plugin marketplace add ColvraAI/keepup-skill
/plugin install keepup@colvra
```

Restart Claude Code, then type `/keepup` in the repo you want checked. If you installed the older keepup of 3 Nov, remove it first: see "Remove an older keepup" below.

In Codex CLI, run this in your terminal, then type `$keepup` in a Codex session in that repo:

```text
curl -fsSL https://raw.githubusercontent.com/ColvraAI/keepup-skill/main/install.sh | bash -s -- --codex
```

It shows what it will change and asks before it changes anything. It puts the client in `~/.keepup/client` and adds three Codex skills: `$keepup`, `$keepup-apply` and `$keepup-connect`.

No account is needed for either.

## Your first run

Open the repo in Claude Code and type `/keepup` (in Codex, `$keepup`). keepup reads the code on your machine, your own session checks each hit, and you get a short brief. It leads with one line, then lists each finding, and asks if you want the change.

This is a real brief, trimmed, from the open-source repo mezmo/aura:

```text
Biggest finding: 2 models here have shut down and 4 more are retiring · examples/minimal/gemini.toml:14

1. Google has shut down gemini-2.0-flash
   When: gemini-2.0-flash was shut down on 1 Jun 2026.
   Where: examples/minimal/gemini.toml:14
   Do: gemini-2.0-flash to gemini-3.6-flash
   Source: https://ai.google.dev/gemini-api/docs/deprecations
   Next: /keepup:apply 1
```

Type `/keepup:apply 1` to make that change on a branch. Nothing is pushed until you say yes a second time.

## Which model it uses

None of its own. keepup works inside your Claude Code or Codex session and uses whatever model that session uses, so any model your plan includes works. It has no model setting and needs no API key.

If your tool says a model is not supported, that message comes from your tool's own model setting, not from keepup. Pick a model your plan includes in your tool's own model setting (in Claude Code that is `/model`), and run `/keepup` again.

## What it needs

- Node 18 or later, and git.
- Claude Code or Codex CLI.
- Mac or Linux. Windows is untested.

With no Node, or an older one, `/keepup` in Claude Code still runs a lighter check: it looks for the retired and retiring model ids on the list keepup ships with, and says it was the light check. The Codex install needs Node.

## What leaves your machine

With no account: nothing. keepup reads your repo on your machine and sends nothing to keepup, and its session-start hook fetches nothing. To judge each hit, your own Claude Code or Codex session reads masked excerpts of your code. Those go to your model provider under your own plan, the same as for anything else you ask it.

`keepup prepare . --print-request` prints the exact body keepup would send with an account, and sends nothing.

## What an account adds

With a keepup account, keepup also asks keepup's server for the levers that fit your code: a cheaper or faster way to make a call you already make, or something your provider shipped that fits code you already have. Accounts open with keepup's site, which is not open yet. When you have one, set your key with `/plugin configure keepup@colvra` in Claude Code, or run `~/.keepup/client/current/bin/keepup login` after the Codex install.

With an account key set, this is what is sent:

- The scan runs on your machine. Your code and prompts are never sent to keepup. File paths are never sent either, except for a repo you connect: then each finding's file and line go to your dashboard.
- Your own Claude or Codex session reads masked excerpts of your code to judge each hit. That goes to your model provider under your own plan, as before.
- keepup's server receives a short list of facts per run: your account key, the client version, the ids of the patterns that fired, the provider names found, and model ids that appear on public lists. A pattern id can show which vendor's SDK a repo uses. A fine-tuned model id is cut to its base model before it is sent, and anything not on the pack's public list is counted, never named. `keepup prepare --print-request` shows the exact body, and every request is appended to a local send log. The usage log keeps ids only, and raw IP addresses are dropped after a period the privacy page states.
- The session-start hook sends nothing about the project. It refreshes the detection pack in the background and prints the weekly line from its cache.
- A repo you connect shows on your dashboard. Connecting is the consent: from then on the client sends that repo's name, commit and date, and for each finding its lever, title, effect, proof label, file and line. Never code. A repo you haven't connected still gets levers and sends only the facts above.

The send log is `~/.keepup/state/send-log.jsonl`: one line per request, with the time, the route and the body, and never the key. `/keepup:connect` (in Codex, `$keepup-connect`) shows what connecting a repo would send before it asks. To disconnect, ask Claude to run `keepup disconnect .` in that repo, or use the button on the repo's page on your dashboard. After the button, the client still sends the next brief's summary once, because it only learns then: the server refuses it and stores nothing, and the client stops sending for that repo.

## Update

In Claude Code, run these in your terminal, then restart Claude Code:

```text
claude plugin marketplace update colvra
claude plugin update keepup@colvra
```

To get each new version as it ships instead: `/plugin`, then Marketplaces, colvra, Enable auto-update.

In Codex, run the install line again. It downloads the newest build into `~/.keepup/client` and points `~/.keepup/client/current` at it.

## Remove it

In Claude Code:

```text
/plugin uninstall keepup@colvra
/plugin marketplace remove colvra
```

In Codex, run the install line again with `--uninstall` after `--codex`:

```text
curl -fsSL https://raw.githubusercontent.com/ColvraAI/keepup-skill/main/install.sh | bash -s -- --codex --uninstall
```

`~/.keepup` keeps the cached pack, any key you set and, in Codex, your briefs and the client. `rm -rf ~/.keepup` removes all of it.

### Remove an older keepup

An older keepup, the release of 3 Nov, is also named keepup, and it answers `/keepup` in place of this one. `claude plugin list` shows it as `keepup@keepup`. Remove it before you install this one, in your terminal:

```text
claude plugin uninstall keepup@keepup
claude plugin marketplace remove keepup
```

## If something goes wrong

- **Node is missing or too old.** The install line says which Node you have. Install Node 18 or later from https://nodejs.org, or run `nvm install --lts`. Until then, `/keepup` in Claude Code does the lighter check and says so, and the Codex install stops.
- **Your tool says a model is not supported.** That comes from your tool's model setting, not from keepup. Pick a model your plan includes in your tool's own model setting.
- **The brief finds nothing.** With no account it says `The pack alone proves nothing to change here.`, and with an account `Nothing big fits this week.` Both are real answers, not failures: keepup found nothing it can prove is worth changing in this repo.
- **`/keepup` looks like an older version.** Remove the older keepup (above) and restart Claude Code.
- **Where the data is.** keepup keeps what it stores in `~/.keepup`: the data pack in `cache/`, the send log in `state/` and, in Codex, the client in `client/` and your briefs in `data/`.

## How this repo works as a plugin source

A Claude Code marketplace is a git repo with a `.claude-plugin/marketplace.json` file that lists plugins. This repo is one. Its marketplace is named `colvra` and lists one plugin, `keepup`, which lives in the `keepup/` folder. `/plugin marketplace add ColvraAI/keepup-skill` tells Claude Code to read that list, and `/plugin install keepup@colvra` installs the plugin named keepup from the marketplace named colvra.

Anyone can make a marketplace this way. keepup is not in Anthropic's own plugin directory.

`install.sh` is the installer. With `--codex` it installs for Codex; without it, it runs the same two Claude Code commands for you.

## Not yet

- With no account, keepup does not check which versions of AI libraries or SDKs you use.
- Windows is untested. Git Bash or WSL may work.
- The lever database and accounts are not live.
- The data does not refresh daily yet. Each new release carries a newer snapshot.

## Terms

LICENSE says what you may do with keepup.
