# One real call, part by part

Date: 2026-10-23. Read with CONTEXT.md. Field names match `src/contracts.ts`.

This follows one real customer call from start to end. Each step says **which part does the work** (1 Telephony, 2 Agent, 3 Intelligence, 4 Screens), what the human sees or hears, and the **exact data** passed between parts. Field names match `src/contracts.ts`.

**The customer:** Maria. Her internet is down. Her cat knocked the yellow cable out of the router's WAN port. She FaceTimes Lumen Fiber support.

| # | Part | Folder | One-line job |
| - | - | - | - |
| 1 | Telephony | `src/telephony` | Answers Chert, hands over the room, relays events to the dashboard |
| 2 | Agent | `src/agent` | Talks to Maria, decides what to do, keeps the call state |
| 3 | Intelligence | `src/intelligence` | Looks at one photo, builds the fix plan |
| 4 | Screens | `src/screens`, `public/` | Draws what Maria sees, plus the projector dashboard |

## Step 0. Before anyone calls (Part 1, then Part 2)

**What happens:** The server makes a room ahead of time (the "warm room") and sends the agent into it, so we can answer Chert in under 5 seconds later.

Part 1 sends Part 2 the dispatch metadata, a **JobMetadata**:

```json
{ "call_id": "warm-7f3a…" }
```

Part 2 joins the room, and Part 4 starts publishing the `agent-guide-card` video with the waiting screen: "Lumen Fiber Support · Live video support · Point your camera at the device". The agent waits for a human to join. No OpenAI cost yet.

## Step 1. Maria FaceTimes the line (Chert, then Part 1)

**What Maria does:** She taps FaceTime Video on the support number.

Chert POSTs a **ChertEvent** to `/webhooks/chert`:

```json
{ "event_id": "evt_91", "type": "call.incoming", "created_at": "2026-10-23T19:00:00Z",
  "data": { "call_id": "call_abc", "line_id": "line_1", "media": { "audio": true, "video": true } } }
```

Part 1 takes the warm room, mints a bridge token, and replies within about 1 second with a **ChertDecision**:

```json
{ "action": "accept", "livekit_url": "wss://ourproject.livekit.cloud",
  "participant_token": "eyJhbGci…", "remote_participant_identity": "agent-AJ_x9" }
```

Chert's bridge joins the room. Maria's mic becomes the `facetime-remote-audio` track and her camera becomes `facetime-remote-video`. Maria sees the agent's guide card as the other person's video.

## Step 2. Hello (Part 2)

**Maria:** "Hi, my internet stopped working."

**Agent (gpt-realtime):** "Sorry about that. Can you point your camera at your router, lights facing me?"

Part 2 sends the dashboard a **CallEvent** through Part 1 (POST `/api/events`, then SSE `/api/stream`):

```json
{ "type": "call.started", "callId": "warm-7f3a…" }
```

No other part is involved yet. The realtime model just talks.

## Step 3. The agent looks (Part 2, then 3, then 4)

**Maria** holds up the router. **Agent:** "Let me see." The realtime model calls the `look_at_device` tool with `focus: "front status lights"`.

Part 2 grabs the newest camera frame as a JPEG and sends Part 3 an **ObserveRequest**:

```json
{ "jpeg": "<Buffer 180 KB>", "focus": "front status lights" }
```

The vision model in Part 3 (gpt-5) returns an **Observation** in about 3 seconds:

```json
{ "device_visible": true,
  "device": { "type": "router", "brand": "Lumen", "model": "FX-200" },
  "indicators": [ { "label": "Power", "color": "green", "pattern": "solid" },
                  { "label": "Internet", "color": "red", "pattern": "solid" },
                  { "label": "WiFi", "color": "green", "pattern": "blinking" } ],
  "ports": [],
  "findings": ["Internet light solid red"],
  "target": null,
  "next_shot": "back of the router, ports visible",
  "confidence": 0.86 }
```

Part 2 updates the call state and calls `render()` in Part 4 with a **CallState**:

```json
{ "callId": "warm-7f3a…", "stage": "looking", "looks": 1,
  "observation": { "…": "the Observation above" },
  "lastSnapshot": "data:image/jpeg;base64,/9j/4AAQ…" }
```

**Maria sees** her router photo with three dots underneath: Power green, Internet red, WiFi green. **Agent:** "Your Internet light is red. Can you turn it around so I can see the ports?"

The same CallState goes to the dashboard as `{ "type": "state", "callId": …, "state": {…} }`. This repeats on every change below.

## Step 4. Second look at the back (Part 2, then 3, then 4)

Same flow as Step 3 with `focus: "back ports"` and `previous` set to the first Observation. Part 3 returns:

