#!/usr/bin/env bash
# Fails if any commit authored or committed by the implementer bot in BASE..HEAD
# touches a test path (CLAUDE.md: **/*.test.ts and **/test/**).
# Usage: test-guard.sh <base-sha> <head-sha>
set -euo pipefail

base="$1"
head="$2"
bot="${IMPLEMENTER_BOT:-eminakcil-implementer[bot]}"
pattern='(^|/)test/|\.test\.ts$'


touched=$(
	{
		git log --fixed-strings --author="$bot" --name-only --format= "$base..$head"
		git log --fixed-strings --committer="$bot" --name-only --format= "$base..$head"
	} | sed '/^$/d' | sort -u
)

if [ -z "$touched" ]; then
	echo "test-guard: no commits by $bot in range; nothing to check."
	exit 0
fi

violations=$(printf '%s\n' "$touched" | grep -E "$pattern" || true)
if [ -n "$violations" ]; then
	echo "test-guard: $bot modified test paths, which only the tester may change:"
	printf '  %s\n' $violations
	exit 1
fi

echo "test-guard: $bot commits touch no test paths."
