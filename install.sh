#!/usr/bin/env bash
# Installs keepup's client for a keepup account. For Claude Code it shows the two plugin commands, asks, runs them, and
# says how to set the key. With --codex it downloads the client the account's marketplace names, checks its sha256,
# unpacks it under ~/.keepup/client and writes three Codex skills from it. The site fills in the KEEPUP_MARKET line with
# the account's base address, https://<host>/m/<token>, and changes nothing else; the marketplace document is that
# address plus /marketplace.json. The dashboard's line: curl -fsSL https://<host>/m/<token>/install.sh | bash [-s -- --codex]
# Run that way, stdin is this script, so every question reads the terminal instead.
# With no address filled in, it installs the free build from the public repo instead, and no account is needed (D92):
# for Claude Code, claude plugin marketplace add ColvraAI/keepup-skill; for Codex, that repo's keepup/ folder.
# KEEPUP_SOURCE=<folder of a built client> installs that folder for Codex instead of downloading, which is how tests run it.
# Everything is in main, which runs on the last line, so a cut-off download runs nothing.
set -eu

KEEPUP_MARKET="${KEEPUP_MARKET:-__KEEPUP_MARKET__}"
# The client this installs is JavaScript, so Node 18 runs it.
MIN_MAJOR=18
PLUGIN_ID=keepup@colvra
MARKETPLACE=colvra
# The free build, which needs no account: what scripts/publish-free.sh pushes, on its main branch.
PUBLIC_REPO=ColvraAI/keepup-skill
PUBLIC_TARBALL=https://codeload.github.com/$PUBLIC_REPO/tar.gz/refs/heads/main
PUBLIC_INSTALL=https://raw.githubusercontent.com/$PUBLIC_REPO/main/install.sh

fail() {
  printf 'keepup: %s\n' "$1" >&2
  exit 1
}

node_new_enough() {
  version=$(node --version)
  numbers=${version#v}
  major=${numbers%%.*}
  [ "$major" -ge "$MIN_MAJOR" ] 2>/dev/null
}

check_node() {
  command -v node >/dev/null 2>&1 ||
    fail "Node isn't on your PATH. keepup needs Node $MIN_MAJOR or later. Install it from https://nodejs.org, or run: nvm install --lts"
  if node_new_enough; then
    return 0
  fi
  fail "you have Node $version, and keepup needs Node $MIN_MAJOR or later. Install it from https://nodejs.org, or run: nvm install --lts"
}

# The free plugin installs without Node: /keepup then does its light check, so a missing Node is a note, not a stop.
note_node() {
  if command -v node >/dev/null 2>&1 && node_new_enough; then
    return 0
  fi
  if command -v node >/dev/null 2>&1; then have="you have Node $version"; else have="Node isn't on your PATH"; fi
  printf 'Note: %s. Until you install Node %s or later (https://nodejs.org, or: nvm install --lts),\n' "$have" "$MIN_MAJOR"
  printf '/keepup does a lighter check: the retired and retiring model ids in your code, from the list it ships with.\n\n'
}

# No account address filled in: the free build from the public repo, which needs no account.
no_account() {
  case "$KEEPUP_MARKET" in
    __*__) return 0 ;;
  esac
  return 1
}

check_claude() {
  command -v claude >/dev/null 2>&1 ||
    fail "Claude Code isn't on your PATH (no 'claude' command). Install it with: npm install -g @anthropic-ai/claude-code. See https://claude.com/claude-code"
}

# The base address the site filled in, or for a try on this machine, the folder a client build wrote. The placeholder
# is matched by its shape, so it is written once in this file and the site's fill-in can't change anything else.
check_market() {
  case "$KEEPUP_MARKET" in
    '' | __*__) fail "this copy of install.sh has no marketplace address, so nothing was changed. Copy the install line from your keepup dashboard: it fills the address in." ;;
    https://*/m/*/* | https://*/m/) ;;
    https://?*/m/?*) return 0 ;;
  esac
  [ "$1" = folder-too ] && [ -f "$KEEPUP_MARKET/.claude-plugin/marketplace.json" ] ||
    fail "the marketplace address must be the https address on your dashboard, https://<host>/m/<token> with nothing after it, and this isn't: $KEEPUP_MARKET"
}

# The marketplace document: the base address plus /marketplace.json, or a local build's folder as it is.
market_document() {
  case "$KEEPUP_MARKET" in
    https://*) printf '%s/marketplace.json' "$KEEPUP_MARKET" ;;
    *) printf '%s' "$KEEPUP_MARKET" ;;
  esac
}

