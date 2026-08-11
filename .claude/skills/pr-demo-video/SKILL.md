---
name: pr-demo-video
description: >-
  Record a VIDEO / screencast demo of a PR or feature (not static screenshots).
  Use when asked to make a video of this working, record a demo for the PR, show
  the agent doing X on video, or add a voiceover to the demo. Covers browser UI
  flows and AI-agent/CLI flows. Works in Cursor Agent and Claude Code. Example
  scripts target SkyPortal; adapt CONFIG/FLOW per app/PR.
---

# PR demo videos

## Agent environments (Cursor + Claude Code)

This skill is discoverable from either agent:

| Agent | Project path | Personal path |
|-------|--------------|---------------|
| **Cursor** | `.cursor/skills/pr-demo-video/` | `~/.cursor/skills/pr-demo-video/` |
| **Claude Code** | `.claude/skills/pr-demo-video/` | `~/.claude/skills/pr-demo-video/` |

Trigger phrases: "record a video demo of this PR", "make a screencast of this working", "add a voiceover to the demo".

**Fluent Mobile note:** this app is Android-native (Expo). Playwright records a **browser** page. Use the UI-flow script for web surfaces or local HTML/dev tools under test; adapt CONFIG, selectors, cookies, and app boot steps at usage time. Do not rewrite the shared gotchas/scripts prophylactically.

Record a polished screencast of a PR working — a browser UI flow or an AI-agent/CLI flow — with an on-screen cursor, step captions, and an optional voiceover, then attach it to the PR. Sibling of `pr-screenshots` (that one is for static images; this is for motion).

Playwright records the page as native video (webm); ffmpeg converts to mp4. Everything visual is **injected into the page** (`overlay.js`) because Playwright video does **not** render the OS cursor.

## Two flavors

| Flavor | Script | Determinism | Infra |
|--------|--------|-------------|-------|
| **UI flow** (modals, forms, list changes) | `record_ui_flow.py` | Deterministic — scripted clicks | sqlite scratch DB is fine |
| **Agent/CLI flow** (chat → command → real output) | `record_agent_flow.py` | Non-deterministic — real LLM call | needs Postgres + uvicorn + a live target |

## Pipeline

1. Start the app in a worktree on the PR branch (see infra below); seed data; mint a session cookie.
2. Copy `record_*_flow.py` + `overlay.js` next to your scratch dir (or run in place); edit CONFIG + the FLOW section for the PR.
3. `cd <worktree> && <venv>/bin/python record_..._flow.py` → prints `VIDEO_WEBM=...`.
4. `./postprocess.sh <webm> <out.mp4> ["optional narration"]` → mp4 + verification frames (+ voiced mp4).
5. **Read the emitted `frames/*.png`** to confirm the flow looks right before delivering. Retake if not.
6. Deliver to `.playwright-mcp/pr-<N>-v<N>/` (gitignored). Attach to the PR via `gh api ... -X PATCH` (NOT `gh pr edit`, which no-ops on body-rewriting repos) or drag-drop; videos upload through GitHub's web UI (<10 MB).

## Gotchas (each cost real time — bake the fix in)

| Symptom | Fix |
|---------|-----|
| No cursor in the video | Inject one (`overlay.js`); drive with `page.mouse.move(x,y,steps=28)` before clicking so it glides |
| `wait_for_selector('#modal.hidden')` times out | A `.hidden` node isn't "visible". Use `state='hidden'` to wait for CLOSED |
| Clicking a checkbox → "tick-span intercepts pointer events" | Custom checkboxes are 0-size inputs under a visible tick. `el.evaluate('e=>e.click()')` or set state directly |
| Guided tour overlay eats clicks | Set the tour localStorage keys before load + remove `[id*=tour]` overlays (in `overlay.js`) |
| Agent recording hangs, assistant reply empty | sqlite: `NotSupportedError: contains lookup` in the chat message store. **Run the agent flow on Postgres** |
| Chat WebSocket never connects | `runserver` isn't ASGI enough here. Serve with **uvicorn** (`skyportal.asgi:application`) |
| Agent refuses kube command `ns='!'`/out-of-scope | Namespace not in scope. Set it at the source (WS `set_servers`, `'__all__'` sentinel) — the popover is racy |
| Approve button not found by text `✓` | The checkmark is an icon. Locate in JS (`textContent.trim()==='✓'`), glide, click |
| Agent picks the wrong command / stalls | LLM non-determinism. Use an imperative prompt ("Run kubectl get pods -A …"), 90s timeouts, retake |

## SkyPortal local infra

Stand the app up in a git worktree on the PR branch. Specifics for video:

- **Worktree** on the PR branch; use the **main checkout's poetry venv** (`poetry env info -p`) — fresh worktree venvs are empty.
- **UI flow → sqlite**: copy `.env` minus `DATABASE_URL`; run `migrate` and fake the ~12 Postgres-only migrations it chokes on (repository/pgvector + FK-fix migrations).
- **Agent flow → Postgres**: create an isolated DB (`createdb`, `CREATE EXTENSION vector`), point `.env`'s `DATABASE_URL` at it, `migrate` (clean, no faking), seed, drop it in teardown. sqlite cannot run the chat agent.
- **Serve**: UI flow works under `runserver`; agent flow needs `uvicorn skyportal.asgi:application --port 9137`.
- **Session cookie**: mint with `SessionStore()` in the Django shell (login form rejects shell-created users) — set `_auth_user_id/_auth_user_backend/_auth_user_hash`, `.create()`, use `.session_key`.
- **Kube target**: the SSRF guard blocks loopback/RFC1918, so a local `kind` cluster must be reached via a **public tunnel** — `ngrok tcp <api-port>`, rewrite the kubeconfig's `server:` to the ngrok host + add `tls-server-name: kubernetes` (cert SAN, keeps TLS real). Seed pods so `get pods` returns something real.
- **Teardown**: kill ngrok + app, `kind delete cluster`, drop the demo Postgres DB, revert `.env`. A public tunnel to a local API server should never be left running.

## Voiceover

`postprocess.sh` generates it from OpenAI TTS (`gpt-4o-mini-tts`, key from `.env`) and muxes with ffmpeg. Write the narration to match the captions/timing. Offline fallback: `espeak-ng` (robotic). Or hand the narration script to a human to record.

## Delivery & don'ts

- Videos live in `.playwright-mcp/pr-<N>-v<N>/` — **gitignored, never `git add`**.
- New round of takes → new `-v<N+1>/` dir; don't overwrite prior ones.
- Be honest in the PR/Slack note about what's real vs a stand-in (e.g. "local kind cluster, not prod"). All commands/API calls shown are genuinely executed.
