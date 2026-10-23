import { z } from 'zod';

// What the vision model returns for one camera frame of the customer's device.
export const Observation = z.object({
  device_visible: z.boolean().describe('false if blurry, dark, or the device is not in view'),
  device: z.object({
    type: z.enum(['router', 'modem', 'mesh_node', 'ev_charger', 'appliance', 'tv_box', 'printer', 'other']),
    brand: z.string(),
    model: z.string().describe('read from the label if legible, else best guess, else empty'),
  }),
  indicators: z
    .array(
      z.object({
        label: z.string().describe('printed label or icon, e.g. "Internet", "WAN", "globe icon", "PON"'),
        color: z.enum(['off', 'green', 'white', 'blue', 'amber', 'red', 'purple', 'other']),
        pattern: z.enum(['solid', 'blinking', 'unknown']),
      }),
    )
    .describe('every status light you can see'),
  ports: z
    .array(z.object({ label: z.string(), cable_connected: z.boolean() }))
    .describe('ports visible on this side of the device, left to right'),
  findings: z.array(z.string()).describe('specific things that matter for the fault, e.g. "WAN port empty", "power LED amber"'),
  // The part the customer should touch next, so the card can circle it on their screen.
  target: z
    .object({
      label: z.string().describe('what to touch, e.g. "yellow cable in WAN port"'),
      box: z.array(z.number()).describe('[x0, y0, x1, y1] normalized 0..1 in the image'),
    })
    .nullable()
    .describe('null if nothing specific to point at'),
  next_shot: z.string().describe('the single most useful next view to ask for, or empty string'),
  confidence: z.number().describe('0..1'),
});
export type Observation = z.infer<typeof Observation>;

export const FixPlan = z.object({
  likely_cause: z.string(),
  steps: z.array(z.string()).describe('short imperative steps the customer can do, max 6'),
  needs_technician_if: z.string().describe('what result means it cannot be fixed remotely'),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
});
export type FixPlan = z.infer<typeof FixPlan>;

export interface Ticket {
  id: string;
  outcome: 'resolved_on_call' | 'technician_booked';
  diagnosis: string;
  window?: string;
  created_at: string;
}

// Live state for one call. Rendered on the caller's FaceTime screen and on the dashboard.
export interface CallState {
  callId: string;
  stage: 'waiting' | 'looking' | 'diagnosing' | 'guiding' | 'resolved' | 'technician';
  observation?: Observation;
  plan?: FixPlan;
  step?: { n: number; text: string };
  looks: number;
  ticket?: Ticket;
  lastSnapshot?: string; // data:image/jpeg;base64,... (small)
}

export type CallEvent =
  | { type: 'call.started'; callId: string }
  | { type: 'state'; callId: string; state: CallState }
  | { type: 'call.ended'; callId: string };
