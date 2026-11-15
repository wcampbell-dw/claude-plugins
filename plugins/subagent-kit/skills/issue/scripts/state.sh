#!/usr/bin/env bash
# Dispatch facts for one issue, for the /subagent-kit:issue skill. Read-only: it only queries GitHub.
#   state.sh <n>   print one JSON object describing issue <n>
# Run it inside the repository. Set GH_REPO=owner/name to look at another one.
#
# "route" is the path /issue takes, the first that applies:
#   not-an-issue     the number is a PR, or there is no such issue
#   closed           the issue is closed
#   blocked          it has open issues in its native "blocked by" list
#   epic             it has sub-issues
#   waiting          labeled waiting: check "Waiting on:" / "Not before:" before the state's step
#   needs-triage     labeled needs-triage, or it has no state label or more than one
#   needs-research | needs-decision | needs-info | ready-for-agent | ready-for-human
# "state" is the state label alone (needs-triage when missing or conflicting), so a waiting issue
# says which step to run once its condition has passed.
set -u

fail() { echo "state.sh: $*" >&2; exit 1; }

[ $# -eq 1 ] || { echo "usage: ${0##*/} <issue-number>" >&2; exit 2; }
n=$1
case $n in ''|*[!0-9]*) fail "issue number must be a plain number: $n" ;; esac
command -v gh >/dev/null 2>&1 || fail "gh is not installed"
command -v jq >/dev/null 2>&1 || fail "jq is not installed"

slug=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null) || fail "no GitHub repository here (is there an origin remote, and is gh signed in?)"
owner=${slug%%/*}
name=${slug#*/}

QUERY='
query($o: String!, $n: String!, $num: Int!) {
  repository(owner: $o, name: $n) {
    issueOrPullRequest(number: $num) {
      __typename
      ... on Issue {
        number title url state stateReason body
        labels(first: 30) { nodes { name } }
        assignees(first: 10) { nodes { login } }
        parent { number title }
        blockedBy(first: 20) { nodes { number title state labels(first: 20) { nodes { name } } } }
        subIssues(first: 100) { nodes { number title state labels(first: 20) { nodes { name } } } }
      }
    }
  }
}'

# A missing number makes gh exit non-zero but still print data with a null issue, so judge by the
# output: no repository object means the query itself failed.
data=$(gh api graphql -f query="$QUERY" -f o="$owner" -f n="$name" -F num="$n" 2>/dev/null)
jq -e '.data.repository' >/dev/null 2>&1 <<<"$data" || fail "GitHub query failed"

jq --arg today "$(date +%F)" --argjson num "$n" '
  .data.repository.issueOrPullRequest as $i
  | ["needs-triage", "needs-research", "needs-decision", "needs-info", "ready-for-agent", "ready-for-human"] as $states
  | if ($i == null or $i.__typename != "Issue") then {number: $num, route: "not-an-issue"}
    else
      ($i.body // "") as $body
      | [$i.labels.nodes[].name] as $labels
      | [$labels[] | select(. as $l | $states | index($l))] as $state_labels
      # jq ignores the "m" flag for ^, so multi-line matching needs the inline (?im) prefix.
      | def lines($re): [$body | match("(?im)" + $re; "g") | .captures[0].string];
      {
        number: $i.number, title: $i.title, url: $i.url,
        open: ($i.state == "OPEN"), state_reason: $i.stateReason,
        labels: $labels,
        state_labels: $state_labels,
        state: (if ($state_labels | length) == 1 then $state_labels[0] else "needs-triage" end),
        state_problem: (if ($state_labels | length) == 0 then "no state label"
                        elif ($state_labels | length) > 1 then "conflicting state labels" else null end),
        waiting: (($labels | index("waiting")) != null),
        not_before: (($body | capture("(?im)^[ \\t]*not before:[ \\t]*(?<d>[0-9]{4}-[0-9]{2}-[0-9]{2})") | .d) // null),
        waiting_on: lines("^[ \\t]*waiting on:[ \\t]*([^\\r\\n]+)"),
        decision: lines("^[ \\t]*decision:[ \\t]*([^\\r\\n]+)"),
        question: lines("^[ \\t]*question:[ \\t]*([^\\r\\n]+)"),
        assignees: [$i.assignees.nodes[].login],
        parent: $i.parent,
        blockers: [$i.blockedBy.nodes[] | select(.state == "OPEN") | {number, title, labels: [.labels.nodes[].name]}],
        subs: [$i.subIssues.nodes[] | {number, title, state, labels: [.labels.nodes[].name]}]
      }
      | .date_passed = (.not_before != null and .not_before <= $today)
      | .route = (
          if (.open | not) then "closed"
          elif (.blockers | length) > 0 then "blocked"
          elif (.subs | length) > 0 then "epic"
          elif .waiting then "waiting"
          else .state end)
    end' <<<"$data" || fail "could not process the GitHub response"
