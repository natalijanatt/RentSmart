import { AppError } from '../../shared/utils/errors.js';
import type { ILlmService, RawLlmOutput, RoomAnalysisInput } from './ILlmService.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

function buildPrompt(roomType: string): string {
  return `You are a property inspection AI. Compare the check-in photos (start of tenancy) with the check-out photos (end of tenancy) for this room: ${roomType}.

Return ONLY valid JSON with no markdown fences or explanation:
{
  "summary": "brief condition description",
  "overall_condition": "excellent|good|fair|damaged",
  "findings": [
    {
      "item": "item name",
      "description": "what changed or is damaged",
      "severity": "none|minor|medium|major",
      "confidence": 0.85,
      "wear_and_tear": false,
      "location_in_image": "bottom-left corner"
    }
  ]
}

If no damage or changes, return findings as an empty array.`;
}

type ImageUrlContent = {
  type: 'image_url';
  image_url: { url: string };
};

type TextContent = {
  type: 'text';
  text: string;
};

type MessageContent = TextContent | ImageUrlContent;

export class OpenRouterLlmService implements ILlmService {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async analyzeRoom(input: RoomAnalysisInput): Promise<RawLlmOutput> {
    const content: MessageContent[] = [
      { type: 'text', text: buildPrompt(input.roomType) },
      ...input.checkinImageUrls.map(
        (url): ImageUrlContent => ({ type: 'image_url', image_url: { url } }),
      ),
      ...input.checkoutImageUrls.map(
        (url): ImageUrlContent => ({ type: 'image_url', image_url: { url } }),
      ),
    ];

    const response = await fetch(OPENROUTER_BASE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!response.ok) {
      throw AppError.internal(`OpenRouter request failed: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const rawContent = json.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw AppError.internal('OpenRouter returned empty response.');
    }

    return {
      model: json.model ?? this.model,
      prompt_tokens: json.usage?.prompt_tokens ?? 0,
      completion_tokens: json.usage?.completion_tokens ?? 0,
      content: rawContent,
    };
  }
}
