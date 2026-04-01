import { User, VerifyAuthBody, VerifyAuthResponse } from '@rentsmart/contracts';
import { api } from './api';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

class AuthService {
  async verifyAuth(body: VerifyAuthBody): Promise<VerifyAuthResponse> {
    console.log('[authService] verifyAuth URL:', `${BASE_URL}/auth/verify`);
    const res = await fetch(`${BASE_URL}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      throw new Error(err.message || 'Provera nije uspela');
    }

    return res.json() as Promise<VerifyAuthResponse>;
  }

  async getMe(): Promise<User> {
    return api.get<User>('/auth/me');
  }

  async logout(): Promise<void> {
    return Promise.resolve();
  }
}

export const authService = new AuthService();
