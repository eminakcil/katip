# 0009. Agent pipeline configuration

- Status: Accepted
- Date: 2026-11-03

## Context

`docs/agent-pipeline.md` specifies a tester → implementer → reviewer pipeline on GitHub Actions and lists five open decisions: account type, model per role, Claude authentication, auto-merge, and mutation threshold.

## Decision

1. **Account:** The repo stays on the personal account (`eminakcil/katip`). Labels (`agent:ready`, `agent:tests-ready`, `agent:round-1`, `agent:round-2`, `needs-human`) are the pipeline's state machine. A Projects board, if used, is the owner's view only, driven by GitHub's built-in automations; agents do not touch it.
2. **Models:** tester and reviewer use `claude-opus-5-5`; implementer uses `claude-sonnet-5-5` (its work is constrained by tests). Each is one line in its workflow.
3. **Claude auth:** `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` (subscription), shared by all three workflows.
4. **Auto-merge:** The implementer enables `gh pr merge --auto --squash` only when the repository variable `AUTO_MERGE` is `true`. It starts as `false`: in Phase 2 the owner merges every PR. Flipping the variable in Phase 3 needs no workflow change.
5. **Mutation testing:** Stryker on `packages/core` only, `break` threshold 70%. Incremental (changed files) on PRs, full on `main`. Raise to 80% after calibration if comfortably met.

## Consequences

- No repo transfer; the URL stays stable. If board automation by apps becomes necessary, moving to a free organization is a new ADR.
- Bot runs share the subscription's usage limits with interactive Claude Code use; switching to `ANTHROPIC_API_KEY` is one secret and one workflow input.
- Sonnet implementer output may need more review rounds; if calibration shows that, move it to Opus.
- Adapters are not mutation-tested; they must stay thin, with logic pushed into core.
