# 0010. Local agent pipeline (trial)

- Status: Proposed (trial)
- Date: 2026-11-03

## Context

ADR 0009 runs the tester → implementer → reviewer pipeline as three GitHub Apps on GitHub Actions (`anthropics/claude-code-action`), handing work to each other through labels. Measured over the last 9 runs: about $1.5–2 per feature (API-equivalent), the tester (Opus, 35–50 turns) is the largest share, and every run had 1–8 permission denials. Debugging a bot run means reading Actions logs after the fact.

The integrity checks are tied to bot identities: `test-guard` only checks PRs authored by `eminakcil-implementer[bot]` and relies on a `tests-frozen` status that only the tester app can create. A PR opened by the owner passes silently. The `main` ruleset requires one approval, which the owner cannot give on their own PR.

## Decision

Trial running the same pipeline locally in Claude Code. GitHub runs CI only; PRs arrive already reviewed.

1. **Orchestrator:** the `/task <no>` skill (`.claude/skills/task/SKILL.md`) runs the phases spec → tests → impl → review → pr with four subagents in `.claude/agents/`: planner (Opus, read-only), tester (Opus), implementer (Sonnet), reviewer (Opus, read-only, fresh context). The skill, not the agents, does all `gh` writes.
2. **Acceptance criteria live in the issue** (issue form `.github/ISSUE_TEMPLATE/task.yml`). The owner writes them or approves the planner's draft; nothing proceeds past spec without explicit owner approval.
3. **State lives outside the session.** Issue: AC, `status:spec|tests|impl|review` label, `needs-human`, and a checkpoint comment after each phase (Done / Decided / Open). Git: branch `task/<no>-<short-name>` from `main`, one commit per phase, each with a `Phase: tests|impl|review-fix` trailer. `/task <no>` is idempotent and resumes from the label and the trailers; session context is disposable.
4. **Review:** at most two fix rounds, then `needs-human`. The owner merges after CI is green; squash merge only.
5. **Test integrity, two lines.** Threat model: agent mistakes, not a hostile bot.
   - Local: a `PreToolUse` hook (`.claude/hooks/guard-test-paths.mjs`) blocks the implementer from editing test paths and the tester from editing anything but test paths and port interfaces.
   - CI: `test-guard` checks commit order on non-bot PRs. Once a commit touches a path that is neither a test path nor a port interface, no later commit may touch test paths, and no commit may mix both, unless it has the trailer `Test-Change-Approved: eminakcil`. CI, lint and mutation config may not change on `task/*` branches. CI keeps running the base-branch copy of the script. The bot-PR branch of the script is unchanged during the trial.
6. **Ruleset:** required approvals go to 0; required status checks stay. The ruleset is exported to `docs/ops/ruleset-backup.json` before the change.
7. **Reversible trial.** The bot workflows are disabled with `gh workflow disable`, not deleted. `.github/claude/`, the app secrets and the apps stay. `main` before the trial is tagged `pipeline-bots-v1`. After 2–3 trial tasks the owner either accepts this ADR (superseding 0009, then a cleanup change removes the bot pipeline) or rolls back (`docs/agent-pipeline.md`, "How to roll back") and marks this ADR rejected.

Unchanged from ADR 0009: personal account, labels as the state machine, Stryker on `packages/core` with a 70% break threshold, no auto-merge.

## Consequences

- No bot identities: commits and PRs are authored by the owner. Agent runs share the interactive Claude Code subscription limits.
- Runs are visible and interruptible in the terminal; permission prompts can be fixed in `.claude/settings.json` instead of workflow YAML.
- The hook only sees `Edit`/`Write`-style tools. A file written through `Bash` bypasses it; CI `test-guard` catches that at PR time.
- The trailer `Test-Change-Approved: eminakcil` is a convention, not authentication. It records intent; it does not stop a determined writer.
- Re-evaluate Sonnet for the tester after the trial tasks: the tester was about half the bot cost.
