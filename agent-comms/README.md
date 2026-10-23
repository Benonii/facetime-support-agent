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

**To ask another part for something:** add an item to your `NEEDS.md` under `## From <part>`. The owner answers by
updating their `PROVIDES.md` (or `STATUS.md`) and noting it under your item in their own `NEEDS.md`/`STATUS.md`. You tick the box when it's done.

**Rules**
- DTOs live in `src/contracts.ts`. If an ask changes a DTO, say so in the ask. Change contracts.ts first, in its own PR.
- `agent-comms/` changes go straight to main (pull first, edit only your folder). Code still goes through PRs, never main.
- Keep items short and concrete: what, why, the exact shape, by when.
