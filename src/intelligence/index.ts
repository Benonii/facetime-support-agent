import type { Intelligence } from '../contracts.js';
import { findFix } from './kb.js';
import { mockIntelligence } from './mock.js';
import { observe } from './vision.js';
import { apiModel, type OnCall } from './model.js';
import { codexModel } from './codex.js';

export function selectProvider(env: NodeJS.ProcessEnv = process.env): 'openai' | 'codex-cli' {
  const provider = env.INTELLIGENCE_PROVIDER ?? 'openai';
  if (provider !== 'openai' && provider !== 'codex-cli') throw new Error('INTELLIGENCE_PROVIDER must be codex-cli or openai');
  return provider;
}

/** Live integration keeps its existing OpenAI default; the local photo runner chooses CLI. */
export function createIntelligence(onCall?: OnCall): Intelligence {
  if (process.env.MOCK_INTELLIGENCE === '1') return mockIntelligence;
  const generate = selectProvider() === 'codex-cli' ? codexModel({ onCall }) : apiModel(onCall);
  return { observe: req => observe(req, generate), findFix: req => findFix(req, generate) };
}
