# Parla — a voice AI speaking tutor

Short role-play conversations with a tutor that **listens, lets you interrupt, quietly notes what to fix, and checks off goals as you hit them**. Talk out loud, or switch to typing mid-conversation without losing context. A dashboard tracks practice time, streaks and recurring mistakes.

Built on **LiveKit Agents (Node)** with a streaming **speech-to-text → LLM → text-to-speech** pipeline (Deepgram Flux, Gemini 2.5 Flash, Cartesia Sonic-3 on LiveKit Inference), a Node API, React, Redis and Postgres. Everything runs with `docker compose up`.

| Dashboard                                            | Scenario picker                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| ![Dashboard](docs/screenshots/dashboard.png)         | ![Practice](docs/screenshots/practice.png)                           |
| **Session review**                                   | **Mobile**                                                           |
| ![Review](docs/screenshots/review.png)               | ![Mobile](docs/screenshots/mobile-dashboard.png)                     |
| **Hear a pronunciation**                             | **Playing**                                                          |
| ![Pronunciation](docs/screenshots/pronunciation.png) | ![Pronunciation playing](docs/screenshots/pronunciation-playing.png) |

> The live session page needs real LiveKit keys to show anything but its connection screen, so it's covered in the video walkthrough rather than a screenshot.

---

## Run it

