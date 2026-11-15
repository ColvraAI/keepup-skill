# keepup

keepup checks your AI product's code against what is new in AI and tells you the few changes worth making. Each one names a file and a line, and has a source. Your own Claude Code or Codex session judges every hit, and nothing in your code changes until you say yes.

## Install

In Claude Code:

```text
/plugin marketplace add ColvraAI/keepup-skill
/plugin install keepup@colvra
```

Restart Claude Code, then type `/keepup` in the repo you want checked.

In Codex CLI, run this in your terminal, then type `$keepup` in a Codex session in that repo:

```text
curl -fsSL https://raw.githubusercontent.com/ColvraAI/keepup-skill/main/install.sh | bash -s -- --codex
```

No account is needed for either.

## What it does with no account

keepup finds the models in your code that their provider has retired or is retiring. For each one it records the file and the line, the date it stops working, the model to move to when the provider names one, and the provider's own page that says so. The brief sums them up in one line, such as `Biggest finding: 2 models here have shut down · src/legacy.py:7`, and asks if you want the change. That is all it checks without an account.

When you say yes to a change, `/keepup:apply` (in Codex, `$keepup-apply`) makes it on a local branch and asks again before it pushes or opens a draft pull request.

## What it needs

Node 18 or later, and Claude Code or Codex CLI. Mac and Linux.

With no Node, or an older one, `/keepup` in Claude Code still runs a lighter check: it looks for the retired and retiring model ids on the list keepup ships with, and says it was the light check. The Codex install needs Node.

## What leaves your machine

With no account: nothing. keepup reads your repo on your machine and sends nothing anywhere, and its session-start hook fetches nothing. Your own Claude Code or Codex session reads parts of your code to judge each hit, the same as for anything else you ask it, under your own plan.

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

## Remove it

In Claude Code:

```text
/plugin uninstall keepup@colvra
/plugin marketplace remove colvra
```

In Codex, run the install line again with `--uninstall` after `--codex`.

`~/.keepup` keeps the cached pack, any key you set and, in Codex, your briefs and the client. `rm -rf ~/.keepup` removes all of it.

## Terms

LICENSE says what you may do with keepup.
