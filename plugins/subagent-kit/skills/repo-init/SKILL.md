---
name: repo-init
description: Set up this repository for the issue workflow: a GitHub repo with an origin remote (private by default), the standard triage labels, squash-only merges, and a workflow that closes issues when a PR merges into a non-default branch.
disable-model-invocation: true
---

Set up the current repository for the issue workflow. Safe to run again: each step adds only what is missing.

Typing this command is my request for the label, merge-setting and workflow steps below. Creating the GitHub repository needs my yes in this conversation (step 2).

All steps run through `bash <this skill's base directory>/scripts/repo-init.sh <command>` from the repository root. Call it `repo-init.sh` below.

## 1. Look first

Run `repo-init.sh status`. It prints `key=value` lines: `git`, `commits`, `branch`, `origin`, `workflow`, `gh`, `repo`, `labels_missing`, `squash_only`, `delete_branch_on_merge`, `visibility`.

- `git=no`: ask me whether to run `git init`. Do it only on a yes, then run `status` again.
- `gh=unavailable`: stop and tell me to install the `gh` CLI and run `gh auth login`.

## 2. The GitHub repository

Skip this step when `origin` is not `none`.

Ask me once, with the recommended answer first:

- Create a **private** GitHub repository named after this folder (the name shown, so I can change it)
- Create a **public** one instead
- Skip: leave the repository local

On a yes, run `repo-init.sh create [--public] [name]`. It adds `origin` and pushes nothing. Tell me the repository URL, and if `commits` is not `0`, that nothing is pushed yet and the push command to run (`git push -u origin <branch>`). Do not push for me.

If I skip, run the label and merge-setting steps only when `repo` is set; otherwise say they need a GitHub repository and stop after step 5.

## 3. Labels

Run `repo-init.sh labels`. It creates the standard labels that are missing and leaves existing ones alone:

| Label | Meaning |
| --- | --- |
| `needs-triage` | Not evaluated yet |
| `needs-info` | Waiting on the reporter |
| `ready-for-agent` | Fully specified; an agent can work it alone |
| `ready-for-human` | Needs a person: an owner action, a decision, a manual check |
| `waiting` | Waiting on a date or an outside party; the issue body says which, with a `Not before: YYYY-MM-DD` line for dates |

`/subagent-kit:next` reads these labels, the issue's native "blocked by" links, its parent and sub-issues, and its open PRs. Dependencies belong in GitHub's "blocked by" field, not in a label.

## 4. Merge settings

Ask me once whether to allow only squash merges and delete merged branches (recommended; it needs admin rights on the repository). On a yes, run `repo-init.sh merge-settings`. Skip when `status` already shows `squash_only=true` and `delete_branch_on_merge=true`.

## 5. Auto-close workflow

Run `repo-init.sh workflow`. It copies `templates/close-linked-issues.yml` to `.github/workflows/close-linked-issues.yml` unless that file exists, and never overwrites one. GitHub closes issues named in a PR body (`Closes #12`) only when the PR merges into the default branch. This workflow closes them for merges into any other branch, with a comment naming the PR.

It leaves the new file uncommitted. Say so, and that it takes effect once the file is on the default branch. Do not commit or push it.

## Report

Finish with a short list of what was created, what already existed, and what I still have to do myself: push, commit the workflow file, and anything skipped. If branch protection or required checks matter for this repository, say they are not set up here.
