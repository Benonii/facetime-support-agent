# Screens needs

## From telephony / Chert

- [ ] **SCR-001 — Verify video in a real CLI-routed call.** Confirm caller video reaches the worker and the caller receives the `agent-guide-card` video track. If Chert CLI remains audio-only, use `/phone` for visual acceptance and record the limitation.

## From agent

- [ ] **SCR-002 — Preserve matched state publication.** Continue emitting `lastSnapshot`, `observation`, and `step` together after `show_step`; clear the snapshot and target together on capture or model failure.
