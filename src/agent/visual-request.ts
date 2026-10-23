import type { CallState, Intelligence, Observation } from '../contracts.js';
import { normalizeObservation } from '../intelligence/vision.js';

export interface VisualRequest {
  requestId: string;
  question: string;
  mode: 'guide' | 'verify';
  stepNumber?: number;
  newProblem?: boolean;
  signal?: AbortSignal;
}
export interface VisualResult {
  outcome: 'guidance' | 'needs_view' | 'verification' | 'failed' | 'cancelled';
  instruction: string;
  facts?: string[];
  target?: string | null;
  nextShot?: string;
  before?: Observation['ports'];
  now?: Observation['ports'];
}

/** One visual turn owns one JPEG. Existing CallState drives both GuideCard and /phone. */
export function createVisualRequestController({state, intelligence, grabJpeg, snapshot, emit}: {
  state: CallState;
  intelligence: Intelligence;
  grabJpeg: () => Promise<Buffer | null>;
  snapshot: (jpeg: Buffer) => Promise<string>;
  emit: () => Promise<void>;
}) {
  let active: AbortController | undefined;
  let closed = false;
  let goal = '';
  let references: Buffer[] = [];
  const clear = () => { state.lastSnapshot = undefined; state.observation = undefined; state.step = undefined; state.screen = undefined; };
  const cancel = async () => {
    active?.abort(); active = undefined;
    clear(); state.stage = 'waiting';
    if (!closed) await emit();
  };
  return {
    cancel,
    close() { closed = true; active?.abort(); references = []; },
    async run(request: VisualRequest, update: (message:string)=>Promise<void> = async()=>{}): Promise<VisualResult> {
      if (closed || request.signal?.aborted) return {outcome:'cancelled',instruction:''};
      active?.abort();
      const controller = new AbortController(); active = controller;
      const signal = request.signal ? AbortSignal.any([controller.signal,request.signal]) : controller.signal;
      const started = performance.now();
      const trace = (phase:string) => console.info(`[visual] ${request.requestId} ${phase} ${Math.round(performance.now()-started)}ms`);
      trace('started');
      let timedOut = false;
      const deadline = setTimeout(()=>{timedOut=true;controller.abort();},90_000);
      const check = () => signal.throwIfAborted();
      const wait = <T>(promise:Promise<T>):Promise<T> => new Promise((resolve,reject)=>{
        const abort=()=>reject(new Error('Visual request cancelled'));
        signal.addEventListener('abort',abort,{once:true});
        promise.then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)abort();else resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
        if(signal.aborted)abort();
      });
      let reminder:ReturnType<typeof setTimeout>|undefined;
      const previous = request.newProblem ? undefined : state.observation;
      const selected = request.stepNumber && !request.newProblem ? state.plan?.steps[request.stepNumber-1] : undefined;
      if(request.newProblem){goal='';references=[];state.plan=undefined;}
      if(!goal)goal=request.question;
      const focus = `Original task: ${goal}\nCaller now: ${request.question}`;
      try {
        if(request.stepNumber && !selected) return {outcome:'failed',instruction:'There is no such step yet. Ask what the caller needs help with.'};
        // Start capture at the verbal tool request, before waiting for render/progress speech.
        const captured = wait(grabJpeg());
        void captured.catch(()=>{});
        clear(); state.stage='looking';
        state.screen={phase:'thinking',caption:{speaker:'agent',text:'Looking at your camera…'}};
        await emit(); check();
        await wait(update('Let the caller know briefly: "Let me take a look." Analysis is running; no findings are ready yet.'));
        // One gentle reminder if this turn takes a while. No repeated chatter.
        reminder=setTimeout(()=>{if(!signal.aborted && active===controller) void update('Still checking the image. Briefly reassure the caller; do not invent a result or start another analysis.').catch(()=>{});},15_000);
        const jpeg=await captured;trace(jpeg?'captured':'no_frame');
        if(!jpeg){
          references=[];state.stage='waiting';
          state.screen={phase:'waiting',caption:{speaker:'agent',text:'Please turn on your camera and show the device.'}};
          await emit();check();
          return {outcome:'needs_view',instruction:'I cannot get a current camera frame. Please turn on your camera and show the device.'};
        }
        const referenceJpegs=references.filter(b=>!b.equals(jpeg)).slice(-2);
        const image=await wait(snapshot(jpeg));
        const step=request.mode==='verify' ? undefined : selected;
        let observation=normalizeObservation(await wait(intelligence.observe({jpeg,referenceJpegs,focus,previous,step})),step);
        check();
        trace('observed');
        let instruction = observation.next_shot || 'Please show the device more clearly.';
        let outcome:VisualResult['outcome']='needs_view';
        if(observation.device_visible){
          state.looks++;
          if(request.mode==='verify'){
            outcome='verification';
            instruction=observation.next_shot || 'Tell me whether the action worked for you.';
          }else{
            let text=selected;
            if(!text){
              state.plan=undefined;state.stage='diagnosing';
              state.screen={phase:'thinking',caption:{speaker:'agent',text:'Checking the next step…'}};
              await emit();check();
              const plan=await wait(intelligence.findFix({jpeg,referenceJpegs,observation,symptom:focus}));
              check();trace('planned');state.plan=plan;text=plan.steps[0];
              if(text) observation=normalizeObservation(await wait(intelligence.observe({jpeg,referenceJpegs,focus,previous:observation,step:text})),text);
            }
            check();
            instruction=text || observation.next_shot || 'Please show the relevant part more clearly.';
            outcome=observation.device_visible && (observation.target || !observation.next_shot) ? 'guidance' : 'needs_view';
            if(outcome==='needs_view') instruction=observation.next_shot || instruction;
          }
          const first=references[0] ?? jpeg;
          references=first.equals(jpeg)?[first]:[first,jpeg];
        }
        check();
        // Commit the image, instruction and target together. Never reuse old coordinates.
        state.lastSnapshot=image;state.observation=observation;
        state.step={n:request.stepNumber??1,text:instruction};state.stage='guiding';
        state.screen={phase:'waiting',snapshotId:request.requestId,observationSnapshotId:request.requestId};
        await emit();check();
        trace('published_'+outcome);
        return {outcome,instruction,facts:observation.findings,target:observation.target?.label??null,nextShot:observation.next_shot,
          ...(request.mode==='verify'?{before:previous?.ports,now:observation.ports}:{})};
      }catch{
        if(active!==controller || closed || signal.aborted&&!timedOut) return {outcome:'cancelled',instruction:''};
        console.warn(timedOut ? '[visual] analysis timed out' : '[visual] analysis failed');
        clear();state.plan=undefined;state.stage='waiting';
        state.screen={phase:'waiting',caption:{speaker:'agent',text:'Could not finish checking. Please try again.'}};
        await emit().catch(()=>{});
        return {outcome:'failed',instruction:timedOut?'That check took too long. Ask the caller to try again with a clear view.':'I could not finish checking the image. Ask the caller to retry; do not claim a diagnosis or a circle.'};
      }finally{
        trace(signal.aborted?'ended_aborted':'ended');
        clearTimeout(deadline);clearTimeout(reminder);
        if(active===controller){active=undefined;if(signal.aborted&&!closed&&!timedOut){clear();state.stage='waiting';await emit().catch(()=>{});}}
      }
    },
  };
}
