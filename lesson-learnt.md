# Lessons learnt: RailCite

> Every lesson cites a commit or a line in Obsidian `Case Study 5/RailCite — Project State.md` (cited as PS:line).

## Lessons

### L1 — Model parameters vary between models
- **Situation:** A live smoke test found that `claude-sonnet-5` rejects `temperature`. (8f82935, PS:74)
- **Decision/Outcome:** The parameter was removed from the call. (8f82935)
- **Lesson → Future Rule:** **Future Rule:** run a live smoke call whenever the model ID changes. Mocks don't catch parameters that the API rejects.

### L2 — A max_tokens limit silently truncated tool calls once the corpus grew
- **Situation:** The corpus grew past `max_tokens: 2000` in `synthesize.ts`. Tool calls were truncated, and `/api/query` returned 500s. (e1de64b, PS:197-198)
- **Decision/Outcome:** The limit was raised to 4096 tokens, with one bounded automatic retry. (e1de64b, PS:198)
- **Lesson → Future Rule:** **Future Rule:** treat a truncated tool call as a distinct, detectable failure. Size max_tokens for growth, and keep any retry bounded.

### L3 — A dev service worker served stale chunks
- **Situation:** In dev, the service worker served stale `/_next/static` chunks and fought HMR. (PS:219)
- **Decision/Outcome:** The worker now registers in production only. In dev it unregisters and clears its caches. The cache version was bumped from v2 to v3. (PS:219)
- **Lesson → Future Rule:** **Future Rule:** register PWA service workers in production only. Bump the `sw.js` cache version on any deploy that must reach returning users. (PS:236)

### L4 — The production branch was not main
- **Situation:** The Vercel Production Branch is `build/phase5`, not `main`. (PS:235)
- **Decision/Outcome:** Each commit was pushed to all three branches. Renaming the production branch is still pending with the owner. (PS:235, PS:267)
- **Lesson → Future Rule:** **Future Rule:** check which branch the host deploys from before trusting a push to main as a release.

### L5 — Running out of provider credits looked like a code bug
- **Situation:** Every `/api/query` call failed because the Anthropic credit balance was too low. Users saw a raw "Request failed (500)". (PS:248-249)
- **Decision/Outcome:** The credits were topped up. `Anthropic.APIError` now maps to a 503 `generation_unavailable` with a readable message. (03a0c32, PS:250)
- **Lesson → Future Rule:** **Future Rule:** map upstream provider failures to a clear 503 state, and set a spend alert so that credits can't silently run out. (PS:267)

### L6 — An answer cache must be conservative and fail open
- **Situation:** An answer cache was added for repeated and similar questions. (1afdedf, c187573, PS:253)
- **Decision/Outcome:** It matches on a Voyage cosine of 0.95 or more, so that a merely related question never gets another user's answer. Refusals are never cached. Every cache failure is swallowed, so the cache can't break a query. (PS:254-255)
- **Lesson → Future Rule:** **Future Rule:** a cache in front of an LLM must have a strict similarity threshold, must not store refusals, and must not be able to fail a request.

### L7 — Cache invalidation follows the corpus
- **Situation:** The cache could serve stale answers after ingests or across scopes. (affd500, b77f8d9)
- **Decision/Outcome:** The cache became scope-aware, and the corpus scripts now invalidate it. (affd500, b77f8d9)
- **Lesson → Future Rule:** **Future Rule:** every path that writes data must invalidate the caches that depend on it.

### L8 — Sign-out leaked the previous user's data
- **Situation:** After sign-out, the previous user's question and cited answer stayed on screen, and `railcite:last` and `railcite:draft` stayed in localStorage. This is a real leak on shared office machines. (a10e6c6, PS:258-259)
- **Decision/Outcome:** Sign-out now wipes query state and local storage. This was verified end to end. (a10e6c6, PS:258)
- **Lesson → Future Rule:** **Future Rule:** sign-out must clear all user-scoped client state, and there should be an E2E test for it.

### L9 — Citations must trace to their own source document
- **Situation:** The product promises traceable citations. (98a67db)
- **Decision/Outcome:** Every citation now traces to its own PDF. (98a67db)
- **Lesson → Future Rule:** **Future Rule:** a citation validator should check the link from each citation to its document, not just whether a citation exists.

## Reusable Rules for Future Projects
- Live-smoke the model call after any model change (L1).
- Turn provider outages into designed error states, with a spend alert (L5).
- Every write path invalidates the caches that depend on it (L7).
- Sign-out wipes client state, with an E2E test (L8).

## Candidate Global CLAUDE.md Improvements
- Add to "Make failure observable": a third-party billing or quota limit is a production dependency that needs an alert (L5).
