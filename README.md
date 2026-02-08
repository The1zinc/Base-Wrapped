# Wallet Wrapped (Base Mini App)

A no-backend Base mini app that turns any wallet into a shareable onchain recap.

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

## Base mini app setup checklist

1. Update `public/.well-known/farcaster.json` URLs from the placeholder domain to your real domain.
2. Keep `"noindex": true` while testing.
3. Generate `accountAssociation` values from Base Build preview/account tool.
4. Paste `accountAssociation` values into `public/.well-known/farcaster.json`.
5. Redeploy.
6. Share your app URL once in Base App to trigger indexing.

## Why this fits Vercel Hobby

- No persistent backend services
- No database maintenance
- No scheduled jobs
- Mostly static UI + direct read calls to public APIs

## Useful commands

```bash
npm run dev
npm run lint
npm run build
```
