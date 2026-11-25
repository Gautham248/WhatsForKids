# Standing rules for any AI coding session in this environment

These rules apply to every request, regardless of harness (OpenCode, Claude Code, or otherwise), regardless of project, regardless of how simple, routine, or urgent the request looks. They compose alongside any project-specific AGENTS.md — this file does not replace it.

<!-- BEGIN dev-agent-skills sync script pointer (placeholder resolved in memory by agents-md-sync.sh's resolve_placeholders at write/append time -- never resolved here, this stays a stable template on every machine and in every commit) -->
Rule 0 below uses this script to manage a project's AGENTS.md: /Users/gauthamkrishna/Code/personal/dev-agent-skills/scripts/agents-md-sync.sh
<!-- END dev-agent-skills sync script pointer -->

## The governing meta-principle — read this before anything else

If you ever find yourself weighing whether a rule below "really applies" to this particular request — because it seems too simple, too obvious, too small, too urgent, or too unrelated to code — **that weighing is itself the failure mode every rule below exists to prevent.** None of the rules below have a simplicity exemption, an urgency exemption, or a judgment-call exemption. Follow them in order, every time. The only acceptable deviation from a rule is the fallback that rule itself explicitly describes for when its own action genuinely cannot be completed — never a deviation based on your own assessment that the rule doesn't fit this case.

---

## Rule S — Session start is automated; act on its summary, don't redo it

<!-- BEGIN dev-agent-skills session-start script pointer (placeholder resolved in memory by agents-md-sync.sh's resolve_placeholders at write/append time -- never resolved here, this stays a stable template on every machine and in every commit) -->
Session-start script: /Users/gauthamkrishna/Code/personal/dev-agent-skills/scripts/session-start.sh
<!-- END dev-agent-skills session-start script pointer -->

A SessionStart hook runs the script above before your first turn and injects a short summary headed `dev-agent session-start (already run ...)`. It has already done, deterministically and outside your context: Rule 0's `status` (and the safe `write`), Rule 0b's check, Rule 0c's `init`, and Rule 1's graph build/refresh and hook install.

- **Summary present:** do NOT re-run those checks. Act only on its `ACTION:` lines (ask the user once each, then follow the matching rule below), then go to Rule 2. Use the graph and session history on demand, per Rules 0c and 1.
- **Summary absent** (a harness without hooks, or a hook failure): run `bash /Users/gauthamkrishna/Code/personal/dev-agent-skills/scripts/session-start.sh` once, from the project root, and treat its output exactly as above.
- A line saying `BUILD FAILED`, `WRITE FAILED` or similar is a failed step: say so in one line and continue; never block on it.

---

## Rule 0 — Ensure a project-level AGENTS.md exists, and that it's actually ours

The session-start script (Rule S) runs `bash /Users/gauthamkrishna/Code/personal/dev-agent-skills/scripts/agents-md-sync.sh status` for you and already performs the safe `write` for `NO_AGENTS` and `AGENTS_OURS_STALE`. Never judge the state from `test -f AGENTS.md`, and never hand-copy these rules into a file: the script reads the canonical file directly and tracks ownership with a sha256 sidecar (`.agents-md.sha256`). When the summary is absent, run `status` yourself before anything else; it prints exactly one of:

- **`NO_AGENTS`** → run `bash /Users/gauthamkrishna/Code/personal/dev-agent-skills/scripts/agents-md-sync.sh write` without asking.
- **`AGENTS_OURS_FRESH`** → nothing to do.
- **`AGENTS_OURS_STALE`** → ours and unedited, but the canonical rules changed: run `write` without asking and say in one line that you refreshed it.
- **`AGENTS_TAMPERED`** → ours, but hand-edited since we wrote it. Never overwrite. Ask one closed question; if the user wants the edit kept, run `bash /Users/gauthamkrishna/Code/personal/dev-agent-skills/scripts/agents-md-sync.sh accept` (re-baselines the sidecar, touches no content).
- **`AGENTS_FOREIGN`** → an `AGENTS.md` exists that dev-agent-skills never wrote (e.g. from another tool's `/init`), so it carries none of these rules. Tell the user once, then ask one closed question: append the rules at the bottom (nothing removed) or leave it as-is? If yes run `bash /Users/gauthamkrishna/Code/personal/dev-agent-skills/scripts/agents-md-sync.sh append`; if no, proceed and do not ask again this session.

Forbidden: skipping this because the request is trivial; treating any existing `AGENTS.md` as ours; overwriting or editing a foreign or tampered file without asking; re-asking after a "no".

---

## Rule 0b — Gitignore local tooling artifacts (ask first)

The session-start summary reports `.gitignore: ok` or `missing <entries>` (`graphify-out/`, `.dev-agent/`). If missing, its `ACTION:` line applies: ask **one** closed question naming every missing entry, and add only those entries, only after an explicit yes (create `.gitignore` with just them if it doesn't exist). A "no" is final for the session. Never add entries unasked, never ask two questions, never let this delay the rest of the sequence.

---

## Rule 0c — Session history is on disk; read it on demand

<!-- BEGIN dev-agent-skills work-log script pointer (placeholder resolved in memory by agents-md-sync.sh's resolve_placeholders at write/append time -- never resolved here, this stays a stable template on every machine and in every commit) -->
Session-history script: /Users/gauthamkrishna/Code/personal/dev-agent-skills/scripts/work-log-cli.mjs (`kickoff --repo-root .` regenerates KICKOFF.md from the sessions on record)
<!-- END dev-agent-skills work-log script pointer -->

The script already ran `init` (idempotent) and the summary names `.dev-agent/KICKOFF.md`. Do not read it upfront. Read it (once per session) only when the user asks about past work ("what did we last do", "where did we leave off"), or when a workflow skill (`fix-bug`, `plan-feature`) tells you to. This session's own logging steps still write to it. Never claim there is no history without having read the file when asked.

---

## Rule 1 — Use the knowledge graph before any other investigation

The script already built or refreshed the graph (AST-only, no LLM) and installed the graph git hooks; the summary says `graph: built | refreshed | fresh`. Before grepping, globbing or spawning an exploration subagent, query it, with output capped:

```bash
graphify query "<a question grounded in what's actually being asked>" | head -c 3000
```

Use `graphify explain "<node>"` / `graphify path "<A>" "<B>"` for follow-ups. Cap every graph command's output the same way; widen only if the capped answer is genuinely insufficient.

Load the full `graphify` skill (by skill name, via the skill-loading tool; never as a shell command or literal chat text) only if: the summary reports a graph failure, the project has docs / PDFs / images whose content needs semantic extraction, or the user asks for a full or semantic rebuild. If graph grounding is unavailable, say so plainly and fall back to ordinary file tools.

### Anti-patterns — explicitly forbidden for Rule 1

- Skipping the query because the request "looks simple". There is no simplicity exemption — a graph query is cheap; a blind grep is not.
- Re-running the graph build, `check-update`, `hook status` or other session-start steps yourself when the summary is present.
- Loading the full `graphify` skill, or dumping uncapped graph output, for an ordinary question.
- Running `/graphify .` (or any slash text) through the shell — it is a skill invocation, not an executable.
- Treating grep/glob/Explore subagents as a substitute for querying the graph first.

---

## Rule 2 — Load a matching workflow skill before exploring further, before asking

Once Rule 1 is done, if the request could be a bug report, feature idea or PR task — even a vague one-liner — invoke the matching workflow skill (`fix-bug`, `plan-feature`, `sync-prs`, or similar) with the skill-loading tool, by name, as your very next action. Carry Rule 1's graph findings into the skill; don't re-investigate from scratch.

Forbidden: judging a request "too simple" for a skill; spawning an exploration subagent first; invoking a skill through the shell or as literal chat text (skills load only through the skill tool); picking the first plausible skill without weighing a better fit (if truly torn between two, asking the user which applies is fine); treating Rule 1's investigation as a substitute for loading the skill.

---

## Rule 3 — Clarify, then confirm, before acting

Hard gates (always in force; no simplicity, urgency or judgment-call exemption):

1. **Enough to act?** If you can't state in one or two sentences what is wanted and what the result should look like, investigate first (graph, tools, earlier messages), then ask **one** focused, preferably closed question at a time. Never ask the user for something you can find yourself (file, line, internal detail). Never accept a vague answer as final: propose a concrete default and ask yes/no. After ~3–4 exchanges stop asking and plan with your best understanding, flagged as uncertain. An explicit "just go ahead" means move to the plan now.
2. **Present a plan and STOP.** Before any edit, state-changing command or commit: what you will do, what you will explicitly NOT do, and what "done" looks like; then ask for confirmation and wait for the user's next message. Acting in the same turn as the plan is forbidden.
3. **Only a real yes counts.** A reply counts only if it responds to the plan's substance. Silence, a tangent, or inferred intent is not confirmation. If the actual change turns out different from the plan that was approved (different file, wider blast radius), it is a new plan and needs a new yes.
4. **Act** only after that yes, following the loaded skill's procedure.
5. **Feedback re-enters at step 1.** "It's still broken" or "also do X" after you acted is a new problem report, not authorization: re-plan and re-confirm before touching anything again.

**Read `/Users/gauthamkrishna/Code/personal/dev-agent-skills/config/CLARIFY-CONFIRM-DETAIL.md` once, before presenting your first plan in a session** (it holds the full procedure: how to ask well, what counts as confirmation, the anti-patterns). Skip it for sessions that only answer questions and change nothing.

---

## Rule 3b — Database mutations always require their own explicit confirmation

Any CREATE, UPDATE, DELETE, TRUNCATE, migration, seed or one-off script that writes to a database is a separate action from writing the script. Before running it — dev, local, staging or prod, no environment exemption — state the database by name or host, the table/collection, the operation and roughly how many rows, then STOP and wait for an explicit yes. Confirmation to write a script is not confirmation to run it, and an earlier yes never covers a later, different mutation. If you can't say confidently that a command is read-only, treat it as a mutation. Reads (`SELECT`, schema inspection) are not gated. Full text: `/Users/gauthamkrishna/Code/personal/dev-agent-skills/config/CLARIFY-CONFIRM-DETAIL.md` (read it before the first mutation of a session).

---

## What to do if a step fails

Each rule above includes its own fallback for when the thing it asks for genuinely isn't available (no graph, no matching skill, can't reach full confidence after several exchanges). The fallback is always the same shape: say so plainly, then proceed to the next rule in sequence using ordinary judgment for the part that failed. Never silently skip a rule's fallback note, and never let one rule's failure block the rest of the sequence — a failed graph doesn't excuse skipping skill-loading, and an unclear request doesn't excuse skipping confirmation.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
