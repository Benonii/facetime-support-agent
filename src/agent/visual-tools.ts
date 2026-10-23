import { llm } from '@livekit/agents';
import { z } from 'zod';
import type { createVisualRequestController } from './visual-request.js';

export function createVisualTools(controller: ReturnType<typeof createVisualRequestController>) {
  return {
    analyze_device: llm.tool({
      description: 'Look at the live camera and return the next physical instruction plus its matching photo/target. Call for a device help request, a new view after asking for one, an incorrect placement, or a requested verification. Do not call for greetings, thanks or a status question. Use stepNumber only to show an existing next plan step.',
      parameters:z.object({
        question:z.string().describe('The caller request, including the original problem when known'),
        mode:z.enum(['guide','verify']),
        stepNumber:z.number().int().min(1).optional(),
        newProblem:z.boolean().optional().describe('True only for a different device or new problem; clears earlier image context'),
      }),
      flags:llm.ToolFlag.CANCELLABLE,
      onDuplicate:'replace',
      execute:async(args,{ctx,toolCallId,abortSignal})=>{
        const result=await controller.run({...args,requestId:toolCallId,signal:abortSignal},message=>ctx.update(message));
        // Returning nothing suppresses the deferred reply for obsolete work in LiveKit 1.8.
        if(result.outcome==='cancelled'||abortSignal.aborted)return;
        return {...result,speech:'Speak the instruction in one or two natural sentences, citing only reported facts. Describe the physical landmark. The photo was sent for display, but do not claim the caller can see a circle. Verification is not resolution; ask if the requested task worked.'};
      },
    }),
    cancel_analysis:llm.tool({
      description:'Stop the current visual analysis when the caller asks to stop or cancel. Ordinary conversation does not need cancellation.',
      execute:async()=>{await controller.cancel();return {message:'Stopped checking. Ask what the caller would like to do next.'};},
    }),
  };
}
