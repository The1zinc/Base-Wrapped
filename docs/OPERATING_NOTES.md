# Operating Notes

This document captures lightweight release and maintenance guidance for Base Wallet Wrapped.

## Release Rhythm

- Keep deployments small and reversible; avoid shipping unrelated changes together.
- Prefer short release notes that describe user-facing outcomes and risk level.
- Reserve larger cleanup refactors for dedicated maintenance windows.

## Pre-Deploy Dry Run

- Run `npm run lint` and `npm run build` before release merges.
- Confirm `NEXT_PUBLIC_URL` matches the target deployment host.
- Check that no debug copy or placeholder text remains.

## Explorer API Availability

- Ping Base Blockscout endpoints before release announcements.
- Retry failed reads once before escalating incidents.
- Log outage windows for support visibility.

## Wallet Connect Sanity Test

- Verify connect flow using an injected wallet provider.
- Check cancel behavior and user-facing error copy.
- Confirm manual address mode still works after failed connect attempts.
