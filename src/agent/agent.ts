import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AutoSubscribe, cli, defineAgent, llm, ServerOptions, voice } from '@livekit/agents';
import { realtime } from '@livekit/agents-plugin-openai';
import { z } from 'zod';
import type { CallEvent, CallState, FixRequest, JobMetadata } from '../contracts.js';
import { createIntelligence } from '../intelligence/index.js';
import { GuideCard } from '../screens/card.js';
import { FrameGrabber, thumb } from './frames.js';
import { sendIMessage } from './imessage.js';

const BRAND = process.env.BRAND_NAME ?? 'Lumen Fiber';
const intelligence = createIntelligence();

const INSTRUCTIONS = `You are Alex, a ${BRAND} support technician on a live FaceTime video call. You are an AI; say so if asked.
The customer's internet (or device) is not working. Your job: fix it on this call so no technician visit is needed.

How the call goes:
1. Customer says hi. Ask what is wrong, then ask them to point the camera at the router or modem, lights facing you.
2. Call look_at_device whenever they show a new view (front lights, back ports, the label underneath).
   Before calling it, say a short filler like "Let me see." After it returns, say ONE specific thing you see
   ("your Internet light is red and the WAN port looks empty") so they know you can see it.
   If next_shot is set, ask for that view.
3. Once you have the lights and the ports, call find_fix with their symptom in their words.
4. Walk the steps one at a time: call show_step with the step number. It circles the part on their screen.
   Say the step in plain words ("the yellow cable, second port from the left"), then wait for them to do it.
5. After each step, call check_result and say what changed. If it is fixed, call mark_resolved.
6. If the plan says it needs a technician, or 3 steps failed, call book_technician with their name,
   address and a time window, and tell them the technician already has the diagnosis.

Style: calm, warm, quick. One or two short sentences per turn. Never read JSON aloud. Never say
"contact your provider": you ARE the provider. Never claim to see something the tools did not report.
If look_at_device says the device is not visible, ask them to move closer, hold still, or turn on a light.
Never ask for a factory reset unless the plan says so and the customer agrees.`;