# Reads from the terminal, not stdin, because in curl | bash stdin is this script. It opens it once, so a second
# question reads the next answer.
tty_open=no
answered_yes() {
  if [ "$tty_open" = no ]; then
    { exec 3<"${KEEPUP_TTY:-/dev/tty}"; } 2>/dev/null ||
      fail "there's no terminal to ask on, so nothing was changed. To say yes up front, run it with --yes."
    tty_open=yes
  fi
  answer=
  if ! read -r answer <&3 && [ -z "$answer" ]; then
    fail "there's no terminal to ask on, so nothing was changed. To say yes up front, run it with --yes."
  fi
  case "$answer" in
    y | Y | yes | YES) return 0 ;;
    *) return 1 ;;
  esac
}

ask_first() {
  [ "$yes" = no ] || return 0
  printf 'Go ahead? [y/N] '
  if ! answered_yes; then
    printf 'keepup: nothing was changed.\n'
    exit 0
  fi
}

# --- Claude Code ---
claude_free() {
  check_claude
  note_node
  printf 'This will install keepup from %s. No account is needed. It runs two commands:\n\n' "https://github.com/$PUBLIC_REPO"
  printf '  claude plugin marketplace add %s\n' "$PUBLIC_REPO"
  printf '  claude plugin install %s\n\n' "$PLUGIN_ID"
  printf "They change Claude Code's settings, for your user, and touch nothing else.\n"
  printf 'To undo it later:\n\n'
  printf '  claude plugin uninstall %s\n' "$PLUGIN_ID"
  printf '  claude plugin marketplace remove %s\n\n' "$MARKETPLACE"
  ask_first

  claude plugin marketplace add "$PUBLIC_REPO"
  claude plugin install "$PLUGIN_ID"

  printf '\nDone. No account is needed: with none, keepup checks your code for retired and retiring models and sends nothing.\n'
  printf 'Restart Claude Code. Then, in the repo you want checked:\n\n'
  printf '  cd your-repo\n  claude\n\n'
  printf 'and type /keepup\n'
}

claude_main() {
  [ "$uninstall" = no ] ||
    fail "--uninstall goes with --codex. For Claude Code, run: claude plugin uninstall $PLUGIN_ID, then: claude plugin marketplace remove $MARKETPLACE"
  if no_account; then
    claude_free
    return 0
  fi
  check_market folder-too
  check_node
  check_claude

  printf 'This will run two commands:\n\n'
  printf '  claude plugin marketplace add %s\n' "$(market_document)"
  printf '  claude plugin install %s\n\n' "$PLUGIN_ID"
  printf "They change Claude Code's settings, for your user, and touch nothing else.\n"
  printf 'To undo it later:\n\n'
  printf '  claude plugin uninstall %s\n' "$PLUGIN_ID"
  printf '  claude plugin marketplace remove %s\n\n' "$MARKETPLACE"
  ask_first

  claude plugin marketplace add "$(market_document)"
  claude plugin install "$PLUGIN_ID"

  printf '\nDone. One step left: your account key. Open Claude Code and run:\n\n'
  printf '  /plugin configure %s\n\n' "$PLUGIN_ID"
  printf 'Paste the key from your dashboard, the one that starts with kup_, and restart Claude Code.\n'
  printf 'To get each new version as it ships: /plugin, then Marketplaces, %s, Enable auto-update.\n\n' "$MARKETPLACE"
  printf 'Then, in the repo you want checked:\n\n'
  printf '  cd your-repo\n  claude\n\n'
  printf 'and type /keepup\n'
}

# --- Codex CLI ---
# Codex puts no plugin bin/ on PATH and gives a skill no variable, so the skills name the shim and the data folder by
# absolute path. That's why HOME must need no quoting: the paths go into Markdown, TOML, JSON and a hook command.
MARK='# added by keepup install.sh --codex'
SKILL_MARK='<!-- made by keepup install.sh --codex -->'

