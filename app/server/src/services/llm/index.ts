import { env } from '../../config/env.js';
import type { ILlmService } from './ILlmService.js';
import { MockLlmService } from './MockLlmService.js';
import { OpenRouterLlmService } from './OpenRouterLlmService.js';

export function createLlmService(): ILlmService {
  if (env.MOCK_LLM) return new MockLlmService();
  return new OpenRouterLlmService(env.OPENROUTER_API_KEY!, env.OPENROUTER_MODEL);
}

export type { ILlmService, RoomAnalysisInput, RawLlmOutput } from './ILlmService.js';
