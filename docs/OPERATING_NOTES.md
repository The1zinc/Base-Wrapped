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

## Deep-Link Address Validation

- Treat query input as untrusted and normalize before use.
- Auto-load only strict `0x` plus 40-hex addresses.
- Keep invalid links non-fatal so manual input remains available.

## Share Message QA

- Ensure the share card includes badge and 30-day activity stats.
- Test native share and clipboard fallback paths.
- Keep share text short enough for social preview readability.

## Theme Persistence Validation

- Toggle theme, reload, and verify the saved mode is restored.
- Validate behavior when local storage is blocked.
- Check contrast quality in both theme variants.

## Mobile Safe-Area Review

- Confirm top and bottom safe-area padding on modern devices.
- Verify action buttons remain reachable near gesture bars.
- Check long wallet addresses do not break card layout.

## CSP Rollout Verification

- Inspect deployed response headers for expected CSP values.
- Watch console logs for blocked script or fetch requests.
- Document each allowed origin with a short reason.

## HSTS Rollout Caveats

- Enable HSTS only after HTTPS behavior is stable.
- Avoid strict transport on temporary preview domains.
- Capture rollback considerations in release notes.

## README Ownership

- Update setup steps whenever deployment prerequisites change.
- Refresh command examples when scripts are adjusted.
- Treat outdated setup docs as release blockers.

## Incident Severity Ladder

- Sev 1 means wallet lookup is broadly unavailable.
- Sev 2 means degraded behavior with workable fallback paths.
- Sev 3 means cosmetic or low-impact presentation defects.

## Timeout Retry Guidance

- Advise users to retry once when explorer requests time out.
- Escalate after repeated failures across multiple addresses.
- Keep support responses clear and action oriented.

## Invalid Address Triage

- Reject shortened values and non-hex prefixes.
- Trim pasted text to remove accidental punctuation.
- Use brief error copy that explains the expected format.

## Snapshot Metric Definitions

- `30d tx` counts transactions inside the rolling 30-day window.
- `Active days` counts unique UTC dates with observed activity.
- `Largest move` tracks the biggest transfer in the same period.

## Badge Threshold Review

- Revisit badge breakpoints quarterly using recent usage patterns.
- Favor small changes to reduce abrupt label swings.
- Record threshold updates in release notes.

## Transaction Cap Rationale

- Bound large payloads to avoid heavy client memory spikes.
- Keep the cap high enough to preserve representative recent behavior.
- Re-evaluate cap values when API response sizes change.

## Browser Support Baseline

- Target current Chrome, Safari, and Firefox versions.
- Allow graceful fallback when native share is unavailable.
- Avoid blocking releases on obsolete browser-only issues.

## Analytics Verification

- Check that post-deploy page activity is visible in analytics dashboards.
- Correlate traffic changes with release timestamps before escalating.
- Document expected delays for fresh telemetry pipelines.
