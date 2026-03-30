import { User, VerifyAuthBody, VerifyAuthResponse } from '@rentsmart/contracts';

class AuthService {
  private baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

  async verifyAuth(body: VerifyAuthBody): Promise<VerifyAuthResponse> {
    // Mock implementation for MVP
    const mockUser: User = {
      id: 'user-' + Math.random().toString(36).substring(7),
      phone: '+38161234567',
      display_name: body.display_name || 'Marko Marković',
      device_id: body.device_id,
      solana_pubkey: null,
    };

    return {
      user: mockUser,
      auth_source: 'firebase',
    };
  }

  async getMe(token: string): Promise<User> {
    // Mock implementation
    return {
      id: 'user-' + token.substring(0, 8),
      phone: '+38161234567',
      display_name: 'Marko Marković',
      device_id: 'device-123',
      solana_pubkey: null,
    };
  }

  async logout(): Promise<void> {
    // Mock logout
    return Promise.resolve();
  }
}

export const authService = new AuthService();
