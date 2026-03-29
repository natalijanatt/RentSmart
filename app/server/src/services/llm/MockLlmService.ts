import type { ILlmService, RawLlmOutput, RoomAnalysisInput } from './ILlmService.js';

export class MockLlmService implements ILlmService {
  async analyzeRoom(input: RoomAnalysisInput): Promise<RawLlmOutput> {
    const mockResponse = {
      summary: `Mock inspection of ${input.roomType}: minor wear observed.`,
      overall_condition: 'good',
      findings: [
        {
          item: 'Wall paint',
          description: `Minor scuff marks on wall in ${input.roomType}.`,
          severity: 'minor',
          confidence: 0.9,
          wear_and_tear: false,
          location_in_image: 'center-left',
        },
      ],
    };

    return {
      model: 'mock-llm',
      prompt_tokens: 100,
      completion_tokens: 50,
      content: JSON.stringify(mockResponse),
    };
  }
}