```json
{ "ports": [ { "label": "Power", "cable_connected": true },
             { "label": "WAN", "cable_connected": false },
             { "label": "LAN1", "cable_connected": true } ],
  "findings": ["Internet light solid red", "WAN port empty", "loose yellow cable visible"],
  "target": null, "…": "rest as before" }
```

**Agent:** "I see it. The WAN port is empty and there's a yellow cable hanging loose."

## Step 5. Build the fix (Part 2, then 3)

The realtime model calls `find_fix` with `symptom: "internet stopped working"`. Part 2 sends Part 3 a **FixRequest**:

```json
{ "jpeg": "<Buffer: same upright JPEG used for this observation>",
  "observation": { "…": "the latest Observation" }, "symptom": "internet stopped working" }
```

The JPEG above represents real Buffer bytes in the in-process call, not a string.
Part 2 keeps the image and its observation paired. Part 3 sends the image itself to
gpt-5-mini along with the observation, symptom, generic router PLAYBOOK and Keenable
search results to produce a **FixPlan**. This walkthrough's device, sources and
outcome are illustrative; the generic PLAYBOOK is not an FX-200 manual.

```json
{ "likely_cause": "WAN cable unplugged, so the router has no line from the fiber box",
  "steps": [ "Plug the yellow cable into the WAN port until it clicks",
             "Wait 60 seconds for the Internet light" ],
  "needs_technician_if": "Internet light still red 2 minutes after the cable is in",
  "sources": [ { "title": "FX-200 light guide", "url": "https://…" } ] }
```

CallState becomes `stage: "guiding"` with `plan` set. **Maria sees** "Likely cause: WAN cable unplugged…".

## Step 6. Circle the part (Part 2, then 3, then 4)

The realtime model calls `show_step` with `n: 1`. Part 2 takes a fresh frame and sends an ObserveRequest with the step text, which asks Part 3 for a target:

```json
{ "jpeg": "<Buffer>", "focus": "find the part for this step",
  "step": "Plug the yellow cable into the WAN port until it clicks" }
```

Part 3 returns an Observation where `target` is now filled:

```json
{ "target": { "label": "WAN port (yellow)", "box": [0.30, 0.55, 0.42, 0.70] }, "…": "rest" }
```

The box means: from 30% to 42% across the photo, and 55% to 70% down. Part 2 sets `step: { "n": 1, "text": "Plug the yellow cable…" }` and calls render.

Part 4 draws the frozen photo with a **blinking yellow ring** around the WAN port, "Step 1 of 2", and the step in big text. It pushes that picture 10 times a second as `agent-guide-card`, and Chert shows it on Maria's FaceTime.

**Agent:** "See the circle? Plug the yellow cable into that port until it clicks."

## Step 7. Check it worked (Part 2, then 3, then 4)

**Maria:** "Done." The model calls `check_result`. Part 2 sends one more ObserveRequest and compares the lights. The tool returns to the model:

```json
{ "before": [ { "label": "Internet", "color": "red" } ],
  "now":    [ { "label": "Internet", "color": "green" } ],
  "findings": ["WAN cable connected", "Internet light solid green"] }
```

**Agent:** "Your Internet light just turned green. Try loading a page?" **Maria:** "It works!"

## Step 8. Close the ticket (Part 2, then 4 and the dashboard)

The model calls `mark_resolved`. Part 2 creates a **Ticket** inside CallState:

```json
{ "stage": "resolved",
  "ticket": { "id": "T-4C9E1A", "outcome": "resolved_on_call",
              "diagnosis": "WAN cable unplugged. Lights: Power green, Internet green, WiFi green. Steps tried: 1.",
              "created_at": "2026-10-23T19:01:24Z" } }
```

**Maria sees** a green "Fixed ✓ · No visit needed. Ticket closed." The **projector dashboard** (Part 4) counts one fix on the call: one truck roll avoided, $150 saved. Maria hangs up and Part 2 sends `{ "type": "call.ended" }`. Part 1 deletes the room and warms a new one.

## If it can't be fixed

If the light stays red, the model calls `book_technician` with Maria's name, address, time window and phone. The Ticket gets `outcome: "technician_booked"` and `window: "Tomorrow 8 to 12"`, and Maria gets an iMessage through Chert. Her screen says "Technician booked · diagnosis sent ahead".

## Who to blame when something breaks

| Symptom in the demo | Part |
| - | - |
| FaceTime declines or never connects | 1 Telephony |
| Agent silent, talks over Maria, or calls the wrong tool | 2 Agent |
| Wrong light color, wrong brand, or circle in the wrong spot | 3 Intelligence |
| Card looks bad, ring doesn't blink, dashboard number wrong | 4 Screens |

Each part can test alone: Part 1 with the `/phone` page, Part 2 with `npm run agent:mock`, Part 3 with `npm run try:intel -- photo.jpg "no internet"`, Part 4 with `npm run smoke`.
