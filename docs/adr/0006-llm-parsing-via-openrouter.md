# 0006. LLM parsing via OpenRouter, Claude Haiku 5.5 by default

- Status: Accepted
- Date: 2026-11-03

## Context

Free-form Turkish text must become a structured item (type, title, dates, scope, priority). The owner already has an OpenRouter account and wants to be able to try any model. Volume is personal (tens of messages per day), but the project's stated depth is measuring field-level accuracy and comparing models, including a fine-tuned small model later.

## Decision

- Core defines an `InputParser` port: text + reference time + user timezone in, a candidate parse out.
- The production adapter calls OpenRouter's chat completions API. The model slug comes from env (`LLM_MODEL`); the default is Claude Haiku 5.5 (exact slug verified on openrouter.ai when the adapter is written).
- The adapter requests JSON output (structured outputs / JSON schema where the model supports it), but **core validates every parse with a Zod schema regardless**. Invalid output is retried once; if it still fails, the user is asked to rephrase. Invalid data never reaches the database.
- Every `inputs` row records the model slug (`model_version`) and the raw parse result.

## Consequences

- Swapping models is an env change; comparing models on the eval set needs no code change.
- Haiku is cheap at personal volume, so cost is not a constraint; accuracy on hard relative dates ("haftaya perşembe", "ay sonu") must be watched in the eval set, and the default can move to a larger model if it falls short.
- OpenRouter adds one network hop and a third party; a direct provider adapter can be added behind the same port.
- Structured-output support varies by model on OpenRouter, which is why schema validation lives in core, not in the adapter.
- Tests never call OpenRouter; core tests use a fake parser.
