# Base Wallet Wrapped (Base Mini App)

A no-backend Base mini app that turns any wallet into a shareable onchain recap.

## Quick navigation

- [What this app does](#what-this-app-does)
- [Tech stack](#tech-stack)
- [Local development](#local-development)
- [Deploy on Vercel](#deploy-on-vercel-hobby-friendly)
- [Base mini app setup checklist](#base-mini-app-setup-checklist)
- [Useful commands](#useful-commands)

## What this app does

- Reads public wallet data from Base Blockscout API (no API key required)
- Builds a 30-day wrapped summary (activity, cadence, transfer profile)
- Lets users copy/share recap text directly
- Uses Mini App embed metadata so it can be launched in Base App clients

## Tech stack

- Next.js App Router
- Client-side fetches only (no DB, no cron, no server API routes)
- `@farcaster/miniapp-sdk` for `sdk.actions.ready()`

## Local development

1. Install dependencies:

```bash
npm install
```

2. Copy env template:

```bash
cp .env.example .env.local
```

3. Run:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Deploy on Vercel (Hobby-friendly)

1. Push this project to GitHub.
2. Import it into Vercel.
3. Add environment variable in Vercel project settings:

- `NEXT_PUBLIC_URL=https://your-project.vercel.app`

4. Deploy.

## Environment variable reference

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_URL` | Yes | `https://wallet-wrapped-mini.vercel.app` | Used for metadata, share links, and Farcaster embed URLs. |

## Base mini app setup checklist

1. Update `public/.well-known/farcaster.json` URLs from the placeholder domain to your real domain.
2. Keep `"noindex": true` while testing.
3. Generate `accountAssociation` values from Base Build preview/account tool.
4. Paste `accountAssociation` values into `public/.well-known/farcaster.json`.
5. Redeploy.
6. Share your app URL once in Base App to trigger indexing.

Production note: do not ship with empty `accountAssociation.header`, `accountAssociation.payload`, or `accountAssociation.signature` fields in `public/.well-known/farcaster.json`.

## Troubleshooting quick hits

- **Address rejected:** make sure the value is a full `0x` address with 40 hex characters.
- **Timeout while loading:** retry once; Blockscout latency can spike during chain traffic bursts.
- **Wallet connect unavailable:** use manual paste mode when no injected wallet provider exists.
- **Share dialog not opening:** some browsers block native share on desktop, so use copy fallback.

## Why this fits Vercel Hobby

- No persistent backend services
- No database maintenance
- No scheduled jobs
- Mostly static UI + direct read calls to public APIs

## Post-deploy verification checklist

1. Confirm app loads with no console errors on both mobile and desktop widths.
2. Run one wallet lookup and verify all key metrics render.
3. Test both share paths: native share (if supported) and clipboard fallback.
4. Open `/.well-known/farcaster.json` and validate the deployed host values.

## Support FAQ

### Why does the wrapped only cover 30 days?

The experience is tuned for a fast snapshot, so it prioritizes recent behavior over full history analytics.

### Does this app move funds or request wallet signatures?

No. It only reads public chain data and optionally asks wallet providers for the connected address.

## Useful commands

```bash
npm run dev
npm run lint
npm run build
```
