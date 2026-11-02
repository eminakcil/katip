#!/usr/bin/env bash
# Guards implementer PRs (docs/agent-pipeline.md, "CI checks"). PRs opened by
# anyone else are not checked. CI runs the copy of this script from the BASE
# branch, so a PR cannot weaken it.
#
# 1. tests-frozen: the tester workflow sets a `tests-frozen` commit status
#    (creator: the tester bot) on the SHA it hands off. The implementer app can
#    only read statuses, so it cannot fake one. Every test path changed by the
#    PR must be byte-identical to that frozen SHA.
# 2. Authorship: every non-merge commit touching a test path must be authored
#    by the tester bot (cheap second line of defense).
# 3. Protected config: the PR must not change CI, lint or mutation settings.
#
# Usage: test-guard.sh <base-sha> <head-sha> <pr-author-login>
# Needs `gh` (authenticated, GH_TOKEN) and REPO=<owner/name> for status lookups.
set -euo pipefail

base="$1"
head="$2"
pr_author="$3"
implementer="${IMPLEMENTER_BOT:-eminakcil-implementer[bot]}"
tester="${TESTER_BOT:-eminakcil-tester[bot]}"
test_pattern='(^|/)test/|\.test\.ts$'
protected_pattern='^\.github/|^biome\.json$|(^|/)stryker\.config\.json$|(^|/)vitest\.config\.[cm]?[jt]s$'

if [ "$pr_author" != "$implementer" ]; then
	echo "test-guard: PR opened by '$pr_author', not $implementer; nothing to check."
	exit 0
fi

failed=0
fail() {
	echo "test-guard: $*"
	failed=1
}

changed=$(git diff --name-only "$base" "$head")

# 3. Protected config.
protected=$(printf '%s\n' "$changed" | grep -E "$protected_pattern" || true)
if [ -n "$protected" ]; then
	fail "implementer PRs may not change CI, lint or mutation config:"
	printf '  %s\n' $protected
fi

# 1. tests-frozen.
frozen=""
for sha in $(git rev-list "$base..$head"); do
	found=$(gh api "repos/$REPO/commits/$sha/statuses" \
		--jq "[.[] | select(.context == \"tests-frozen\" and .state == \"success\" and .creator.login == \"$tester\")] | length")
	if [ "$found" != "0" ]; then
		frozen="$sha"
		break # rev-list is newest first: this is the latest handoff
	fi
done

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
