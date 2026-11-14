---
name: repo-init
description: Set up this repository for the issue workflow: a GitHub repo with an origin remote (private by default), the standard triage labels, squash-only merges, a workflow that closes issues when a PR merges into a non-default branch, a pull request template, LF line endings on Windows and a CLAUDE.md from /init, then commit the new files as a PR (or as the first commit of a new repository).
disable-model-invocation: true
---

Set up the current repository for the issue workflow. Safe to run again: each step adds only what is missing.

Typing this command is my request for the label, merge-setting, workflow, template, line-ending and `/init` steps below. Creating the GitHub repository (step 2) and committing or pushing (step 9) each need my yes in this conversation.

All steps run through `bash <this skill's base directory>/scripts/repo-init.sh <command>` from the repository root. Call it `repo-init.sh` below.

## 1. Look first

Run `repo-init.sh status`. It prints `key=value` lines: `git`, `commits`, `branch`, `origin`, `workflow`, `pr_template`, `claude_md`, `other_files`, `uncommitted`, `os`, `gitattributes`, `crlf_files`, `gh`, `repo`, `remote_default`, `setup_pr`, `labels_missing`, `squash_only`, `delete_branch_on_merge`, `visibility`.

- `git=no`: ask me whether to run `git init`. Do it only on a yes, then run `status` again.
- `gh=unavailable`: stop and tell me to install the `gh` CLI and run `gh auth login`.
- `setup_pr` set: an earlier run's setup PR is still open, and the files it adds are on its branch, not here. Do the label and merge-setting steps, skip steps 5 to 9, and point me at the PR.

## 2. The GitHub repository

Skip this step when `origin` is not `none`.

Ask me once, with the recommended answer first:

- Create a **private** GitHub repository named after this folder (the name shown, so I can change it)
- Create a **public** one instead
- Skip: leave the repository local

On a yes, run `repo-init.sh create [--public] [name]`. It adds `origin` and pushes nothing yet. Tell me the repository URL. Step 9 offers the first push.

If I skip, run the label and merge-setting steps only when `repo` is set; otherwise say they need a GitHub repository and skip to step 5.

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

It leaves the new file uncommitted for step 9. It takes effect once it is on the default branch.

## 6. Pull request template

Run `repo-init.sh pr-template`. It copies `templates/pull_request_template.md` to `.github/pull_request_template.md` unless GitHub already has a template for this repository (`pr_template` in `status` names it). It never overwrites or adds a second template.

The template has a `## Summary` that starts with why the change was made, a `## Verification` that lists each check and its result and says what is not checked yet, optional `Known limits` and `Stack` sections, and the `Closes #` line. Its guidance is in HTML comments. Squash merges use the PR body as the commit message, so whoever fills in the template deletes the comments.

The file is left uncommitted for step 9, like the workflow.

## 7. Line endings (Windows only)

Skip this step unless `os=windows`. Run `repo-init.sh line-endings`. When the repository has no `.gitattributes`, it writes one with `* text=auto eol=lf`, so bash scripts and workflows keep LF endings in a Windows checkout. It never edits an existing `.gitattributes`. If that file sets no repository-wide `eol`, say so and leave it to me.

If `crlf_files` is not `0`, the repository already has files committed with CRLF endings. The new `.gitattributes` does not convert them, and git will show them as modified until they are renormalized. Say how many there are, and that converting them is a separate commit I can make with `git add --renormalize .`. Do not run it.

## 8. CLAUDE.md

Skip this step when `claude_md` names a file: `/init` has been run before, or the repository has its own instructions.

When `claude_md=missing` and `other_files` is not `0`, run Claude Code's built-in `/init` by calling the Skill tool with `init`, and let it write `CLAUDE.md` in the repository root. Then come back to step 9.

When `other_files=0`, the repository has nothing to describe yet. Skip `/init` and tell me to run it once there is code.

## 9. Commit

Run `repo-init.sh status` again and read `uncommitted`: the setup files this run or an earlier one wrote that git does not track yet (the workflow, the PR template, `.gitattributes`, `CLAUDE.md`). Skip this step when it is empty.

Ask me once, naming those files, with the recommended answer first:

| State | Recommended | Other choices |
| --- | --- | --- |
| `remote_default` is a branch name | Open a PR into `<remote_default>`: `commit pr` | Commit to `<branch>` and push: `commit direct` |
| `origin` is set and `remote_default` is empty (a new GitHub repository) | Commit to `<branch>` and push it as the first branch: `commit direct`. If `commits` is not `0`, say this pushes those commits too | |
| `origin=none` | Commit to `<branch>` locally: `commit direct` | |

Always offer "Leave them uncommitted" as the last choice.

Run `repo-init.sh commit pr` or `repo-init.sh commit direct`. Both commit only those files, and never other staged or changed files.

- `pr` builds a single commit on top of `origin/<remote_default>` without checking anything out. It pushes the commit to a new `repo-init` branch (`repo-init-2` and so on if taken) and opens a PR whose body follows the PR template. My current branch, its unpushed commits and its working tree stay as they were. The setup files are removed from the working tree because they now live on the PR branch. They come back when I pull `<remote_default>` after the merge.
- `direct` commits on the current branch and pushes it with `-u` when `origin` exists.

The commit is made by the script, so it carries no attribution lines. `pr` uses `git commit-tree`, so commit hooks do not run on it. Tell me the PR URL or the branch pushed.

## Report

Finish with a short list of what was created, what already existed, what was committed and where, and what I still have to do myself: review and merge the setup PR, look over `CLAUDE.md`, renormalize CRLF files, run `/init` later, and anything skipped. If branch protection or required checks matter for this repository, say they are not set up here.
