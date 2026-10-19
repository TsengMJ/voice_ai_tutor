# Development Workflow

This document covers how I work with Coding Agents and how I used them to build this project.

## Table of Contents

### Part I — How I Work with AI
1. Treat Coding Agents Like Team Members
2. Research & Planning
3. Parallel Execution & Review

### Part II — Project Implementation
1. Development Time & Scope
2. AI Tools & Models
3. Product Decisions & Features
4. Implementation Workflow
5. Testing & Iteration
6. Engineering Trade-offs & Reliability

---

# Part I — How I Work with AI

## 1. Treat Coding Agents Like Team Members

I have **4 years of experience as a Tech Lead**, so I'm used to assigning, tracking, and coordinating multiple tasks across different team members.

I've found that the same approach works well with Coding Agents.

I usually run multiple Cursor conversations in parallel, each with a clear responsibility.

| Agent Conversation | Responsibility |
|---|---|
| **Frontend** | UI/UX improvements and responsive design |
| **Backend / Data Flow** | APIs, session lifecycle, persistence, and integration |
| **Research / Review (1–3)** | Investigate technical options, identify risks, and review implementations |

For example, while one agent is implementing a feature, I might ask other agents to investigate:

- What retry and recovery mechanisms are already in place?
- Where could bottlenecks appear under higher concurrency?
- What risks exist in Redis-to-PostgreSQL persistence?
- What solutions are available, and what are their trade-offs?

I review the findings, decide which changes are worth making, and assign follow-up tasks.

Sometimes multiple agents are planning or implementing changes simultaneously, as long as their tasks don't conflict.

**The workflow is similar to managing an engineering team: delegate tasks, track progress, review results, and coordinate the next steps.**

## 2. Research & Planning

I use **Cursor Plan Mode for most non-trivial changes**.

My typical workflow:

**Requirement → Research → Plan → Review → Implement → Validate**

When working with unfamiliar technologies, I ask AI to:

1. Research available solutions and compare trade-offs.
2. Find relevant industry practices and official documentation.
3. Verify important assumptions through small POCs or source-code inspection.

For example, before implementing the LiveKit architecture, I asked the agent to inspect the installed SDK source and verify:

- Barge-in and interruption support.
- Text input handling.
- Switching between voice and text modes.
- Agent tool support.

I review the implementation plan before coding, especially decisions related to architecture, reliability, and performance.

For small changes, such as adjusting an isolated UI component, I usually skip the planning step.

## 3. Parallel Execution & Review

Once a task is planned, I assign it to an agent for implementation.

For larger tasks, I often have other agents review the existing implementation or research potential issues in parallel.

If a review identifies a significant problem, I create a separate task to address it.

I also use **Cursor User Rules** to maintain consistent development practices, including incremental commits, tests, and failure recovery conventions.

One thing I've noticed is that Coding Agents can miss reliability, scalability, or security considerations in their initial implementation.

So I usually get the core functionality working first, then use focused review and improvement cycles to address those concerns.

---

# Part II — Project Implementation

## 1. Development Time & Scope

### Development Time

**The project was implemented across three separate development sessions, with approximately 2 hours of active development time in total, excluding documentation and extended periods when I was away while AI agents were running.**

The time excludes:

- Writing and organizing documentation.
- Long periods when AI prompts were running unattended while I was away from the computer.

This was a 2-hour active development target, rather than a single continuous 2-hour session.

### Project Scope

I focused on two core pages:

- **Practice Page:** Real-time voice conversations with an AI tutor.
- **Dashboard:** Learning progress, session history, and feedback.

Given the limited time, I prioritized the core tutoring experience.

## 2. AI Tools & Models

### Development Tools

| Tool / Model | Usage |
|---|---|
| **Cursor + Claude Opus** | Initial research, architecture planning, and implementation |
| **Cursor Auto** | Subsequent development, debugging, and reviews |
| **Cursor Plan Mode** | Architecture and implementation planning |
| **Cursor Web Search** | Product UX research, technical research, and documentation |
| **Cursor User Rules** | Incremental commits, tests, and failure recovery conventions |
| **Headless Chrome + Puppeteer** | Automated visual inspection and UI testing |

### Runtime AI Models

The final voice pipeline uses LiveKit Inference:

**Deepgram Flux (STT) → Gemini 2.5 Flash (LLM) → Cartesia Sonic-3 (TTS)**

Gemini Flash models are also used for contextual hints and session summaries.

The initial version used **Gemini Live (native speech-to-speech)**, which I later replaced after testing.

## 3. Product Decisions & Features

### 3.1 Real-Time Conversation Experience