codex_paths() {
  case "$HOME" in
    '' | *[!A-Za-z0-9._/-]*) fail "your home folder ($HOME) has a character keepup would have to quote in Codex's files, so nothing was changed." ;;
  esac
  keepup_home=$HOME/.keepup
  clients=$keepup_home/client
  current=$clients/current
  data=$keepup_home/data
  cache=$keepup_home/cache
  state=$keepup_home/state
  shim=$current/bin/keepup
  skills=$HOME/.agents/skills
  codex_home=${CODEX_HOME:-$HOME/.codex}
  config=$codex_home/config.toml
  hooks=$codex_home/hooks.json
  # Codex's sandbox may write only these three: session data, the pack cache (each pack is checked against its signature
  # before use) and state (connected repos, the send log). Never ~/.keepup itself, which holds the key, and never
  # ~/.keepup/client, the code the session-start hook runs: a sandboxed command that could rewrite it would run outside
  # the sandbox at the next start.
  roots="\"$data\", \"$cache\", \"$state\""
  roots_line="writable_roots = [$roots] $MARK"
  network_line="network_access = true $MARK"
  hook_command="$shim check . --weekly-state $data/weekly-check.json --hook"
}

check_codex() {
  command -v codex >/dev/null 2>&1 ||
    fail "Codex CLI isn't on your PATH (no 'codex' command). Install it with: npm install -g @openai/codex"
}

hooks_json() {
  printf '{\n  "hooks": {\n    "SessionStart": [\n      { "hooks": [{ "type": "command", "command": "%s", "timeout": 5 }] }\n    ]\n  }\n}\n' "$hook_command"
}

uninstall_hint() {
  if [ -z "${KEEPUP_SOURCE:-}" ] && no_account; then
    printf 'curl -fsSL %s | bash -s -- --codex --uninstall' "$PUBLIC_INSTALL"
    return 0
  fi
  case "$KEEPUP_MARKET" in
    https://*) printf 'curl -fsSL %s/install.sh | bash -s -- --codex --uninstall' "$KEEPUP_MARKET" ;;
    *) case "$0" in */install.sh) printf 'bash %s --codex --uninstall' "$0" ;; *) printf 'run install.sh again with --codex --uninstall' ;; esac ;;
  esac
}

# The edits and nothing else, so a test can undo them and get the source back. Codex runs no slash commands, so
# /keepup:apply becomes $keepup-apply, and the verify line says it's Codex so the brief names the Codex skills.
generate_skill() {
  if [ -f "$skills/$2/SKILL.md" ] && ! grep -qxF "$SKILL_MARK" "$skills/$2/SKILL.md"; then
    printf '\nYou already have %s, and keepup did not make it, so it was left alone. Move it away and run the install again to get keepup'"'"'s.\n' "$skills/$2/SKILL.md"
    return 0
  fi
  mkdir -p "$skills/$2"
  sed -E \
    -e '/^allowed-tools:/d' \
    -e "s/^name: .*/name: $2/" \
    -e 's#/keepup:apply#$keepup-apply#g' \
    -e 's#/keepup:connect#$keepup-connect#g' \
    -e 's#/keepup#$keepup#g' \
    -e '/^keepup verify /s/$/ --host codex/' \
    -e "s#^keepup (prepare|get|show|levers|verify|pr-body|pr-opened|issue-body|check|connect|disconnect|login|logout|status|pack-refresh)( |\$)#$shim \\1\\2#" \
    -e "s#\`keepup #\`$shim #g" \
    -e "s#[$][{]CLAUDE_PLUGIN_DATA[}]#$data#g" \
    -e "s#[$][{]CLAUDE_PLUGIN_ROOT[}]#$current#g" \
    "$1" >"$skills/$2/SKILL.md"
  printf '%s\n' "$SKILL_MARK" >>"$skills/$2/SKILL.md"
}

# One line from the marketplace document: the version, the zip's address and its sha256, or nothing if it isn't ours.
market_entry() {
  node -e 'const doc = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const entry = (Array.isArray(doc.plugins) ? doc.plugins : []).find((plugin) => plugin && plugin.name === "keepup");
if (!entry || !entry.source || entry.source.source !== "archive") process.exit(1);
process.stdout.write([entry.version, entry.source.url, entry.source.sha256].map(String).join(" "));' "$1" 2>/dev/null
}

file_sha256() {
  node -e 'process.stdout.write(require("crypto").createHash("sha256").update(require("fs").readFileSync(process.argv[1])).digest("hex"))' "$1"
}

client_version() {
  node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).version))' "$1" 2>/dev/null
}

check_version() {
  case "$1" in
    '' | *[!0-9.]* | .* | *. | *..*) fail "the client's version ($1) isn't a version like 0.2.0, so nothing was installed." ;;
  esac
}

