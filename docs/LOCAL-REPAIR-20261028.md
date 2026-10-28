# Windows quota diagnostics and update transport repair

Base: upstream `v1.3.5-windows-stability-20261028` (`1fd014d`).

## Changes

- Honor an existing HTTPS/HTTP process proxy or the Windows current-user manual proxy for release checks and downloads. Keep the original release host allowlist, certificate validation, redirect restrictions, size bounds, and SHA256 checks. Proxy authorization is sent only on CONNECT, never to the origin.
- Recognize App Server `workspace routing discovery timed out/failed` responses as a retryable routing failure, rather than a generic login failure. Do not copy raw RPC messages into status files. Unverified account failures still clear old quota data.
- Keep the local public-reset reminder integration. The character library and other official Windows fixes come from upstream 1.3.5.
- Protected customized builds may check for newer official releases, but report an available update instead of silently overwriting local features.

## Verification and limitation

Live GitHub release metadata retrieval succeeded through the existing Windows proxy using the patched transport. Node regression tests cover proxy selection, routing-error classification, private-message redaction and protected update checks.

The affected machine's bundled CLI `0.164.0-alpha.11.1` and an isolated official stable CLI `0.165.0` both reproduced the account-routing timeout. Direct rate-limit requests and the desktop app's native usage-limit query also failed. This patch does not claim to repair the upstream account-routing service, infer a valid login from a failed request, or manufacture quota values. The error remains explicit until Codex can return an authenticated account and quota response.

Official protocol: https://learn.chatgpt.com/docs/app-server

Reset announcement data: https://codex-reset.com/developers
