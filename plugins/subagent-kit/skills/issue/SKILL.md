---
name: issue
description: Work a GitHub issue end to end in its own worktree, open a ready-for-review PR, then remove the worktree.
disable-model-invocation: true
argument-hint: <issue-number>
---

Work on GitHub issue #$ARGUMENTS from start to a ready-for-review pull request.

Typing this command is my explicit request to assign the issue to me, commit, push and open a ready-for-review PR (not a draft) for this issue. Do not ask before doing those steps. Stop and ask only for the cases listed under "When to stop".

## 1. Set up

1. Run `gh issue view $ARGUMENTS --json number,title,state,body,comments,labels,assignees`. Plain `--comments` can print nothing. If the issue is closed or the number is not an issue, stop.
2. Assign the issue to me with `gh issue edit $ARGUMENTS --add-assignee @me`. This leaves any existing assignees in place. If it fails, report the error and carry on.
3. From the main checkout, find the default branch with `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` and run `git fetch origin`.
4. If a worktree or branch for this issue already exists (`git worktree list`, `git branch --list 'issue-$ARGUMENTS-*'`), reuse it and continue from its state. Otherwise create one:
   `git worktree add .claude/worktrees/issue-$ARGUMENTS -b issue-$ARGUMENTS-<short-slug> origin/<default-branch>`
5. Make sure `.claude/worktrees/` is ignored. If `git check-ignore -q .claude/worktrees` fails, append `.claude/worktrees/` to `.git/info/exclude` (local only, never commit it).
6. Do all work inside the worktree. Subagents start in the main checkout, so give every `scoper`, `implementer` and `shipper` run the worktree's absolute path and tell it to work only there.
7. Other `/issue` sessions may be running in sibling worktrees. Use absolute paths or `git -C <worktree>` instead of relative `cd`, and never touch another issue's worktree.

## 2. Build it

Follow DELEGATION.md for scoping, implementation, your own review and verification. In addition:

- Run `reviewer` as well when the change touches security, concurrency, data migrations, a public API, or anything that could lose data.
- Run the project's full relevant test suite and linters in the worktree before shipping.

## 3. Ship

Hand off to `shipper` with: the worktree path, the exact files, a commit message that matches the style of `git log --oneline -20`, and the steps commit, push, and open a ready-for-review PR. Write the PR body yourself: summary, what was verified, and `Closes #$ARGUMENTS`.

## 4. Clean up

After the PR is open:

1. Return to the main checkout. Never remove the worktree you are standing in.
2. Stop anything you started from the worktree that may hold files open: `dotnet build-server shutdown`, and any local host, emulator or watcher you launched there.
3. Run `git worktree remove .claude/worktrees/issue-$ARGUMENTS`. If it refuses because of uncommitted or untracked files, do not use `--force`. Report the files and leave the worktree.
4. If it fails with "Permission denied" (a Windows file lock), run `git worktree prune`. If git no longer lists the worktree and the folder holds only ignored build output (`bin/`, `obj/` and the like), delete the folder. If anything else is left, report it and leave the folder.
5. Run `git branch -d <branch>`. It is safe because the branch has been pushed. If git refuses, report it and leave the branch.

The remote branch stays for the PR. To address review comments later, run `/issue $ARGUMENTS` again. Step 1.4 picks up the existing branch, and you can recreate the worktree from `origin/<branch>` if needed.

## When to stop

Stop and ask me only when:

- the issue is ambiguous enough that reasonable readers would build different things
- the real scope is much larger than the issue describes, or needs an architectural decision I should make
- verification still fails after a reasonable fix attempt. A test run that was killed or interrupted, for example by low memory or a timeout, has not failed: rerun it once (alone, or in smaller pieces if memory was the cause) before stopping.
- shipper stops on a pre-flight problem you cannot fix yourself

## Final message

Give the PR link, one line on what was verified, and anything left behind (a kept worktree or branch and why).
