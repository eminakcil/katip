# 0004. Web sign-in with Google only

- Status: Accepted
- Date: 2026-11-03

## Context

The brief rules out a home-grown password system. The options were email magic link or Google sign-in, both supported by Better-Auth. v1 has one user, who has a Google account.

## Decision

Web sign-in uses Better-Auth's Google social provider only. The boilerplate's `emailAndPassword` option is turned off.

## Consequences

- No email-sending infrastructure (provider, sending domain, deliverability) is needed for v1.
- Requires one OAuth client in Google Cloud Console (client id and secret as env vars; redirect URI `<BETTER_AUTH_URL>/api/auth/callback/google`).
- Users without a Google account cannot sign in. Magic link can be added later as a Better-Auth plugin without changing the data model.