# Downloads into $work: the marketplace document, then the zip it names, which must match the sha256 it names.
download_client() {
  check_market https-only
  command -v curl >/dev/null 2>&1 || fail "curl isn't on your PATH, and the install downloads the client with it."
  command -v unzip >/dev/null 2>&1 || fail "unzip isn't on your PATH, and the install unpacks the client with it. Install unzip and run this again."
  document=$(market_document)
  curl -fsSL --proto '=https' --proto-redir '=https' -o "$work/marketplace.json" "$document" ||
    fail "couldn't fetch $document. Check your network, and that this is the address on your dashboard."
  entry=$(market_entry "$work/marketplace.json") || fail "$document doesn't name a keepup client to download, so nothing was installed."
  release=${entry%% *}
  rest=${entry#* }
  url=${rest%% *}
  sha=$(printf '%s' "${rest#* }" | tr 'A-F' 'a-f')
  check_version "$release"
  case "$url" in https://*.zip) ;; *) fail "the marketplace names a client at $url, which isn't an https zip, so nothing was installed." ;; esac
  case "$sha" in *[!0-9a-f]*) sha= ;; esac
  [ "${#sha}" -eq 64 ] || fail "the marketplace's sha256 for the client isn't one, so nothing was installed."
  curl -fsSL --proto '=https' --proto-redir '=https' -o "$work/keepup.zip" "$url" || fail "couldn't download $url, so nothing was installed."
  actual=$(file_sha256 "$work/keepup.zip")
  [ "$actual" = "$sha" ] || fail "the download's sha256 is $actual, and your marketplace says $sha, so it was not installed. Run this again; if it happens again, tell us."
  mkdir "$work/client"
  unzip -q "$work/keepup.zip" -d "$work/client" || fail "couldn't unpack the client, so nothing was installed."
}

copy_client() {
  [ -f "$1/.claude-plugin/plugin.json" ] && [ -f "$1/keepup.client.json" ] && [ -f "$1/bin/keepup" ] ||
    fail "$1 isn't a built keepup client: it needs .claude-plugin/plugin.json, keepup.client.json and bin/keepup."
  release=$(client_version "$1/keepup.client.json") || fail "$1/keepup.client.json has no version."
  check_version "$release"
  cp -R "$1" "$work/client"
}

