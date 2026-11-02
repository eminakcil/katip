#!/usr/bin/env bash
# On pull requests opened by the implementer bot, every commit in BASE..HEAD that
# touches a test path (CLAUDE.md: **/*.test.ts and **/test/**) must be authored
# by the tester bot. Anything else fails, including commits with a made-up or
# missing author. PRs opened by anyone else are not checked.
# Usage: test-guard.sh <base-sha> <head-sha> <pr-author-login>
set -euo pipefail

base="$1"
head="$2"
pr_author="$3"
implementer="${IMPLEMENTER_BOT:-eminakcil-implementer[bot]}"
tester="${TESTER_BOT:-eminakcil-tester[bot]}"
pattern='(^|/)test/|\.test\.ts$'

if [ "$pr_author" != "$implementer" ]; then
	echo "test-guard: PR opened by '$pr_author', not $implementer; nothing to check."
	exit 0
fi

failed=0
while IFS=$'\t' read -r sha author; do
	[ -z "$sha" ] && continue
	tests=$(git diff-tree --no-commit-id --name-only -r --root "$sha" | grep -E "$pattern" || true)
	[ -z "$tests" ] && continue
	if [ "$author" != "$tester" ]; then
		echo "test-guard: commit ${sha:0:12} by '$author' changes test paths; only $tester may:"
		printf '  %s\n' $tests
		failed=1
	fi
done < <(git log --no-merges --format='%H%x09%an' "$base..$head")

if [ "$failed" -ne 0 ]; then
	exit 1
fi
echo "test-guard: every test change in $base..$head is authored by $tester."
