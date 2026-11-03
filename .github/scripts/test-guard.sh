#!/usr/bin/env bash
# Test integrity guard (docs/agent-pipeline.md, "CI checks"). CI runs the copy
# of this script from the BASE branch, so a PR cannot weaken it.
#
# Two flows during the local pipeline trial (ADR 0010):
#
# A. Bot PRs (author: the implementer app), ADR 0009. Unchanged.
#    1. tests-frozen: the tester workflow sets a `tests-frozen` commit status
#       (creator: the tester bot) on the SHA it hands off. The implementer app
#       can only read statuses, so it cannot fake one. Every test path changed
#       by the PR must be byte-identical to that frozen SHA.
#    2. Authorship: every non-merge commit touching a test path must be
#       authored by the tester bot (cheap second line of defense).
#    3. Protected config: the PR must not change CI, lint or mutation settings.
#
# B. Every other PR (local /task pipeline), ADR 0010. No network calls.
#    1. Commit order (every branch): walking the PR's non-merge commits oldest
#       first, once a commit touches a path that is neither a test path nor a
#       port interface, no later commit may touch test paths, and no single
#       commit may mix test paths with such paths. A commit is exempt if it has
#       the trailer `Test-Change-Approved: eminakcil`.
#    2. Protected config (task/* branches only): no CI, lint or mutation
#       settings changes. Owner chore PRs may change them.
#
# Usage: test-guard.sh <base-sha> <head-sha> <pr-author-login> [<head-ref>]
# Flow A needs `gh` (authenticated, GH_TOKEN) and REPO=<owner/name>.
set -euo pipefail

base="$1"
head="$2"
pr_author="$3"
head_ref="${4:-}"
implementer="${IMPLEMENTER_BOT:-eminakcil-implementer[bot]}"
tester="${TESTER_BOT:-eminakcil-tester[bot]}"
approver="${TEST_CHANGE_APPROVER:-eminakcil}"
test_pattern='(^|/)test/|\.test\.ts$'
port_pattern='^packages/core/src/ports/|^packages/[^/]+/src/ports\.ts$'
protected_pattern='^\.github/|^biome\.json$|(^|/)stryker\.config\.json$|(^|/)vitest\.config\.[cm]?[jt]s$'

failed=0
fail() {
	echo "test-guard: $*"
	failed=1
}

changed=$(git diff --name-only "$base" "$head")

check_protected() {
	local protected
	protected=$(printf '%s\n' "$changed" | grep -E "$protected_pattern" || true)
	if [ -n "$protected" ]; then
		fail "$1 may not change CI, lint or mutation config:"
		printf '  %s\n' $protected
	fi
}

# ---------------------------------------------------------------------------
# A. Bot PRs (ADR 0009)
# ---------------------------------------------------------------------------
bot_flow() {
	# 3. Protected config.
	check_protected "implementer PRs"

	# 1. tests-frozen.
	local frozen="" sha found
	for sha in $(git rev-list "$base..$head"); do
		found=$(gh api "repos/$REPO/commits/$sha/statuses" \
			--jq "[.[] | select(.context == \"tests-frozen\" and .state == \"success\" and .creator.login == \"$tester\")] | length")
		if [ "$found" != "0" ]; then
			frozen="$sha"
			break # rev-list is newest first: this is the latest handoff
		fi
	done

	local changed_tests file at_head at_frozen
	changed_tests=$(printf '%s\n' "$changed" | grep -E "$test_pattern" || true)
	if [ -z "$frozen" ]; then
		fail "no tests-frozen status from $tester on any commit in the PR. The tester must hand off first, and the branch must not be rebased (merge main instead)."
	else
		echo "test-guard: tests frozen at ${frozen:0:12}"
		for file in $changed_tests; do
			at_head=$(git rev-parse -q --verify "$head:$file" || echo missing)
			at_frozen=$(git rev-parse -q --verify "$frozen:$file" || echo missing)
			if [ "$at_head" != "$at_frozen" ]; then
				fail "$file differs from the tester's frozen version."
			fi
		done
	fi

	# 2. Authorship of commits touching tests.
	local author tests
	while IFS=$'\t' read -r sha author; do
		[ -z "$sha" ] && continue
		tests=$(git diff-tree --no-commit-id --name-only -r --root "$sha" | grep -E "$test_pattern" || true)
		if [ -n "$tests" ] && [ "$author" != "$tester" ]; then
			fail "commit ${sha:0:12} by '$author' changes test paths; only $tester may."
		fi
	done < <(git log --no-merges --format='%H%x09%an' "$base..$head")

	if [ "$failed" -ne 0 ]; then
		exit 1
	fi
	echo "test-guard: tests unchanged since the tester's handoff; no protected config touched."
}

# ---------------------------------------------------------------------------
# B. Local pipeline PRs (ADR 0010)
# ---------------------------------------------------------------------------
local_flow() {
	if [[ "$head_ref" == task/* ]]; then
		check_protected "task branches"
	else
		echo "test-guard: '${head_ref:-<unknown ref>}' is not a task/* branch; protected config not checked."
	fi

	local impl_started="" order_failed=0 sha files tests others approved short
	for sha in $(git rev-list --reverse --no-merges "$base..$head"); do
		files=$(git diff-tree --no-commit-id --name-only -r --root "$sha")
		tests=$(printf '%s\n' "$files" | grep -E "$test_pattern" || true)
		others=$(printf '%s\n' "$files" | grep -vE "$test_pattern" | grep -vE "$port_pattern" | grep -v '^$' || true)
		short="${sha:0:12} $(git log -1 --format=%s "$sha")"

		if [ -n "$tests" ]; then
			approved=$(git log -1 --format='%(trailers:key=Test-Change-Approved,valueonly)' "$sha" | tr -d '[:space:]')
			if [ "$approved" = "$approver" ]; then
				echo "test-guard: $short changes test paths with Test-Change-Approved: $approver."
			elif [ -n "$impl_started" ]; then
				order_failed=1
				fail "$short changes test paths after implementation started at $impl_started:"
				printf '  %s\n' $tests
			elif [ -n "$others" ]; then
				order_failed=1
				fail "$short mixes test paths with non-test paths:"
				printf '  test:  %s\n' $tests
				printf '  other: %s\n' $others
			fi
		fi

		if [ -n "$others" ] && [ -z "$impl_started" ]; then
			impl_started="${sha:0:12}"
		fi
	done

	if [ "$order_failed" -ne 0 ]; then
		echo "test-guard: tests are written before the implementation and not changed afterwards (CLAUDE.md, Testing rules)."
		echo "test-guard: if the owner approves a test change, put it in its own commit with the trailer:"
		echo "  git commit --trailer 'Test-Change-Approved: $approver' ..."
	fi
	if [ "$failed" -ne 0 ]; then
		exit 1
	fi
	echo "test-guard: commit order ok (tests before implementation, no later test changes)."
}

if [ "$pr_author" = "$implementer" ]; then
	bot_flow
else
	local_flow
fi
