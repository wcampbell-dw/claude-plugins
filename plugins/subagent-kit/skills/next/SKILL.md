---
name: next
description: Show what is ready, in flight, blocked and waiting in this repository's GitHub issues and PRs, and recommend what to start next. Read-only.
disable-model-invocation: true
---

Report the state of this repository's work queue and recommend what to start. This skill only reads. It never edits an issue, label or PR, never starts work, and never runs `/subagent-kit:issue` itself.

## 1. Get the facts

Run `bash <this skill's base directory>/scripts/next.sh` from anywhere inside the repository. It makes one GitHub query and sorts every open issue into the first bucket that fits:

| Bucket | Means |
| --- | --- |
| Ready now | Open, no open blocker, no open PR, not waiting, not for a human, not awaiting triage |
| In flight | Has an open PR (named by a closing keyword, or from a branch called `issue-<n>-...`), with its base, checks and review state |
| Blocked | Has an open issue in its native "blocked by" list |
| Waiting | Labeled `waiting` or `blocked`, or has a `Not before: YYYY-MM-DD` line in its body that is still ahead |
| For a human | Labeled `ready-for-human`: an owner action, a decision, a manual check |
| Needs triage | Labeled `needs-triage` or `needs-info` |
| Epics | Has sub-issues. A container, shown as progress, never offered as work |

If it fails, say why (usually `gh` is not signed in, or the folder has no GitHub remote) and stop. If it warns that more than 100 issues are open, say the report covers only the oldest 100.

## 2. Show the report

Print the script's output as it is, then add the brief below. Do not retell every issue.

## 3. The brief

Keep it short and concrete, in this order:

1. **Recommended next.** One issue, or at most three that can run in parallel, as ready-to-run commands: `/subagent-kit:issue 12`. Pick by:
   - Unblocking the most work first: count how many Blocked issues list it, directly or through a chain.
   - Anything with a `Not before:` date that has passed (marked in the report).
   - Finishing before starting: an open PR that is failing checks or has had no review outranks new work, so say so.
2. **Parallel is safe** only when the issues have no blocker or parent relationship between them and their `files:` lines (shown in brackets when an issue has a `Files:` line) do not overlap. An issue with no `Files:` line gets "files unknown": say so and recommend running it alone, or read the issue to compare. Never recommend more than three at once: each one ends in a PR I have to review.
3. **For me, not an agent.** List the For a human items, and any Ready items that read like owner actions, with what each needs from me.
4. **Time-gated.** Waiting issues with a date, soonest first, and what unblocks when each passes.
5. **Hygiene.** One line each, only when true:
   - an epic whose sub-issues are all closed (close it)
   - Ready items missing the `ready-for-agent` label, so the queue's labels are not trustworthy yet (offer `/subagent-kit:repo-init` if the standard labels are missing)
   - PRs whose base is not the default branch, and whether anything is merged into them but not yet on the default branch
   - a Blocked issue whose blocker is Waiting or For a human, so nothing will move until I act

If nothing is Ready, say what unblocks the most and why, instead of inventing work.
