#!/usr/bin/env bash
# Link GitHub issues for the /subagent-kit:grill skill. Run it inside the repository.
#   link.sh sub <parent> <child>          make <child> a sub-issue of <parent>
#   link.sh blocked-by <issue> <blocker>  mark <issue> as blocked by <blocker>
# Issue numbers are the ones GitHub shows. Linking something already linked is not an error.
# Set GH_REPO=owner/name to aim it at another repository.
set -u

fail() { echo "link.sh: $*" >&2; exit 1; }

command -v gh >/dev/null 2>&1 || fail "gh is not installed"
[ $# -eq 3 ] || { echo "usage: ${0##*/} sub <parent> <child> | blocked-by <issue> <blocker>" >&2; exit 2; }
kind=$1 a=$2 b=$3
case $a$b in *[!0-9]*) fail "issue numbers must be plain numbers: $a $b" ;; esac
[ "$a" != "$b" ] || fail "an issue cannot be linked to itself"

slug=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null) || fail "no GitHub repository here"
id_of() { gh api "repos/$slug/issues/$1" -q .id 2>/dev/null; }
b_id=$(id_of "$b") || true
[ -n "$b_id" ] || fail "no issue #$b in $slug"
[ -n "$(id_of "$a")" ] || fail "no issue #$a in $slug"

case $kind in
  sub)        endpoint="repos/$slug/issues/$a/sub_issues";             field=sub_issue_id ;;
  blocked-by) endpoint="repos/$slug/issues/$a/dependencies/blocked_by"; field=issue_id ;;
  *) fail "unknown link type: $kind" ;;
esac

out=$(gh api -X POST "$endpoint" -F "$field=$b_id" 2>&1) && { echo "linked   #$b ($kind) #$a"; exit 0; }
case $out in
  *"already"*|*"Duplicate"*|*"duplicate"*) echo "kept     #$b ($kind) #$a (already linked)"; exit 0 ;;
esac
fail "could not link #$b to #$a: $out"
