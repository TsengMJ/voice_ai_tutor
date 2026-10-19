# Workflow

How I built this, which AI tools I used, and where I kept a human in the loop.

## Tools and models

| Tool                               | Model / version                            | Used for                                                                                                                                            |
| ---------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cursor** (desktop IDE)           | Claude Opus (Anthropic) as the agent model | Research, planning, implementation, tests, debugging, docs: almost all of the work happened in Cursor's agent.                                      |
| Cursor **Plan mode**               | same                                       | Turning the brief into a written, staged plan before any code.                                                                                      |
| Cursor **web search** tool         | same                                       | Product research (Speak, SpeakBuddy, Pimsleur, Retell) and LiveKit / Gemini Live capabilities.                                                      |
| Cursor **todo list**               | same                                       | Tracking the plan's five stages and keeping the agent on the current one.                                                                           |
| **User rules** in Cursor           | n/a                                        | Standing instructions: incremental commits, tests with every feature, never skip hooks or disable tests, stop and reassess after 3 failed attempts. |
| Headless Chrome + `puppeteer-core` | n/a                                        | Agent-driven screenshots of the real pages to check the visual design (and for this README).                                                        |

Runtime AI (part of the product, not the workflow): Deepgram Flux (`deepgram/flux-general-multi`) → Gemini 2.5 Flash → Cartesia Sonic-3 on LiveKit Inference for the tutor, and Gemini `gemini-2.5-flash` for hints and summaries. The first version used Gemini Live speech-to-speech; step 6 explains the switch.

## Process

### 1. Research before design (Plan mode)

I gave the agent the brief plus my hard requirements: a good-looking UI, a practice page and a stats dashboard, speech-to-speech with Gemini Live, typed and spoken modes that share one conversation, React + Node, a deliberate Redis/Postgres split, and attention to performance and security. I asked it to **research existing AI tutors first** and plan second.

Then I interrogated the plan with follow-up questions instead of accepting it:

- "Does Speak use an STT pipeline or speech-to-speech?" This set up the latency vs. control tradeoff that's now in the README.
- "Can it do Retell-style barge-in? What does the Node agent actually look like?" This forced a concrete agent design: tools, events, dependency injection.
- "Act as PO and architect; the goal is a demo that makes an interviewer want to talk to me." This produced **plan v2**. The biggest change was replacing a separate text-chat path (two brains, reconnect on every switch) with **one LiveKit room where voice and text toggle via RPC**. Plan v2 also added tutor-specific features (silent corrections, goals, review page), an explicit P0/P1/P2 cut line, sample data for the dashboard, and an English UI.

### 2. Verify the risky assumption first

The single-room design depended on four things working in the Node agent with Gemini Live: interruption, text input into a realtime session, toggling audio I/O, and tool calls mid-conversation. Without keys at that point, the agent **read the `@livekit/agents` and Google plugin source in `node_modules`** to confirm each capability. It confirmed `setAudioEnabled` on session input/output, the `lk.chat` text input callback, `START_OF_ACTIVITY_INTERRUPTS` turn detection, and tool support. It also found that the Gemini 3.1 live preview doesn't support `generateReply()` with instructions, which ruled that model out. The fallback design stayed documented in the plan in case any of this failed.

### 3. Build in stages, tests alongside

Order: shared core (schemas, store, prompts, protocol) → agent → API → web → hardening → docs. For logic with real rules, tests came first or alongside the code:

- `timing.ts`: text-time estimation rules.
- `streak.ts`: time-zone-aware streaks.
- Agent tool handlers and the mode controller, tested with an injected in-memory store and fake clock.
- `SessionService` lifecycle, ownership, and time cap.
- Postgres idempotency: flushing twice must not double count.

Integration tests run against throwaway Redis and Postgres containers (`docker compose --profile test`) and skip cleanly without them.

### 4. Let the checks find the bugs

Several real bugs were caught by automated checks rather than by reading code:

- **`scripts/smoke.sh` against the real compose stack** found that with demo seeding on, **every cookieless visitor was assigned the same demo learner**, so any two browsers could see each other's sessions. The fix: every visitor gets their own id and their own seeded sample history, with new identities rate-limited per IP. Tests were written first.
- The same smoke run surfaced a 502 after recreating the API container (nginx had cached the old IP) and showed that **nginx's `add_header` inheritance silently dropped all security headers** on page routes. Both are fixed, and the smoke script now asserts the headers.
- ESLint with the React Compiler rules flagged ref writes during render and synchronous `setState` in effects. I refactored to derive-state-during-render and keyed async state instead of suppressing the rules.
- A logic review of the stale-session sweeper found a condition that could never be true.

### 5. Look at the product, not just the code

The agent took headless-Chrome screenshots of every page (desktop and mobile) and reviewed them. That caught an empty 7-day chart (a Recharts animation; bars now respect `prefers-reduced-motion`), lowercase category titles, and sample transcripts that didn't contain the corrected phrases, which made the review page's highlighting invisible in the demo.

### 6. Change course when the experience says so

Once real keys were in, the first live run found that the agent never replied: every room join failed TLS because the slim Node image had no CA certificates. Fixing that exposed a product problem the source reading couldn't: with Gemini Live, my words appeared seconds after I stopped talking, because the realtime model only emits the user transcript when its reply is done. A "Got it / Thinking" cue helped, but didn't fix it.

I asked the agent how Retell gets its responsiveness (a streaming STT → LLM → TTS cascade with a dedicated turn-taking model) and to list the provider options for each stage that the installed Node SDK actually supports, checked against the LiveKit Inference type definitions in `node_modules`. I chose Deepgram Flux, Gemini 2.5 Flash and Cartesia Sonic-3, all on LiveKit Inference so no new keys were needed. Because the agent was a thin layer over the store, the switch touched `tutorSession.ts` and its config only; tools, Redis state, mode switching and the UI were unchanged. Per-reply latency became a small tested `LatencyTracker` (end of turn + LLM first token + TTS first audio).

To verify it without a person talking, the agent fed Chrome's fake microphone a WAV made with macOS `say` (English and Japanese) and watched the transcript: the learner's sentence now appears about a second after they stop, and the tutor's voice follows a couple of seconds later.

## How I keep AI output trustworthy

- **Plan first, in writing**, with a priority cut line, so the agent works toward a spec instead of improvising.
- **Ask "why" before "do."** The follow-up questions in step 1 changed the architecture more than any code review did.
- **Verify library claims against source**, not memory, for anything the design depends on.
- **Tests and a smoke script as the definition of done.** Lint, typecheck, 117 unit and integration tests, and 20 end-to-end checks run before every commit.
- **Small commits with "why" messages**, so each step is reviewable and revertible.

## What I'd do with more time

- Run the WAV-driven live voice check in CI with real keys, asserting on transcript and tool events instead of reading the log by eye.
- Add a custom Cursor rule capturing this repo's conventions (shared-core contract, store interface, test patterns) so future agent sessions start with them.
