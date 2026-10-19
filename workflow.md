# Development Workflow

How I used AI to research, plan, build, and validate this project — while keeping product decisions and engineering judgment in my own hands.

## 1. Scope & Product Decisions

With a **2-hour target for the initial implementation**, I focused on two pages:

- **Practice Page:** Real-time voice conversations with an AI tutor.
- **Dashboard:** Learning progress, session history, and feedback.

Having used Speak before, I felt that some AI language-learning interactions lacked the natural, uninterrupted flow of talking to a real person. More recently, I explored Retell AI's real-time voice agent capabilities.

This shaped my main priority: **build a natural, real-time conversation experience, not a turn-by-turn recording interface.** Users should be able to speak freely and interrupt the AI at any time.

I researched STT → LLM → TTS versus native speech-to-speech approaches and chose the STT pipeline because live transcripts are particularly valuable for language learning.

### Product Features

My experience taking English lessons with real tutors also influenced three product decisions:

1. **Repeat until I get it right:** When I struggle with pronunciation, I want to hear the correct version and practice it repeatedly.
2. **Give conversations direction:** Without a topic or scenario, it's easy to run out of things to say.
3. **Make feedback actionable:** Corrections are more valuable when I can review them after class.

I translated these into a few focused features:

- **Live corrections:** Pronunciation, grammar, tense, and vocabulary suggestions appear alongside the conversation, with audio playback for pronunciation practice.
- **Three practice scenarios:** Enough variety to demonstrate guided conversations without overbuilding content.
- **Contextual hints:** Learners can request suggestions when they don't know what to say next.
- **Session review:** Corrections and learning feedback are saved for review after each session.
- **Voice & text modes:** Both share the same conversation context.

My priority was **depth of experience over breadth of features**.

## 2. AI Tools & Models

| Tool / Model | How I Used It |
|---|---|
| **Cursor + Claude Opus** | Initial research, architecture planning, and implementation |
| **Cursor Auto** | Subsequent development, planning, debugging, and reviews |
| **Cursor Plan Mode** | Review architecture and implementation plans before coding |
| **Cursor Web Search** | Research product UX, industry practices, and official documentation |
| **Cursor User Rules** | Enforce incremental commits, tests, and failure recovery conventions |
| **Headless Chrome + Puppeteer** | Automated visual inspection and UI testing |

**Runtime AI:** Deepgram Flux (STT) → Gemini 2.5 Flash (LLM) → Cartesia Sonic-3 (TTS), through LiveKit Inference.

Gemini Flash models were also used for hints and session summaries.

## 3. My AI-Assisted Development Workflow

### Step 1 — Research First, Then Plan

I started with Claude Opus in Cursor Plan Mode, providing several requirements:

- Two core pages: practice and dashboard.
- An STT pipeline, with AI proposing model options for my review.
- React + Node.js, with PostgreSQL and Redis from the first version.
- A clear explanation of data storage, performance, and security considerations.
- Retell-style real-time conversations with interruption support.

Before generating the implementation plan, I asked AI to research mainstream voice AI tutors and their UX and technical approaches.

I then reviewed the proposed plan, questioned uncertain assumptions, and requested alternatives when necessary.

One important outcome was replacing separate voice and text conversation paths with **a single LiveKit session supporting both modes**, simplifying conversation continuity.

### Step 2 — Reduce Uncertainty Before Implementation

When facing unfamiliar requirements, I generally use AI for three things:

1. **Explore options:** Identify feasible technical approaches and their trade-offs.
2. **Research industry practices:** Understand how established products solve similar problems, preferably backed by official documentation.
3. **Validate quickly:** Use small POCs or source-code inspection to verify critical assumptions.

For example, before committing to the LiveKit architecture, I had the agent inspect the installed SDK source to verify barge-in, text input, audio mode switching, and tool support.

**My goal is to use AI to reduce uncertainty, not simply generate code faster.**

### Step 3 — Plan Before Coding

I use **Plan Mode for almost every meaningful change**.

My typical workflow:

**Requirement → Research → Plan → Review → Implement → Validate**

I only skip planning for small, well-defined changes, such as adjusting an isolated UI component.

From experience, Coding Agents don't always handle reliability, scalability, or security comprehensively in their first implementation, especially while requirements are evolving.

Therefore, I prefer to get the core experience working first, identify risks early, and address engineering concerns through focused iterations.

### Step 4 — Run Multiple Agents Like an Engineering Team

Once the first version was working, I started running multiple Cursor conversations in parallel.

