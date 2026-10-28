#!/usr/bin/env bash
# Worktree helper for the /subagent-kit:issue skill. Run it from the main checkout.
#   worktree.sh include <worktree-path>   copy gitignored files listed in .worktreeinclude
#   worktree.sh remove  <worktree-path>   remove a finished, pushed worktree and its local branch
# Claude Code applies .worktreeinclude only to worktrees it creates itself; `include` covers
# worktrees made with plain `git worktree add`.
set -u

RETRY_DELAY=${WORKTREE_RETRY_DELAY:-2}   # seconds between retries (Windows file locks)

usage() {
  echo "usage: ${0##*/} include|remove <worktree-path>" >&2
  exit 2
}

fail() { echo "worktree.sh: $*" >&2; exit 1; }

# Absolute path in git's form (C:/Users/... on Windows Git Bash, plain path elsewhere), lowercased
# for comparison. Works for folders that no longer exist by resolving the parent.
norm() {
  local p=$1 dir base out
  if [ -d "$p" ]; then dir=$p; base=
  else dir=$(dirname "$p"); base=/$(basename "$p"); fi
  # pwd -W (Git Bash) gives long names like git does; cygpath -m can return 8.3 short names.
  out=$(cd "$dir" 2>/dev/null && { pwd -W 2>/dev/null || pwd -P; })
  [ -n "$out" ] || out=$(cygpath -m "$dir" 2>/dev/null)
  [ -n "$out" ] || return 1
  out=${out%/}$base
  printf '%s\n' "$out" | tr 'A-Z' 'a-z'
}

include() {
  local wt=$1 file n=0
  [ -d "$wt" ] || fail "worktree folder not found: $wt"
  if [ ! -f .worktreeinclude ]; then
    echo "no .worktreeinclude in $(pwd), nothing to copy"
    return 0
  fi
  # Files matching .worktreeinclude, then keep only those that are also gitignored.
  # Tracked files never show up in --others, so they are never copied.
  while IFS= read -r -d '' file; do
    [ -e "$wt/$file" ] && continue
    mkdir -p "$wt/$(dirname "$file")" && cp -p "$file" "$wt/$file" || continue
    echo "copied $file"
    n=$((n + 1))
  done < <(git ls-files -z --others --ignored --exclude-from=.worktreeinclude | git check-ignore -z --stdin)
  echo "copied $n file(s) into $wt"
}

# Fields of one `git worktree list --porcelain` entry, set by find_worktree.
wt_listed=0 wt_branch= wt_locked=0 wt_is_main=0

find_worktree() {
  local want=$1 line cur= idx=0 branch= locked=0
  wt_listed=0 wt_branch= wt_locked=0 wt_is_main=0
  while IFS= read -r line || [ -n "$line" ]; do
    case $line in
      "worktree "*) cur=$(norm "${line#worktree }"); branch=; locked=0 ;;
      "branch refs/heads/"*) branch=${line#branch refs/heads/} ;;
      locked*) locked=1 ;;
      "")
        if [ -n "$cur" ] && [ "$cur" = "$want" ]; then
          wt_listed=1 wt_branch=$branch wt_locked=$locked
          [ $idx -eq 0 ] && wt_is_main=1
        fi
        [ -n "$cur" ] && idx=$((idx + 1))
        cur=
        ;;
    esac
  done < <(git worktree list --porcelain; echo)
}

