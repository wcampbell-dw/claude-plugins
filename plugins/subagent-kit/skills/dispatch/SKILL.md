---
name: dispatch
description: Start background Claude Code sessions that each run /subagent-kit:issue, for the issues /next would recommend or the ones I name. Several issues run at once, one session each.
disable-model-invocation: true
argument-hint: "[--max <n>] | <issue> | <issue>,<issue>..."
---

Arguments: `$ARGUMENTS`

Start one background Claude Code session per piece of work, each running `/subagent-kit:issue`. This skill only picks and starts sessions. It never edits an issue, label or PR, and never builds anything itself: the sessions do that.

Typing this command is my explicit request to start the sessions. With no issue numbers, confirm the picks with me once (step 2) and then start them without asking again.

## 1. Pick the work

Run `bash <this skill's base directory>/../next/scripts/next.sh --json`. If it fails, say why and stop. Mention its `truncated` and `refs_truncated` warnings as `/subagent-kit:next` does.

**Arguments.** `--max <n>` (or `-n <n>`) sets how many sessions to pick, in place of three; it only applies when no issue numbers are given. Any other argument is an issue number. A bare number is always an issue, never the limit.

**With issue numbers**, each space-separated argument is one session. A comma-separated argument, such as `13,14`, is one session that runs `/subagent-kit:issue 13 14` as a queue, which ships `ready-for-agent` issues as a stack of PRs. Skip any issue that is closed, unknown or in the report's `in_flight` bucket, and say why: another session is probably working on it. Anything else is started as given, since `/subagent-kit:issue` handles every state, including stopping on a blocked issue.

**With no issue numbers**, read `<this skill's base directory>/../next/SKILL.md` and pick by its section 3, items 1 and 2: at most three sessions (or the `--max` number; more than three means more PRs for me to review at once, so mention that), none in flight, no blocker or parent link between them, no overlapping `files:` lines, research issues allowed, and an issue with no `Files:` line run alone. Two issues that must run in order (one blocks the other, or their files overlap) can share one session as a queue, `13,14`, instead of running in parallel; offer that only when both are Ready. A Ready issue missing the `ready-for-agent` label gets triaged rather than built; say so when you pick one.

If there is nothing to pick, say what `/subagent-kit:next` would say unblocks the most, and stop.

## 2. Confirm (no issue numbers only)

Ask with `AskUserQuestion`, `multiSelect: true`: one option per session you picked, labeled `#12` or `#13,#14` with the title and why in the description. `AskUserQuestion` takes at most 4 options, so with more picks than that, list them all in plain text first and ask one yes/no question to start them all, or to name the ones to start. Otherwise, if there is room for one more option, add the next-best candidate, such as a For a human item that needs my input, noting that its session will wait for me. Start only what I select. If I type numbers in "Other", treat them as arguments to step 1.

## 3. Start the sessions

1. Work from the main checkout: the sessions create their worktrees from there. Its root is the parent of `git rev-parse --path-format=absolute --git-common-dir`.
2. Decide whether to pass `--plugin-dir`. If this skill's base directory is not under `~/.claude/plugins/`, this plugin was loaded with `--plugin-dir` (for example by a dev script), and a new session would not load it: pass `--plugin-dir <absolute path of this skill's base directory>/../..`. Otherwise pass nothing; the installed plugin loads by itself.
3. Start each session from the main checkout's root with:

   ```
   claude --bg -n issue-<n> [--plugin-dir <dir>] "/subagent-kit:issue <n>"
   ```

   For a queue, name it `issue-<n>-<m>` and pass all its numbers to `/subagent-kit:issue`. Leave the permission mode to my settings. Wait about 5 seconds between starts: each session runs `git fetch` and `git worktree add` in the main checkout.
4. The output has a line `backgrounded · <id> · <name>`. Keep the id. If a start fails, report its output and go on with the rest.

## 4. Report

One line per session: issue numbers and titles, session name and id. Then, once:

- `claude agents` lists them; a session in state `blocked` is waiting for me, at a permission prompt or a question `/subagent-kit:issue` asks.
- `claude attach <id>` opens one; `claude logs <id>` shows its recent output.
- Each session assigns its issue first, so `/subagent-kit:next` shows it In flight and won't offer it again.