# The free build: the public repo's main branch as GitHub serves it, over https, whose keepup/ folder is the client.
# It is then installed the way KEEPUP_SOURCE is, so the same checks run on it.
download_public() {
  command -v curl >/dev/null 2>&1 || fail "curl isn't on your PATH, and the install downloads keepup with it."
  command -v tar >/dev/null 2>&1 || fail "tar isn't on your PATH, and the install unpacks keepup with it."
  curl -fsSL --proto '=https' --proto-redir '=https' -o "$work/keepup-skill.tar.gz" "$PUBLIC_TARBALL" ||
    fail "couldn't download $PUBLIC_TARBALL. Check your network and run this again."
  mkdir "$work/public"
  tar -xzf "$work/keepup-skill.tar.gz" -C "$work/public" || fail "couldn't unpack the download from $PUBLIC_REPO, so nothing was installed."
  set -- "$work/public"/*/keepup
  [ "$#" -eq 1 ] && [ -d "$1" ] || fail "the download from $PUBLIC_REPO has no keepup folder, so nothing was installed."
  copy_client "$1"
}

# Moves the checked client to ~/.keepup/client/<version> and points current at it. Real files only, as it was built.
place_client() {
  work=$clients/.install-$$
  rm -rf "$work"
  mkdir -p "$work"
  trap 'rm -rf "$work"' EXIT
  if [ -n "${KEEPUP_SOURCE:-}" ]; then
    copy_client "$KEEPUP_SOURCE"
  elif no_account; then
    download_public
  else
    download_client
  fi
  staged=$work/client
  [ -z "$(find "$staged" -type l)" ] || fail "the client holds a link, and keepup's client is real files only, so it was not installed."
  for part in .claude-plugin/plugin.json keepup.client.json bin/keepup skills/keepup/SKILL.md skills/apply/SKILL.md skills/connect/SKILL.md; do
    [ -f "$staged/$part" ] || fail "the client has no $part, so it was not installed."
  done
  chmod 755 "$staged/bin/keepup"
  [ -L "$current" ] || [ ! -e "$current" ] || fail "$current is a folder, not the link the install makes, so it was left alone. Move it away and run this again."
  rm -rf "$clients/$release"
  mv "$staged" "$clients/$release"
  ln -sfn "$release" "$current"
}

# keepup asks its server for levers, and Codex's sandbox has the network off unless config.toml turns it on.
ask_network() {
  network=yes
  [ "$yes" = no ] || return 0
  printf '\nkeepup asks its server for the levers that fit each repo, and Codex'"'"'s sandbox keeps the network off.\n'
  printf 'network_access = true lets every command Codex runs in that sandbox use the network, not only keepup.\n'
  printf 'Turn it on? [y/N] '
  answered_yes && return 0
  network=no
  printf '\nThe network stays off. keepup still runs in Codex, but its calls to its server are blocked: Codex may ask you to\n'
  printf 'approve each one, and otherwise a brief shows only what the detection pack proves and says lever matching was skipped.\n'
  printf 'To turn it on later, add network_access = true under [sandbox_workspace_write] in %s.\n' "$config"
}

has_table() {
  [ -f "$config" ] && grep -qE '^[[:space:]]*\[sandbox_workspace_write\]|^[[:space:]]*sandbox_workspace_write\.' "$config"
}

write_config() {
  if has_table; then
    roots_missing=no
    network_missing=no
    for root in "$data" "$cache" "$state"; do grep -qF "\"$root\"" "$config" || roots_missing=yes; done
    [ "$network" = no ] || grep -qE '^[[:space:]]*network_access[[:space:]]*=[[:space:]]*true' "$config" || network_missing=yes
    [ "$roots_missing$network_missing" = nono ] && return 0
    printf '\nYour %s already has a sandbox_workspace_write table, so it was left alone. Add this to that table:\n\n' "$config"
    [ "$roots_missing" = no ] || printf '  writable_roots = [%s]\n' "$roots"
    [ "$network_missing" = no ] || { grep -qE '^[[:space:]]*network_access[[:space:]]*=' "$config" && note='   (in place of the network_access line you have)' || note=; }
    [ "$network_missing" = no ] || printf '  network_access = true%s\n' "$note"
    return 0
  fi
  if [ -s "$config" ]; then printf '\n\n' >>"$config"; fi
  printf '[sandbox_workspace_write]\n%s\n' "$roots_line" >>"$config"
  [ "$network" = no ] || printf '%s\n' "$network_line" >>"$config"
}

write_hooks() {
  if [ -e "$hooks" ]; then
    [ "$(cat "$hooks")" = "$(hooks_json)" ] ||
      printf '\nYou already have %s, so it was left alone. For the weekly line, add a SessionStart command hook, timeout 5:\n\n  %s\n' "$hooks" "$hook_command"
    return 0
  fi
  hooks_json >"$hooks"
}

codex_install() {
  free=no
  if [ -n "${KEEPUP_SOURCE:-}" ]; then
    what="a copy of $KEEPUP_SOURCE"
  elif no_account; then
    free=yes
    what="downloaded over https from https://github.com/$PUBLIC_REPO, the free build, which needs no account"
  else
    check_market https-only
    what="downloaded from $KEEPUP_MARKET and checked against its sha256"
  fi
  printf 'This will set keepup up for Codex CLI:\n\n'
  printf '  %s/<version>: the keepup client, %s, with %s pointing at it\n' "$clients" "$what" "$current"
  printf '  %s/keepup, keepup-apply and keepup-connect: three skills made from its SKILL.md files\n' "$skills"
  printf '  %s: the folder keepup writes briefs to\n' "$data"
  printf '  %s: writable_roots = [%s], so keepup can keep its briefs, the\n' "$config" "$roots"
  if [ "$free" = yes ]; then
    printf '    cached pack and its send log there, but nothing it runs can change your key or the client, unless you have\n'
    printf '    that table already. The network stays off: with no account, keepup sends nothing\n'
  else
    printf '    cached pack and its send log there, but nothing it runs can change your key or the client, and\n'
    printf '    network_access = true, which it asks about on its own, unless you have that table already\n'
  fi
  printf '  %s: a SessionStart hook for the weekly line, unless you have that file already\n\n' "$hooks"
  printf 'To undo it later: %s\n\n' "$(uninstall_hint)"
  ask_first
  if [ "$free" = yes ]; then network=no; else ask_network; fi
  mkdir -p "$keepup_home" "$data" "$cache" "$state" "$clients" "$codex_home"
  place_client
  generate_skill "$current/skills/keepup/SKILL.md" keepup
  generate_skill "$current/skills/apply/SKILL.md" keepup-apply
  generate_skill "$current/skills/connect/SKILL.md" keepup-connect
  write_config
  write_hooks
  printf '\nDone: keepup %s. In the repo you want checked:\n\n  cd your-repo\n  codex\n\n' "$release"
  printf 'Run /hooks once to trust the weekly hook. Then type $keepup, or say "use keepup".\n'
  printf '$keepup-apply makes the change on a branch, and Codex asks before each git step.\n'
  if [ "$free" = yes ]; then
    printf '\nNo account is needed: with none, keepup checks your code for retired and retiring models and sends nothing.\n'
    return 0
  fi
  printf '$keepup-connect puts a repo'"'"'s briefs on your dashboard, after it shows what it would send.\n\n'
  printf 'Last, your account key. Run this in your terminal and paste the key from your dashboard when it asks:\n\n'
  printf '  %s login\n' "$shim"
}

# Only a SKILL.md the install made, and the folder only when nothing else is in it.
remove_skill() {
  grep -qxF "$SKILL_MARK" "$skills/$1/SKILL.md" 2>/dev/null || return 0
  rm "$skills/$1/SKILL.md"
  rmdir "$skills/$1" 2>/dev/null || true
}

# Takes out the lines write_config appended. The header goes too only when the table holds nothing else:
# TOML tables run past blank lines, so it scans on, over blanks and comments, to the next header or the end.
remove_config() {
  [ -f "$config" ] && grep -qF -- "$MARK" "$config" || return 1
  if awk -v mark="$MARK" '
    function ours(text) { return length(text) > length(mark) && substr(text, length(text) - length(mark) + 1) == mark }
    { line[NR] = $0 }
    END {
      for (i = 1; i <= NR; i++) if (ours(line[i])) { skip[i] = 1; found = 1 }
      if (!found) exit 1
      for (h = 1; h <= NR; h++) {
        if (line[h] != "[sandbox_workspace_write]" || !skip[h + 1]) continue
        j = h + 1
        while (j <= NR && (skip[j] || line[j] ~ /^[ \t]*(#.*)?$/)) j++
        if (j <= NR && line[j] !~ /^[ \t]*\[/) continue
        skip[h] = 1
        if (line[h - 1] == "") skip[h - 1] = 1
        if (line[h - 2] == "") skip[h - 2] = 1
      }
      for (i = 1; i <= NR; i++) if (!skip[i]) print line[i]
    }' "$config" >"$config.keepup"; then
    mv "$config.keepup" "$config"
  else
    rm -f "$config.keepup"
    return 1
  fi
  if [ ! -s "$config" ]; then rm -f "$config"; fi
}

remove_hooks() {
  [ -f "$hooks" ] || return 0
  [ "$(cat "$hooks")" != "$(hooks_json)" ] || { rm "$hooks"; return 0; }
  printf 'If %s has the keepup hook, take it out yourself: %s\n' "$hooks" "$hook_command"
}

codex_uninstall() {
  printf 'This will remove keepup from Codex CLI:\n\n'
  printf '  %s/keepup, keepup-apply and keepup-connect\n  %s, the client\n' "$skills" "$clients"
  printf '  the writable root, the network setting and the hook, where the install wrote them\n\n'
  printf 'It leaves %s, which holds your account key, the cached pack, the send log and your briefs.\n' "$keepup_home"
  printf 'To remove that too: rm -rf %s\n\n' "$keepup_home"
  ask_first
  remove_skill keepup
  remove_skill keepup-apply
  remove_skill keepup-connect
  rm -rf "$clients"
  if ! remove_config && [ -f "$config" ] && grep -qF "\"$data\"" "$config"; then
    printf 'Take this out of %s yourself: writable_roots = [%s]\n' "$config" "$roots"
  fi
  remove_hooks
  printf '\nDone. keepup is gone from Codex.\n'
}

codex_main() {
  codex_paths
  if [ "$uninstall" = yes ]; then codex_uninstall; return 0; fi
  check_node
  check_codex
  codex_install
}

main() {
  yes=no
  codex=no
  uninstall=no
  for arg in "$@"; do
    case "$arg" in
      --yes | -y) yes=yes ;;
      --codex) codex=yes ;;
      --uninstall) uninstall=yes ;;
      *) fail "unknown option: $arg. The options are --yes, --codex and --codex --uninstall." ;;
    esac
  done
  if [ "$codex" = yes ]; then codex_main; else claude_main; fi
}

main "$@"