export default defineAgent({
  entry: async (ctx) => {
    await ctx.connect(undefined, AutoSubscribe.SUBSCRIBE_ALL);
    const callId = safeJson<JobMetadata>(ctx.job.metadata)?.call_id ?? ctx.room.name ?? 'unknown';

    // Publish our video right away so the caller sees the card as soon as FaceTime connects.
    const card = new GuideCard();
    await card.publish(ctx.room);
    const state: CallState = { callId, stage: 'waiting', looks: 0 };
    const emit = async () => {
      await card.render(state).catch((e) => console.warn('[card]', e));
      post({ type: 'state', callId, state });
    };
    await emit();

    // Wait for the human (Chert bridge or dev phone) before paying for a model session.
    const caller = await ctx.waitForParticipant();
    post({ type: 'call.started', callId });
    const frames = new FrameGrabber(ctx.room);
    // Keep raw image bytes private to this call, paired with their exact observation.
    let latestLook: Omit<FixRequest, 'symptom'> | undefined;

    /** Grab a frame, update the snapshot on screen, and read it with the vision model. */
    const look = async (focus: string) => {
      latestLook = undefined;
      const jpeg = await frames.grabJpeg();
      if (!jpeg) return null;
      const snapshot = await thumb(jpeg, 640);
      const obs = await intelligence.observe({ jpeg, focus, step: state.step?.text, previous: state.observation });
      latestLook = { jpeg, observation: obs };
      state.lastSnapshot = snapshot;
      state.observation = obs;
      if (obs.device_visible) state.looks++;
      await emit();
      return obs;
    };
    const noVideo = { device_visible: false, note: 'No video from the customer yet. Ask them to turn on their camera.' };

    const tools = {
      look_at_device: llm.tool({
        description:
          'Capture the current camera frame and read the device: status lights (color, solid/blinking), ports and cables, labels. ' +
          'Call whenever the customer shows a new view.',
        parameters: z.object({ focus: z.string().describe('what to check, e.g. "front status lights", "back ports", "label underneath"') }),
        execute: async ({ focus }) => {
          state.stage = 'looking';
          const obs = await look(focus);
          if (!obs) return noVideo;
          const { target, ...rest } = obs;
          return { ...rest, looks_so_far: state.looks };
        },
      }),

      find_fix: llm.tool({
        description: 'Build a step-by-step fix plan from what was seen plus the manual and web results for this model.',
        parameters: z.object({ symptom: z.string().describe("the customer's problem in their words") }),
        execute: async ({ symptom }) => {
          const observed = latestLook;
          if (!observed) return { error: 'Look at the device first with look_at_device to capture an image.' };
          state.stage = 'diagnosing';
          await emit();
          state.plan = await intelligence.findFix({ ...observed, symptom });
          state.stage = 'guiding';
          await emit();
          return state.plan;
        },
      }),

      show_step: llm.tool({
        description: "Show step n of the plan on the customer's screen and circle the part they need to touch.",
        parameters: z.object({ n: z.number().int().min(1).describe('1-based step number') }),
        execute: async ({ n }) => {
          const text = state.plan?.steps.at(n - 1);
          if (!text) return { error: `No step ${n}.` };
          state.step = { n, text };
          state.stage = 'guiding';
          const obs = await look(`find the part for this step: ${text}`);
          return { step: text, circled: obs?.target?.label ?? null, device_visible: obs?.device_visible ?? false };
        },
      }),

      check_result: llm.tool({
        description: 'Look again after the customer did a step and report what changed in the lights and ports.',
        execute: async () => {
          const before = state.observation?.indicators;
          const obs = await look('did any status light change after the last step?');
          if (!obs) return noVideo;
          return { before, now: obs.indicators, findings: obs.findings };
        },
      }),

      mark_resolved: llm.tool({
        description: 'The problem is fixed on the call. Close the ticket.',
        execute: async () => {
          state.ticket = { id: ticketId(), outcome: 'resolved_on_call', diagnosis: diagnosis(state), created_at: new Date().toISOString() };
          state.stage = 'resolved';
          state.step = undefined;
          await emit();
          return { ticket: state.ticket.id };
        },
      }),

      book_technician: llm.tool({
        description: 'Cannot fix remotely. Book a technician visit with the diagnosis attached.',
        parameters: z.object({
          name: z.string(),
          address: z.string(),
          window: z.string().describe('e.g. "Tomorrow 8 to 12"'),
          phone: z.string().describe('mobile in E.164 for the confirmation text, or empty'),
        }),
        execute: async ({ window, phone }) => {
          state.ticket = { id: ticketId(), outcome: 'technician_booked', diagnosis: diagnosis(state), window, created_at: new Date().toISOString() };
          state.stage = 'technician';
          state.step = undefined;
          await emit();
          const texted = phone
            ? await sendIMessage(phone, `${BRAND}: technician booked ${window}. Ticket ${state.ticket.id}. Diagnosis: ${state.ticket.diagnosis}`)
            : false;
          return { ticket: state.ticket.id, window, texted };
        },
      }),
    };

    const session = new voice.AgentSession({
      llm: new realtime.RealtimeModel({
        model: process.env.REALTIME_MODEL ?? 'gpt-realtime',
        voice: process.env.REALTIME_VOICE ?? 'marin',
      }),
    });
    ctx.addShutdownCallback(async () => {
      frames.close();
      await card.close();
      await session.close();
      post({ type: 'call.ended', callId });
    });

    await session.start({
      room: ctx.room,
      agent: new voice.Agent({ instructions: INSTRUCTIONS, tools }),
      record: false,
      inputOptions: {
        participantIdentity: caller.identity,
        audioEnabled: true,
        videoEnabled: false, // we grab frames ourselves in the tools
        textEnabled: false,
        closeOnDisconnect: true,
        deleteRoomOnClose: false,
      },
      outputOptions: { audioEnabled: true, transcriptionEnabled: false },
    });
    // No greeting here: FaceTime media may not be flowing yet. The caller says hi first (Chert guidance).
  },
});

function diagnosis(s: CallState) {
  const lights = s.observation?.indicators.map((l) => `${l.label} ${l.color}`).join(', ') ?? 'not seen';
  return `${s.plan?.likely_cause ?? 'unknown cause'}. Lights: ${lights}. Steps tried: ${s.step?.n ?? 0}.`;
}

function ticketId() {
  return 'T-' + randomUUID().slice(0, 6).toUpperCase();
}

function post(ev: CallEvent) {
  const url = process.env.SERVER_URL;
  if (!url) return;
  fetch(`${url}/api/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev) }).catch(() => {});
}

function safeJson<T>(s?: string): T | undefined {
  try {
    return s ? (JSON.parse(s) as T) : undefined;
  } catch {
    return undefined;
  }
}

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: process.env.AGENT_NAME || 'support-agent',
  }),
);