Prerequisites: Docker with Compose v2, a free [LiveKit Cloud](https://cloud.livekit.io) project (its keys also pay for the tutor's speech and LLM through LiveKit Inference, so no Deepgram or Cartesia accounts are needed), and a [Google AI Studio](https://aistudio.google.com/apikey) key for hints and summaries.

```bash
cp .env.example .env      # fill in LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, GOOGLE_API_KEY, COOKIE_SECRET
docker compose up --build
open http://localhost:3000
```

The first visit gets a **labeled sample history** so the dashboard isn't empty (`SEED_DEMO=true`, the default). Set `SEED_DEMO=false` to start from a clean slate. Every variable is documented in [`.env.example`](.env.example); all secrets are read from the root `.env` only.

**Verify the stack** without opening a browser (works even with placeholder keys):

```bash
./scripts/smoke.sh        # 20 checks: headers, identity, session lifecycle, isolation, validation
```

**Develop and test:**

```bash
npm ci && npm run build -w @tutor/core
docker compose --profile test up -d redis-test postgres-test
REDIS_URL=redis://127.0.0.1:6380 TEST_DATABASE_URL=postgres://tutor:tutor@127.0.0.1:5433/tutor_test npm test
npm run lint && npm run typecheck
```

Without those two URLs the Redis and Postgres integration tests skip and the rest (unit + HTTP) still run.

---

## What it does (product choices)

I studied Speak, SpeakBuddy and Pimsleur before designing. The thing that separates a _tutor_ from a voice chatbot is structure and feedback, so that's where the effort went:

- **Role-play scenarios with goals.** Three scenes (Beginner → Advanced), each with three concrete goals ("Order a drink with one customization"). The tutor calls a `complete_goal` tool when you achieve one, and the checklist ticks live. Goals give a beginner something to say and give the session an end.
- **Corrections that don't interrupt.** Following Pimsleur's "don't break the flow" principle, the tutor only _recasts_ errors aloud (repeats your sentence correctly) and silently calls `record_correction`. A card appears beside the conversation with the original, the fix, a one-line why, and a category. Every correction card has a speaker button that plays the corrected wording in the practice language, both during the session and on the review page.
- **Words appear as you speak, and barge-in.** Speech-to-text streams your words into the chat while you're still talking, and a "Got it" / "Thinking" cue covers the gap before the reply. Voice activity detection stops the tutor the moment you start speaking; interrupted tutor turns are marked "cut off" in the transcript.
- **Voice ⇄ text, one conversation.** "I'm on the train" is a real use case. Switching modes is instant and the tutor keeps full context (see the architecture section for how).
- **Hints when stuck.** One tap asks Gemini Flash-Lite, with thinking kept minimal, for a natural next line plus translation; "Put it in the message box" pre-fills the composer. The slower text model is only used for the end-of-session summary.
- **Review page.** Coach's notes (strengths and up to 3 focus areas), goals, every correction, and the full transcript with your corrected phrases highlighted. Like SpeakBuddy, detailed feedback lives after the session so it doesn't crowd the live view.
- **Dashboard.** Today / week minutes, streak, average tutor response latency, 7-day chart, voice vs. text split, totals, recent sessions (resumable), and recurring mistake categories.
- **Three target languages** (English, Spanish, Japanese), so a reviewer can actually be a learner.
- **10-minute sessions.** Short, focused practice is the norm in this category, and it caps cost.
- **Accessibility and polish.** Reduced-motion support, keyboard-friendly controls, ARIA live regions on the transcript and agent state, IME-safe Enter-to-send, mic-permission fallback to text mode.

---

## Architecture

```mermaid
flowchart LR
  web[React web<br/>nginx]
  api[Node API<br/>sessions · stats · hints]
  agent[Node agent worker<br/>LiveKit Agents]
  lk[LiveKit Cloud]
  inference[LiveKit Inference<br/>Flux STT · Gemini Flash · Sonic-3 TTS]
  flash[Gemini Flash<br/>text]
  redis[(Redis<br/>hot session state)]
  pg[(Postgres<br/>history · read model)]

  web -->|REST /api| api
  web <-->|WebRTC audio · lk.chat text · RPC · events| lk
  lk <--> agent
  agent <-->|audio in · text · audio out| inference
  agent -->|turns · corrections · goals · timings| redis
  api --> redis
  api -->|flush every 15s · on end| pg
  api -->|hint · summary| flash
```

The code is split along the three concerns the brief asks for:

| Layer                     | Where                                                       | Responsibility                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Session management**    | `apps/api` (`SessionService`, `Flusher`, `http/learner.ts`) | Anonymous identity, create/resume/end, LiveKit tokens + agent dispatch, ownership checks, rate limits, time cap, persistence to Postgres, summaries.        |
| **Conversation handling** | `packages/core` (`SessionStore`, `prompts`, `protocol`)     | The conversation record (turns, corrections, goals, timings) behind one interface with Redis and in-memory implementations; prompt assembly; wire protocol. |
| **Voice / AI layer**      | `apps/agent`                                                | The live tutor: STT → LLM → TTS session, tools, mode switching, transcript recording, latency metrics. Talks to the rest of the system only via the store.  |

`packages/core` is the contract: the API, agent and web app all import the same zod schemas, scenario definitions and event types, so a field rename is a compile error everywhere instead of a runtime surprise.

### Lifecycle of a session

1. `POST /api/sessions` creates the session in Redis (and ends any previous active one).
2. `POST /api/sessions/:id/connection` returns a **10-minute token scoped to a fresh room** (`tutor-{sessionId}-{random}`). The token embeds an explicit **agent dispatch with `{ sessionId }` metadata set server-side**, so a client can't point the agent at someone else's session.
3. The agent joins and validates: the session exists, is active, its current room matches, and time remains. It loads the last 20 turns into the model's chat context and completed goals into the instructions, then greets (or says "welcome back" when resuming).
4. During the conversation the agent appends turns, corrections, goals, voice time and latency samples to Redis and marks the session dirty. It publishes `turn` / `correction` / `goals` / `mode` / `time_up` events to the browser on a data topic.
5. The API's flusher copies dirty sessions into Postgres every 15 s. It claims a batch, appends only turns past the sequence already stored, upserts corrections by id, recomputes `daily_stats` for that learner-day, then acknowledges the claim. A Redis lock keeps flush and end from writing the same session at once, and a snapshot older than the row already stored is ignored. A claim left behind by a replica that died mid-write goes back on the queue.
6. `POST /api/sessions/:id/end` takes the same lock, does a final flush, generates the summary (Gemini Flash, with a deterministic fallback), and deletes the LiveKit room.

A short network blip stays in the same room: the page shows "Reconnecting", and once LiveKit is back it fills in any turns the outage dropped. Refreshing the page, or a drop that does not recover, repeats step 2: a new room, a new agent, history reloaded from Redis. The old room's agent closes when the learner leaves (or when LiveKit closes the empty room), and a late dispatch for a stale room sees the room name no longer matches and leaves without speaking.

---

## Key decisions and tradeoffs

**A streaming STT → LLM → TTS pipeline, not speech-to-speech.** I had already looked at both. Speech-to-speech keeps audio in one model, but the learner's transcript usually arrives only at the end of the turn, after the reply has started. This is for learning a language: seeing what was heard is the feedback, so the words need to show up while you are still talking. Streaming speech-to-text does that, and splitting the pipeline gives control over each stage:

- **Deepgram Flux for speech-to-text.** Interim words stream into the chat while you talk, and Flux decides end of turn from the words and the pause together (`turnDetection: 'stt'`), so the tutor neither cuts you off mid-thought nor waits on a fixed silence timer. English practice uses the English model; Spanish and Japanese stay on the multilingual model with the practice language as a hint.
- **Gemini 2.5 Flash for the tutor.** Fast first token and reliable tool calls (`record_correction`, `complete_goal`).
- **Cartesia Sonic-3 for text-to-speech.** Very low time to first audio, and one multilingual voice covers English, Spanish and Japanese. Cartesia is asked for a timestamp on every word, so the tutor's transcript appears as each word is spoken.
- **Silero VAD for barge-in.** It runs locally in the agent and stops the tutor's audio as soon as you start talking. The Listening cue waits a fraction of a second so a noise blip does not flash the bubble; the words themselves are never thrown away after they appear.

All three models run on **LiveKit Inference**, billed to the LiveKit project, so there are no extra vendor keys and the agent does not hold a Google key. Each model is an env var (`STT_MODEL`, `LLM_MODEL`, `TTS_MODEL`, `TTS_VOICE`), so swapping a vendor is a config change. The cost of this choice: three hops instead of one, so latency is the sum of the stages, and the tutor hears words rather than tone. Response latency is measured per reply as end of turn + LLM first token + TTS first audio, and shown on the review page and dashboard (about 2–3 s through Docker Desktop on a laptop in my tests).

**Voice and text share one agent session.** The obvious design is a separate text path (REST → text LLM) with a reconnect on every switch. That gives the tutor two brains, and switching takes seconds. Instead, the browser stays in the room: text goes over LiveKit's `lk.chat` stream into the same LLM conversation, and a `tutor.set_mode` RPC toggles the agent's audio input/output. Switching is instant and context is literally the same conversation. With the pipeline, text mode simply skips speech-to-text and text-to-speech, so a typed turn costs only LLM tokens.

**Tools for structured feedback, not post-hoc parsing.** Corrections and goals arrive as typed tool calls validated with zod at the moment they happen, so the UI can react live and the data is clean enough to aggregate on the dashboard. Unknown goal ids are rejected without touching state, so the model can't invent progress.

**Redis for live state, Postgres for history.** This split is the core of the data design:

| Data                                                               | Store                                   | Why                                                                                                                 |
| ------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Active session (mode, room, timers), turns, corrections, goals     | **Redis** (hash / lists / set, 24h TTL) | Written on every turn by the agent; O(1) appends; any agent/API instance can pick a session up (no sticky routing). |
| Active session per learner, dirty-session set, rate-limit counters | **Redis**                               | Ephemeral coordination data.                                                                                        |
| Learners, sessions, turns, corrections, summaries                  | **Postgres**                            | Durable history, the review page, and relational queries.                                                           |
| `daily_stats` (per learner-day, in the learner's time zone)        | **Postgres**                            | The dashboard reads a small pre-aggregated table instead of scanning turns.                                         |

The agent never touches Postgres, which keeps the realtime path free of slow queries. The flusher bridges the two stores asynchronously. A failed flush is re-queued. Hints, LiveKit room deletion, Redis turn writes, and the browser's reads are retried once or twice; a session summary is not, and a Redis command that timed out is not sent again. Creating a session takes a per-learner lock so two clicks cannot leave two active sessions. The tradeoff is that the dashboard can lag a live session by up to 15 s; ending a session flushes immediately.

**Measuring "usage time" honestly.** Voice time is measured by the agent while audio mode is on. Text time can't be observed directly, so it's estimated from the gaps between typed messages: each gap counts up to 60 s, and a burst after a long pause counts 15 s. This is documented in `packages/core/src/timing.ts` and unit-tested.

**Anonymous identity instead of accounts.** A signed, httpOnly, `SameSite=Lax` cookie holds a random learner UUID. That's enough to make the dashboard personal and to isolate data, without building auth for a demo. Each new visitor gets their own sample history (rate-limited per IP so cookieless scripts can't flood the DB).

**Explicit agent dispatch.** The agent registers under a name and only joins rooms the API dispatches it to, with metadata the client can't forge. Rooms aren't created by clients guessing names.

**Scope vs. the 2-hour guideline.** I went well past two hours, deliberately: the brief rewards product sense, and a tutor without feedback is just a voice demo. I kept a strict priority order (working compose stack and interruptible voice first, then the mode switch, then tutor features, then dashboard polish) so that any cut-off point would still have produced working software.

---

## Security

- Secrets exist only in the containers that need them: `LIVEKIT_API_SECRET` in the api and agent, `GOOGLE_API_KEY` and `COOKIE_SECRET` in the api (compose blanks the Google key for the agent). The browser bundle has no keys, and `.env` is git-ignored.
- LiveKit tokens last 10 minutes, are limited to one room, and carry server-set dispatch metadata. RPC calls to the agent are accepted only from the session's learner identity.
- Another learner's session returns **404** (not 403, so ids can't be probed). Session ids are validated as UUIDs.
- zod validation on every request and RPC payload; 16 KB JSON limit; 500-character messages; 10-minute session cap enforced by both the API (409 on reconnect) and the agent (timer → graceful goodbye).
- Redis-backed rate limits on all routes, plus tighter limits on session creation, token issuance, hints, and new identities.
- Scenario and system instructions live on the server; learner text only enters the conversation as user input.
- `helmet` on the API; nginx sends CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and `Permissions-Policy` (microphone only, same origin) on every response.
- Containers run as non-root; Postgres and Redis aren't published to the host; logs redact cookies and tokens and never include transcripts.