remove() {
  local arg=$1 wt cur n

  # 1. Absolute path; never remove the directory we are standing in.
  wt=$(norm "$arg") || fail "cannot resolve path: $arg (nothing changed)"
  cur=$(norm "$PWD")
  case "$cur/" in "$wt/"*) fail "current directory is inside the worktree $arg; run from the main checkout (nothing changed)" ;; esac

  # 2. Must be a registered worktree, and not the main one.
  find_worktree "$wt"
  if [ $wt_listed -eq 0 ]; then
    if [ ! -e "$arg" ]; then
      echo "worktree $arg is not registered and the folder does not exist; nothing to do"
      return 0
    fi
    fail "$arg exists but is not a worktree of this repository; left untouched"
  fi
  [ $wt_is_main -eq 0 ] || fail "$arg is the main worktree; refusing to remove it"
  [ -n "$wt_branch" ] || fail "worktree $arg has no branch (detached HEAD); cannot verify it was pushed, left in place"
  local branch=$wt_branch

  # 3. Nothing uncommitted or untracked. An untracked file byte-identical to the same path in the
  # main checkout is only a copy (Claude Code copies .claude/settings.local.json into worktrees
  # it creates, and a .worktreeinclude copy is untracked wherever the ignore rule doesn't reach),
  # so it doesn't block; it is deleted once nothing else does.
  local dirty main file copies=() untracked=()
  dirty=$(git -C "$arg" status --porcelain --untracked-files=no) \
    || fail "git status failed in $arg; worktree and branch '$branch' left in place"
  main=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
  while IFS= read -r -d '' file; do
    if [ -n "$main" ] && [ ! -L "$arg/$file" ] && [ -f "$main/$file" ] && [ ! -L "$main/$file" ] \
       && cmp -s "$arg/$file" "$main/$file"; then
      copies+=("$file")
    else
      untracked+=("$file")
    fi
  done < <(git -C "$arg" ls-files -z --others --exclude-standard)
  [ ${#untracked[@]} -eq 0 ] || dirty+=${dirty:+$'\n'}$(printf '?? %s\n' "${untracked[@]}")
  if [ -n "$dirty" ]; then
    printf '%s\n' "$dirty" >&2
    fail "worktree $arg has uncommitted or untracked files (listed above); worktree and branch '$branch' left in place"
  fi

  # 4. Everything pushed: HEAD is on some remote-tracking branch. Not @{u}, which can still be
  # origin/main when the branch was renamed and pushed without -u.
  [ -n "$(git -C "$arg" for-each-ref --contains HEAD --count=1 refs/remotes)" ] \
    || fail "branch '$branch' has commits on no remote branch (unpushed); worktree and branch left in place"

  # 5. Unlock if locked.
  if [ $wt_locked -eq 1 ]; then
    git worktree unlock "$arg" || fail "could not unlock worktree $arg; worktree and branch '$branch' left in place"
  fi

  # 6. Delete the copies step 3 let through; the main checkout still has each one.
  for file in ${copies[@]+"${copies[@]}"}; do
    rm -f "$arg/$file" || fail "could not delete $file, a copy of the main checkout's; worktree and branch '$branch' left in place"
    echo "deleted $file (identical to the main checkout's copy)"
  done

  # 7. Stop MSBuild/compiler servers that may hold files open.
  if command -v dotnet >/dev/null 2>&1 \
     && [ -n "$(find "$arg" -maxdepth 4 \( -name node_modules -o -name bin -o -name obj \) -prune -o \
          \( -name '*.sln' -o -name '*.slnx' -o -name '*.csproj' \) -print -quit 2>/dev/null)" ]; then
    dotnet build-server shutdown >/dev/null 2>&1 || true
  fi

  # 8. Remove the worktree (never --force); retry to ride out Windows file locks.
  local try err= removed=0
  for try in 1 2 3; do
    err=$(git worktree remove "$arg" 2>&1) && { removed=1; break; }
    [ $try -lt 3 ] && sleep "$RETRY_DELAY"
  done

  # 9. Fallback: prune, then delete what is left. Steps 3 and 6 guarantee it is only ignored files.
  if [ $removed -eq 0 ] || [ -e "$arg" ]; then
    git worktree prune
    find_worktree "$wt"
    [ $wt_listed -eq 0 ] || fail "git could not remove worktree $arg: $err; worktree and branch '$branch' left in place"
    for try in 1 2 3; do
      rm -rf "$arg" 2>/dev/null
      [ -e "$arg" ] || break
      [ $try -lt 3 ] && sleep "$RETRY_DELAY"
    done
    if [ -e "$arg" ]; then
      n=$(find "$arg" -type f 2>/dev/null | wc -l | tr -d ' ')
      fail "git unregistered $arg but $n file(s) remain in the folder; a process probably holds them open. Branch '$branch' left in place"
    fi
  fi

  # 10. Delete the local branch. -D is safe: step 4 found its commits on a remote branch, and
  # -d would refuse when the upstream is still origin/main.
  err=$(git branch -D "$branch" 2>&1) \
    || fail "removed worktree $arg but could not delete branch '$branch': $err"

  # 11.
  echo "removed worktree $arg and deleted local branch '$branch'"
}

[ $# -eq 2 ] || usage
case $1 in
  include) include "$2" ;;
  remove) remove "$2" ;;
  *) usage ;;
esac
