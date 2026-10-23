# Screens status

## 2026-10-23: INT-012 merged in PR #10

- Accepted and completed INT-012. [PR #10](https://github.com/Benonii/facetime-support-agent/pull/10) is merged into `main` at `8da68b2`.
- The caller guide card presents the matched camera photo, current instruction, optional target, observed ports/connection state, and a brief supported finding.
- The display continues to suppress invalid, stale, missing, or mismatched targets and clears the cached photo when the agent clears `lastSnapshot`.
- The end-to-end bridge test verifies `createDeviceTools` sends matching image, step text, and target through `CallState` into `GuideCard`.
- Typecheck, all 49 repository tests, the rendered smoke card, and whitespace checks passed before merge.
- Remaining live check: confirm Chert CLI carries caller video to the worker and relays the `agent-guide-card` video track to a real FaceTime Video caller. Tracked as SCR-001 in NEEDS.