---

## Scaling to 10,000 concurrent sessions

What already scales: audio never touches the Node API (browser ↔ LiveKit ↔ agent). The API is stateless behind the cookie, and agents are stateless because session state lives in Redis. Context is capped at 20 turns, and the dashboard reads a pre-aggregated table.

What I'd change:

1. **Agent workers.** Each session is a long-lived job: audio in and out, one streaming STT socket, one TTS socket, and an LLM request per reply. VAD runs locally in the worker, so CPU per session is real but small. Run agent workers as an autoscaled deployment. LiveKit dispatch load-balances jobs across registered workers and each worker reports itself full at a CPU threshold, so scale on CPU and active jobs per pod. Drain workers gracefully on deploy.
2. **Model capacity and cost.** 10k concurrent sessions is a quota and cost question before it's an engineering one. Cost per session is roughly STT minutes (while voice is on) + TTS characters (tutor speech) + LLM tokens per reply; text mode pays only the LLM part. I'd agree inference quota with LiveKit (or go direct to the vendors with our own keys at that volume), configure LiveKit Inference fallbacks (for example Nova-3 behind Flux), and add admission control (queue or "try again in a minute" instead of failing mid-session).
3. **Redis.** Move to a managed Redis cluster. Keys are already per-session, so hash-tag them (`session:{id}:*`) to keep a session on one shard. Rate limiting and the active-session index work as they are.
4. **Persistence.** Replace the polling flusher with a stream (Redis Streams or Kafka): agents emit turn and correction events, and a pool of consumers batch-inserts into Postgres. That removes the 15 s scan and spreads write load.
5. **Postgres.** Partition `turns` by month, put the dashboard and review reads on a replica, use PgBouncer for connections, and update `daily_stats` incrementally from the event stream instead of recomputing per flush.
6. **API.** Horizontally scaled behind a load balancer. Move summary generation to a background job so `end` returns instantly and the review page polls or streams it in.
7. **Observability.** Per-session traces (join time, per-stage STT / LLM / TTS latency, interruptions), SLOs on response latency, and alerts on dispatch failures. The latency metric collected now is the seed of this.
8. **Media.** LiveKit Cloud already handles SFU scaling and geo-routing. Self-hosting would mean a LiveKit cluster per region with Redis-backed routing.

