---
name: worktree-include
description: Create or update this repository's .worktreeinclude so new worktrees get the gitignored files they need to build and run.
disable-model-invocation: true
---

Create or update the `.worktreeinclude` file at the root of this repository.

Claude Code copies the files it matches into every worktree it creates with git (`--worktree`, `EnterWorktree`, subagent worktrees). It uses `.gitignore` syntax, and only files that match a pattern and are also gitignored are copied, so tracked files never need excluding. `/subagent-kit:issue` applies it to the worktrees it creates by hand too.

The goal is a worktree that builds, runs and passes its tests with no hand-copying, while carrying nothing it can regenerate.

## 1. Find the main checkout

Work at the main checkout's root, not a linked worktree: the files to copy live there. `git rev-parse --path-format=absolute --git-common-dir` gives the shared `.git`; its parent is the main checkout. If you are in a linked worktree, read files from the main checkout and say so.

## 2. List the candidates

From the main checkout root:

- `git ls-files --others --ignored --exclude-standard --directory` lists every gitignored file, with wholly ignored directories collapsed to one line.
- Read the existing `.worktreeinclude`, if any.

Handle secrets by **name only**: decide from paths, and read a file's contents only when its name alone can't tell you what it is, and then never repeat a value back.

## 3. Classify every candidate

Each line of the listing ends in exactly one bucket. The step is done when none is left unclassified.

**Include** local state the project needs and cannot regenerate:
- environment and secrets files: `.env`, `.env.local`, `.env.*.local`, `secrets.json`, `*.pfx` / `*.pem` dev certificates
- per-developer config the build or app reads: `appsettings.Development.json` and `appsettings.*.local.json`, `local.settings.json` (Azure Functions), `launchSettings.json` when ignored, `*.local.*` config, `config/local*`
- credentials for package feeds when ignored: `.npmrc`, `nuget.config`, `pip.conf`
- `.claude/settings.local.json`, so the worktree keeps this repository's local permission rules

**Leave out** anything a build, install or tool run recreates: dependency folders (`node_modules/`, `.venv/`, `packages/`), build output (`bin/`, `obj/`, `dist/`, `build/`, `target/`, `out/`, `.next/`), caches (`__pycache__/`, `.pytest_cache/`, `.turbo/`, `coverage/`), logs, editor and OS state (`.vs/`, `.idea/`, `.DS_Store`), and `.claude/worktrees/`. Leave out large data files too, and name them in the report so the user can decide.

**Ask** about the rest in one question at the end, with your guess for each.

To decide what the project actually reads, check its own setup notes: README, CONTRIBUTING, CLAUDE.md or AGENTS.md, `docker-compose` `env_file:` entries, config loaders that name a file (`dotenv`, `AddJsonFile`, `appsettings.{env}.json`), and test setup that reads a local file. A file they name is an include even when its name doesn't look like config.

## 4. Write the file

- Prefer a pattern that covers a family over a list of files: `**/appsettings.Development.json` covers every project in a solution, `.env*.local` covers each variant. A pattern that also matches tracked files is fine, since only ignored files are copied.
- For a file inside a wholly ignored directory, name the directory in the pattern (`config/local/*.json`), not `**/name`.
- Group lines under short `#` comments (`# Secrets`, `# Local app config`), one reason per group.
- Updating: keep the user's existing lines and comments. Add what is missing. For a line that now matches nothing, ask before removing it, since the file may simply not exist yet on this machine.

## 5. Check it

Dry-run what a worktree would receive. From the main checkout root, this prints every file that would be copied (untracked files matching a pattern, kept only if gitignored):

```
git ls-files --others --ignored --exclude-from=.worktreeinclude | git check-ignore --stdin
```

The check passes when every file you classified as an include is listed, and nothing from the leave-out bucket is. Fix the patterns until it does.

## 6. Report

Show the final file and, per group, the files it copies today. List what you left out on purpose and anything still waiting on the user's answer. `.worktreeinclude` is meant to be committed so the team shares it, so mention that it is ready to commit; commit only if the user asks.
