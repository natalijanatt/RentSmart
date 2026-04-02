import { AppError } from '../../shared/utils/errors.js';
import type { ILlmService, RawLlmOutput, RoomAnalysisInput } from './ILlmService.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

function buildPrompt(roomType: string, checkinCount: number, checkoutCount: number): string {
  return `You are a property inspection AI. Compare the check-in photos (start of tenancy) with the check-out photos (end of tenancy) for this room: ${roomType}.

The first ${checkinCount} image(s) are CHECK-IN photos. The next ${checkoutCount} image(s) are CHECK-OUT photos.

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

const MAX_IMAGES_PER_REQUEST = 10;

function capImages(
  checkinUrls: string[],
  checkoutUrls: string[],
): { checkin: string[]; checkout: string[] } {
  const total = checkinUrls.length + checkoutUrls.length;
  if (total <= MAX_IMAGES_PER_REQUEST) {
    return { checkin: checkinUrls, checkout: checkoutUrls };
  }

  const checkinShare = Math.max(1, Math.round((checkinUrls.length / total) * MAX_IMAGES_PER_REQUEST));
  const checkoutShare = Math.max(1, MAX_IMAGES_PER_REQUEST - checkinShare);
  const finalCheckin = Math.min(checkinShare, MAX_IMAGES_PER_REQUEST - 1);
  const finalCheckout = Math.min(checkoutShare, MAX_IMAGES_PER_REQUEST - finalCheckin);

  return {
    checkin: checkinUrls.slice(0, finalCheckin),
    checkout: checkoutUrls.slice(0, finalCheckout),
  };
}

async function toBase64DataUrl(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${imageUrl}`);
  const contentType = res.headers.get('content-type') ?? 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

export class OpenRouterLlmService implements ILlmService {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async analyzeRoom(input: RoomAnalysisInput): Promise<RawLlmOutput> {
    const { checkin, checkout } = capImages(input.checkinImageUrls, input.checkoutImageUrls);
    const allUrls = [...checkin, ...checkout];
    const base64Urls = await Promise.all(allUrls.map(toBase64DataUrl));

    const content: MessageContent[] = [
      {
        type: 'text',
        text: buildPrompt(input.roomType, checkin.length, checkout.length),
      },
      ...base64Urls.map(
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
      const errorBody = await response.text().catch(() => '(could not read body)');
      console.error(`OpenRouter error response [${response.status}]:`, errorBody);
      throw AppError.internal(
        `OpenRouter request failed: ${response.status} ${response.statusText}`,
      );
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
