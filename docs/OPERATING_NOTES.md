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
