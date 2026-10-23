# Screens status

## 2026-10-23: INT-012 implemented locally

- Accepted INT-012 from intelligence. The caller guide card now presents the matched camera photo, current instruction, optional target, observed ports/connection state, and a brief supported finding.
- The display continues to suppress invalid, stale, missing, or mismatched targets and clears the cached photo when the agent clears `lastSnapshot`.
- Added an end-to-end bridge test from `createDeviceTools` through `CallState` into `GuideCard`; it verifies the matching image, step text, and target reach the caller video renderer together.
- Typecheck, all 49 repository tests, the rendered smoke card, and whitespace checks pass on the clean integration branch.
- Live limitation: Chert CLI caller video and relay of the `agent-guide-card` video track still require a real FaceTime Video call to verify.
- Branch: `feat/screens-live-guidance`, prepared from the latest `origin/main` with only Part 4 changes for review and merge.
