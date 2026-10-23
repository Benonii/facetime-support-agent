import type { Intelligence } from '../contracts.js';
import { findFix } from './kb.js';
import { mockIntelligence } from './mock.js';
import { observe } from './vision.js';

/** Real models by default. MOCK_INTELLIGENCE=1 returns canned answers so the agent and screens can be built without API keys. */
export function createIntelligence(): Intelligence {
  if (process.env.MOCK_INTELLIGENCE === '1') return mockIntelligence;
  return { observe, findFix };
}
