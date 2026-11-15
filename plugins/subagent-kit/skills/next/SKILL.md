---
name: next
description: Show what is ready, in flight, blocked, waiting, up for research or waiting on me in this repository's GitHub issues and PRs, and recommend what to start next. Read-only.
disable-model-invocation: true
---

Report the state of this repository's work queue and recommend what to start. This skill only reads. It never edits an issue, label or PR, never starts work, and never runs `/subagent-kit:issue` itself.

## 1. Get the facts

Run `bash <this skill's base directory>/scripts/next.sh` from anywhere inside the repository. It makes one GitHub query and sorts every open issue into the first bucket that fits:

| Bucket | Means |
| --- | --- |
| Ready now | Open, no open blocker, not in flight, not waiting, not for a human, not research, not awaiting triage |
| In flight | Being worked on. Has an open PR (named by a closing keyword, or from a branch called `issue-<n>-...`), shown with its base, checks and review state. Or has no PR yet but has a local worktree or a GitHub branch named `issue-<n>-...`, or is assigned to someone (`/subagent-kit:issue` assigns an issue before it builds it, and a queue assigns every issue it will build up front). An issue that is only assigned (no PR, worktree or branch) and is Blocked, Waiting, Needs triage, For a human or Research stays in that bucket |
| Blocked | Has an open issue in its native "blocked by" list |
| Waiting | Labeled `waiting`, or has a `Not before: YYYY-MM-DD` line in its body that is still ahead. `blocked` counts too, for repositories set up before blockers moved to native links |
| Needs triage | Labeled `needs-triage` or `needs-info` |
| For a human | Labeled `ready-for-human` (needs a person's hands) or `needs-decision` (needs my choice, marked `[needs-decision]`) |
| Research (agent, no PR) | Labeled `needs-research`: a question an agent answers by investigating, ending in findings on the issue rather than a PR |
| Epics | Has sub-issues. A container, shown as progress, never offered as work |

Under an issue in Waiting, Research, For a human or Needs triage, the report shows every `Waiting on:`, `Decision:` and `Question:` line in its body, one per line, in body order.

If it fails, say why (usually `gh` is not signed in, or the folder has no GitHub remote) and stop. If it warns that more than 100 issues are open, say the report covers only the oldest 100. If it warns that only 100 `issue-` branches were read, say a Ready issue may already have a branch.

## 2. Show the report

Print the script's output as it is, then add the brief below. Do not retell every issue.

## 3. The brief

Keep it short and concrete, in this order:

1. **Recommended next.** One issue, or at most three that can run in parallel, as ready-to-run commands: `/subagent-kit:issue 12`. Pick by:
   - Unblocking the most work first: count how many Blocked issues list it, directly or through a chain.
   - Anything with a `Not before:` date that has passed (marked in the report).
   - Finishing before starting: an open PR that is failing checks or has had no review outranks new work, so say so.

   Research issues can be recommended like Ready ones, by the same rules: `/subagent-kit:issue <n>` investigates and posts findings without opening a PR. When answering one would unblock or settle Ready work, it can outrank that work.

   Never recommend an In flight issue: another session is probably working on it, and a second one would duplicate the work. This holds when it has no PR yet, too.
2. **Parallel is safe** only when the issues have no blocker or parent relationship between them and their `files:` lines (shown in brackets when an issue has a `Files:` line) do not overlap. An issue with no `Files:` line gets "files unknown": say so and recommend running it alone, or read the issue to compare. Research issues change no files, so they don't overlap anything. Never recommend more than three Ready issues at once: each one ends in a PR I have to review.
3. **For me, not an agent.** List the For a human items with what each needs from me: the `Waiting on:` line for `ready-for-human`, and the `Decision:` line for `needs-decision`. Add any Ready items that read like owner actions. Each of these runs as `/subagent-kit:issue <n>` too: for a decision it lays out the options and grills me, and for `ready-for-human` it does the agent's part and writes me a runbook, or checks my work if the runbook is already there. Needs triage items run the same way, to triage them.
4. **Time-gated.** Waiting issues with a date, soonest first, and what unblocks when each passes.
5. **Hygiene.** One line each, only when true:
   - an epic whose sub-issues are all closed (close it)
   - Ready items missing the `ready-for-agent` label, so the queue's labels are not trustworthy yet (offer `/subagent-kit:repo-init` if the standard labels are missing). `/subagent-kit:issue` triages an issue with no state label instead of building it, so recommending one gets it triaged first
   - PRs whose base is not the default branch, and whether anything is merged into them but not yet on the default branch
   - a Blocked issue whose blocker is Waiting or For a human, so nothing will move until I act
   - a For a human, Research or `needs-info` issue with no `Waiting on:`, `Decision:` or `Question:` line, so its next step isn't written down (`/subagent-kit:issue <n>` adds one)
   - a Waiting issue marked `[labeled blocked]`: move its blocker to a native "blocked by" link and drop the label
   - an In flight issue marked `may be abandoned` (no PR, no local worktree, no new commit or assignment for over 2 days): ask whether its session is still running. An issue waiting its turn in a long `/subagent-kit:issue` queue is assigned with no branch yet, so it can be flagged while the queue is healthy. If it is not running, `/subagent-kit:issue <n>` picks up its branch, and unassigning it puts it back in Ready

If nothing is Ready, say what unblocks the most and why, instead of inventing work.
