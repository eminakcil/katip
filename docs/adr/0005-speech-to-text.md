# 0005. Speech-to-text: hosted API behind a port, provider deferred

- Status: Accepted
- Date: 2026-11-03

## Context

Telegram voice messages are in v1 scope. Running Whisper large-v3 locally on Turkish audio at chat latency needs a GPU, which would constrain hosting (ADR 0007). The voice feature is not part of the Phase 1 skeleton.

## Decision

- Core defines a `SpeechToText` port (audio in, transcript + model id out). Core never knows the provider.
- v1 uses a hosted Whisper-class API through an adapter. The provider (e.g. Groq or OpenAI) is chosen when the voice feature is built, with a short follow-up ADR.
- Local Whisper is not used in v1.

## Consequences

- No GPU requirement on the server.
- Raw audio reference, transcript and STT model id are stored on `inputs` regardless of provider, so the eval set is provider-independent.
- Switching to local Whisper or a fine-tuned model later is a new adapter, no core change.
- Audio is sent to a third party; acceptable for a personal v1.
