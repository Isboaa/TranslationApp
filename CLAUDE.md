# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (http://localhost:3000)
npm run build    # Production build
npm run start    # Run production build
```

To expose the dev server on the local network (required for iPhone testing):
```bash
npx next dev -H 0.0.0.0
```

There are no tests or linting scripts configured.

## Architecture

Single Next.js App Router app with one API route and one page. No database, no auth, no external state.

**`src/app/page.tsx`** — the entire frontend. Client component that manages all state: input text, loading, result (translations + base64 audio). Audio blob URLs are created lazily via `useRef` to avoid re-creating them on re-render and are revoked before each new generation.

**`src/app/api/generate/route.ts`** — the entire backend. Three sequential stages:
1. One `gpt-4o-mini` call translates all sentences at once, returns `{"translations": [...]}` via `response_format: json_object`
2. All TTS segments generated in parallel via `Promise.all` — 3 per sentence (IT, NO, IT), voices `nova` for Italian and `alloy` for Norwegian, format `pcm`
3. Raw PCM buffers concatenated with zero-filled silence buffers, then a 44-byte WAV header is prepended manually

The response is JSON with `translations`, `italianText`, and `audioBase64` (base64-encoded WAV). No files are written to disk.

**Audio format detail:** OpenAI TTS `pcm` format returns raw 24kHz 16-bit mono PCM with no headers. Silence is `Buffer.alloc(samples * 2)` (zeros). The WAV header is written manually in `toWav()`.

## Git workflow

After every meaningful change, commit and push to GitHub:

```bash
git add <files>
git commit -m "short description of what changed and why"
git push
```

Commit often — after each feature, fix, or logical unit of work. Never batch unrelated changes into one commit. This ensures we never lose work and can roll back to any point.

## Key constraints

- `maxDuration = 60` on the route — Vercel Hobby times out at 10s (fits ~5 sentences), Pro allows 60s
- Input is stripped of Notes-app bullet markers (`•`, `-`, `*`, numbered lists) before sending to the API
- Max 50 sentences enforced server-side
- `.env.local` is gitignored — `OPENAI_API_KEY` must be set locally and in Vercel environment variables