---

## Repo layout

```
apps/
  agent/     LiveKit worker: tutorSession (STT → LLM → TTS), tools, mode controller, turn recorder, latency tracker
  api/       Express API: session service, flusher, Postgres repository, LiveKit + Gemini gateways
  web/       Vite + React + Tailwind: dashboard, practice, live session, review
packages/
  core/      Shared schemas, scenarios, prompts, wire protocol, Redis/in-memory session store
db/migrations/   SQL migrations, applied automatically on API start
scripts/smoke.sh End-to-end check against the running stack
```

Tests: 155 across the workspaces (Vitest). They cover prompt assembly, streak and timing math, protocol decoding, the Redis store, agent config, tool handlers, mode switching and latency accounting, the session service (including locks and a single active session under a race), the HTTP surface (auth, isolation, validation, rate limits), Postgres aggregation, incremental flush and stale-snapshot rejection, flusher claims, retries, demo seeding, transcript highlighting, live transcript drafts, speech cues, and reconnect merge.

## Known limitations

- The tutor hears words, not tone: hesitation and pronunciation only reach it through what speech-to-text writes down.
- Text time is an estimate (see above).
- Speech and LLM usage runs on LiveKit Inference credits; a free LiveKit project has a limited monthly allowance.
- No user accounts. Clearing cookies starts a new learner.
- No phoneme-level pronunciation scoring.

## Video walkthrough script (~3 min)

1. **Dashboard (15 s).** Sample history, streak, latency, recurring mistakes.
2. **Practice.** Pick _Ordering coffee_ in Spanish or English.
3. **Voice.** Talk, interrupt the tutor mid-sentence, make a mistake on purpose so a correction card pops up, and watch a goal tick.
4. **Switch to Text.** "On the train": type a reply, and the tutor answers in context. Switch back to Voice.
5. **Hint.** Tap "Get a hint" and use it.
6. **End & review.** Summary, highlighted transcript, corrections.
7. **Dashboard again.** The numbers have moved.
8. **Architecture (30 s).** The diagram, the one-room decision, the Redis/Postgres split, and the 10k plan.