I've used Speak before and recently explored Retell AI's real-time voice agent capabilities.

For this project, I wanted the conversation to feel natural, with:

- Real-time voice interaction.
- Support for interrupting the AI.
- Live transcription during conversations.

I initially used Gemini Live (native speech-to-speech) to test the experience.

However, the transcript only appeared after the AI finished speaking, which made the interface feel unresponsive.

I switched to a streaming **STT → LLM → TTS** pipeline so the transcript could appear while the user was still talking.

### 3.2 Product Features

Based on my experience taking English lessons with real tutors, I focused on three problems:

1. **Pronunciation practice:** When I can't pronounce something correctly, I want to hear it again and repeat it until I get it right.
2. **Conversation topics:** Without a clear topic or scenario, it's easy to run out of things to say.
3. **Learning feedback:** I want to review corrections after class instead of forgetting them.

I implemented:

- **Live corrections:** Pronunciation, grammar, tense, and vocabulary suggestions appear alongside the conversation, with audio playback for pronunciation practice.
- **Three practice scenarios:** Guided conversations with different contexts.
- **Contextual hints:** Suggestions when the learner doesn't know what to say next.
- **Session review:** Saved corrections and learning feedback.
- **Voice & text modes:** Both share the same conversation context.

## 4. Implementation Workflow

### Step 1 — Research & Architecture

I started with Claude Opus in Cursor Plan Mode.

Initial requirements:

- Practice and Dashboard pages.
- Gemini Live for the initial voice experience.
- React + Node.js, PostgreSQL, and Redis.
- Real-time conversations with interruption support.
- Data storage, performance, and security considerations.

I asked the agent to research existing voice AI tutoring products and technical approaches before generating an implementation plan.

After reviewing the plan, I made a few adjustments.

One important change was using **a single LiveKit session for both voice and text modes**, instead of maintaining separate conversation paths.

This simplified conversation context management.

### Step 2 — Core Implementation

I used Cursor to implement:

- Real-time voice interaction with LiveKit.
- Practice and Dashboard pages.
- Redis session state and PostgreSQL persistence.
- Shared voice and text conversation context.
- Learning corrections, hints, and session reviews.

I focused on getting the main user flow working first.

### Step 3 — Parallel Development & Review

After the first version worked, I split the remaining tasks across multiple Cursor conversations.

- **Frontend:** UI improvements and responsive design.
- **Backend:** Session management, persistence, and integrations.
- **Research / Review:** Reliability, scalability, and implementation risks.

I reviewed findings from the research agents and created follow-up tasks when necessary.

### Step 4 — Testing & Refinement

I tested the application as a learner and used Headless Chrome + Puppeteer for automated UI inspection.

Based on the results, I made changes to the voice pipeline, transcript synchronization, voice detection, and responsive layout.

## 5. Testing & Iteration

### Issues Identified and Addressed

| Issue | Improvement |
|---|---|
| Gemini Live transcript appeared only after the AI finished replying | Switched to streaming STT → LLM → TTS |
| Hints responded too slowly | Used a faster model and disabled reasoning |
| Voice detection was too sensitive and sometimes generated input during silence | Tuned voice activity and input handling |
| Transcript and speech were out of sync | Improved synchronization |
| Chat layout was awkward on mobile | Adjusted chat height, input placement, and responsive layout |

### Known Limitations

- **STT accuracy:** Still inconsistent in some cases. An English-specific model improved accuracy but didn't fully resolve it.
- **Transcription latency:** Sometimes the transcript takes too long to appear after the user finishes speaking.

These would be my next priorities for improving conversation quality.

## 6. Engineering Trade-offs & Reliability

With the limited development time, I focused on core functionality and implemented basic reliability mechanisms.

### What I Implemented

- **Horizontal scaling readiness:** Shared Redis state and distributed locking to support multiple backend instances.
- **Retries & timeouts:** Basic failure handling for external requests, using explicit configuration or SDK defaults.
- **Session lifecycle management:** A 30-second grace period for unexpected disconnections. If the client doesn't reconnect, the backend releases the associated Agent worker resources. LiveKit already handles connection recovery through mechanisms such as ICE restart.
- **Data persistence:** Redis for active session state and PostgreSQL for persistent records, with incremental flushing and recovery considerations.

### What I Deferred

- **Model provider failover:** Automatic switching between providers, potentially through a Model Gateway.
- **Provider-specific rate limiting:** Independent request and concurrency limits for each provider.
- **Request deduplication (singleflight):** Considered for hint generation, but the expected benefit was too small for the current workload.

I evaluated these based on failure probability, impact, existing mitigations, and implementation cost.

For the current scope, I decided not to add them.