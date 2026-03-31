export interface RoomAnalysisInput {
  roomId: string;
  roomType: string;
  checkinImageUrls: string[];
  checkoutImageUrls: string[];
}

export interface RawLlmOutput {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  content: string;
}

export interface ILlmService {
  analyzeRoom(input: RoomAnalysisInput): Promise<RawLlmOutput>;
}
