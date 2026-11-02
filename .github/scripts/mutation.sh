#!/usr/bin/env bash
# Stryker on packages/core (ADR 0009). With a base ref, mutates only core source
# files changed since it; exits 0 when there are none, so the required check
# always reports. Without a base ref, mutates all of core.
# Usage: mutation.sh [base-sha]
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [ -n "${1:-}" ]; then
	changed=$(
		git diff --name-only --diff-filter=ACMR "$1...HEAD" -- packages/core/src |
			grep -E '\.ts$' |
			grep -vE '\.test\.ts$|^packages/core/src/ports/|^packages/core/src/index\.ts$' || true
	)
	if [ -z "$changed" ]; then
		echo "mutation: no mutable core source changed; nothing to check."
		exit 0
	fi
	mutate=$(printf '%s\n' "$changed" | sed 's#^packages/core/##' | paste -sd, -)
	echo "mutation: mutating $mutate"
	cd packages/core && npx stryker run --mutate "$mutate"
else
	echo "mutation: full run on packages/core"
	cd packages/core && npx stryker run
fi
