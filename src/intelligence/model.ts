import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { z } from 'zod';

export interface ModelCall { provider: 'openai' | 'codex-cli'; model: string; operation: string; status: 'success' | 'failed'; durationMs: number }
export interface ModelRequest<T> { jpeg: Buffer; instructions: string; text: string; schema: z.ZodType<T>; name: string; model: string }
export type StructuredModel = <T>(request: ModelRequest<T>) => Promise<T>;
export type OnCall = (call: ModelCall) => void;
let client: OpenAI | undefined;
export function apiModel(onCall?: OnCall): StructuredModel {
  return async <T>({ jpeg, instructions, text, schema, name, model }: ModelRequest<T>) => {
    const start = performance.now();
    let actualModel = model;
    let status: ModelCall['status'] = 'failed';
    try {
      const res = await (client ??= new OpenAI()).responses.parse({
        model, instructions,
        ...(/^(gpt-5|o\d)/.test(model) ? { reasoning: { effort: 'low' as const } } : {}),
        input: [{ role: 'user', content: [
          { type: 'input_text', text },
          { type: 'input_image', image_url: `data:image/jpeg;base64,${jpeg.toString('base64')}`, detail: 'high' },
        ] }],
        text: { format: zodTextFormat(schema, name) },
      });
      actualModel = res.model;
      if (!res.output_parsed) throw new Error(`${name}: no parsed output`);
      const value = schema.parse(res.output_parsed);
      status = 'success';
      return value;
    } finally {
      onCall?.({ provider: 'openai', model: actualModel, operation: name, status, durationMs: Math.round(performance.now() - start) });
    }
  };
}
