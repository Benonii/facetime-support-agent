# agent-comms

How the 4 parts (and their coding agents) talk to each other. Read every folder here at the start of a session and after every `git pull`.

```
agent-comms/
  telephony/      part 1 (Ben)
  agent/          part 2
  intelligence/   part 3
  screens/        part 4
```

Each part owns one folder with three files. **Only edit your own folder.**

| File | What goes in it |
| - | - |
| `PROVIDES.md` | What your part gives others: routes, DTOs, env, how to test against you. Keep it true. |
| `NEEDS.md` | Asks to other parts. One item per ask, addressed to a part, with a checkbox. |
| `STATUS.md` | What works right now, what's broken, what's next. Newest entry on top, dated. |

**To ask another part for something:** add an item to your `NEEDS.md` under `## From <part>`, with a stable ID such as `INT-001`.
The recipient acknowledges that ID in their own `STATUS.md`, then links the answer or resolving commit/PR there and updates
their `PROVIDES.md` if needed. The requester checks the box after verifying the result. Each side edits only its own folder.

## Active-session protocol

1. **Start aligned.** Fetch the latest `origin/main` and read all `agent-comms/` folders before building. State your owner/part,
   session label, branch, intended outcome, files/interfaces you expect to touch, dependencies and next checkpoint in your `STATUS.md`.
   Publish this intent before substantial work so the other three people and their agents can spot overlap early.
2. **Keep intent visible.** Commit and push a short dated update when the plan changes, a useful milestone lands, a blocker appears,
   or you hand off/end the session. During longer active work, check and refresh at the next safe checkpoint, roughly every 10–15 minutes.
   Fetch teammates' updates at those checkpoints; read `origin/main` directly if pulling would disturb your current work.
3. **Catch drift early.** Compare incoming updates with your assumptions. If ownership, an interface or expected behavior conflicts,
   publish a concrete request in `NEEDS.md` and acknowledge incoming requests in your own status. Pause only the dependent change
   until the affected owner agrees; continue independent work. A proposal is not an accepted contract.
4. **Push useful increments.** Publish communication updates promptly in their own commits to `main`. Push coherent code checkpoints
   to your feature branch and link the draft PR in status; mark unfinished work and checks not yet run. Merge code through PRs.
   Fetch before pushing, integrate concurrent changes without overwriting them, and stage only your intended paths. Never force-push
   shared history or include local-only code commits in a documentation push; use a separate checkout based on `origin/main` when needed.
5. **Close the loop.** Record what is implemented, what is only proposed, verification actually run, the commit/PR, remaining blockers
   and the next action. Keep `PROVIDES.md` true to usable behavior. Keep credentials and private customer data out of these files.

This works while agents are actively running; repository files do not wake idle sessions or deliver notifications by themselves.

### Give each teammate's agent this instruction

> Start a session for part `<telephony|agent|intelligence|screens>`. Read `CONTEXT.md` and the latest `agent-comms/` on `origin/main`.
> Follow the active-session protocol in `agent-comms/README.md`: publish your intent, keep your part's status/needs/provides current,
> fetch teammates' updates at checkpoints, acknowledge requests, and surface integration conflicts early. Push communication updates
> to main separately from code; push ready code increments to your branch and use a PR. End with an actionable handoff.

**Rules**
- Ben owns the demo path (telephony, `/phone` PWA, Shure product KB, small glue lines). See "Owned by Ben" in `telephony/PROVIDES.md`; ask before touching.
- DTOs live in `src/contracts.ts`. If an ask changes a DTO, say so in the ask. Change contracts.ts first, in its own PR.
- Pushing straight to main is fine (pull first). Edit only your own folder here, and only your own part's code.
- Keep items short and concrete: what, why, the exact shape, by when.