| Agent Conversation | Responsibility |
|---|---|
| **Frontend** | UI/UX improvements and responsive design |
| **Backend / Data Flow** | APIs, session lifecycle, persistence, and integration |
| **Research / Review (1–3)** | Investigate implementations, identify risks, and propose improvements |

While one agent implements a feature, I use other conversations to investigate questions such as:

- What retry and recovery mechanisms do we currently have?
- Where might bottlenecks appear under higher concurrency?
- What could go wrong with Redis-to-PostgreSQL persistence?
- What are the possible solutions and their trade-offs?

When reviews reveal significant issues, I create a separate plan, inspect the proposal, and let the agent implement it.

I may have multiple plans being prepared or executed simultaneously, provided their changes are sufficiently independent.

With **4 years of experience as a Tech Lead**, this workflow feels natural to me. I treat Coding Agents much like engineering team members: delegate well-scoped tasks, review their progress, challenge their decisions, and coordinate the next steps.

The key is **parallelizing independent work without losing architectural control**.

## 4. Product Testing & Iteration

After implementing the core experience, I tested it as an actual learner rather than only checking whether features worked.

### Issues Identified and Addressed

| Issue | Improvement |
|---|---|
| Hints responded too slowly | Switched to a faster model and disabled reasoning |
| Voice detection was overly sensitive, sometimes generating input during silence | Tuned voice activity and input handling |
| Transcript and speech were noticeably out of sync | Improved synchronization |
| Chat layout was awkward, especially on mobile | Adjusted chat height, input placement, and responsive layout |

### Known Limitations

- **STT accuracy:** Still inconsistent in some cases. Switching to an English-specific model helped, but didn't fully resolve it.
- **Transcription latency:** The delay between finishing speech and seeing the transcript can occasionally be too long.

These directly affect conversation naturalness and would be my next UX priorities.

## 5. Engineering Trade-offs & Reliability

Given the time constraints, I prioritized the core experience rather than building a complete production-grade infrastructure.

However, I still wanted an architecture that could support future growth without major redesign.

### What I Implemented

- **Horizontal scaling readiness:** Designed for multiple backend instances, using shared Redis state and distributed locking for coordination.
- **Retries & timeouts:** Ensured external requests have basic failure handling, through explicit configuration or SDK defaults.
- **Session lifecycle management:** Implemented a 30-second grace period for unexpected client disconnections. If the client doesn't reconnect within that window, the backend releases the associated Agent worker resources. LiveKit already supports connection recovery through mechanisms such as ICE restart, so I focused on application-level resource cleanup.
- **Data persistence:** Used Redis for active session state and PostgreSQL for persistent records, with incremental flushing and recovery considerations.

### What I Deliberately Deferred

- **Model provider failover:** Automatically switching providers when one becomes unavailable, potentially evolving into a dedicated Model Gateway.
- **Provider-specific rate limiting:** Managing request limits and concurrency independently for each model provider.
- **Request deduplication (singleflight):** Considered but not implemented because I couldn't identify a meaningful benefit for the current workload. Hint generation could potentially benefit from it if multiple requests shared the same context, but the expected impact is limited.

My guiding principle is simple: **don't introduce complexity without a clear reason.**

For each improvement, I consider the likelihood of failure, its impact, existing mitigations, and whether the engineering cost is justified at this stage.

## 6. Validation & Quality

I don't consider AI-generated code complete just because it compiles.

Throughout development, I relied on automated checks, real application testing, and focused architecture reviews.

Some examples:

- **Security:** A smoke test exposed a demo-user isolation issue that could allow different visitors to access each other's sessions. I fixed the identity handling and added regression tests.
- **Reliability:** Reviews led to improvements in retry handling, Redis locking, incremental persistence, and reconnect recovery.
- **Performance:** Added latency tracking for turn completion, LLM first token, and TTS first audio.
- **Visual QA:** Used automated browser screenshots to catch layout and responsive design issues.
- **Real Voice Testing:** Used synthetic microphone input to exercise the actual LiveKit voice pipeline rather than relying only on unit tests.

The project also includes linting, type checks, unit/integration tests, and end-to-end smoke checks.

I use incremental commits and avoid bypassing failing tests simply to make an implementation pass.

## 7. Key Takeaway

For me, AI-assisted engineering is not just about generating code faster.

It's about **using AI to explore unfamiliar problems, make better technical decisions, execute independent tasks in parallel, and continuously validate the results.**

I see my role evolving from implementing every detail myself to acting as an **architect, reviewer, and engineering lead for multiple AI agents**, while remaining accountable for the final product.

The objective isn't to maximize how much code AI writes. It's to **deliver the right product, with the right trade-offs, in the shortest reasonable time.**