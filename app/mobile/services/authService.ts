import { User, VerifyAuthBody, VerifyAuthResponse } from '@rentsmart/contracts';
import api from './api';

class AuthService {
  async verifyAuth(body: VerifyAuthBody): Promise<VerifyAuthResponse> {
    const response = await api.post<VerifyAuthResponse>('/auth/verify', body);
    return response.data;
  }

  async getMe(token: string): Promise<User> {
    const response = await api.get<{ user: User }>('/auth/me');
    return response.data.user;
  }

  async logout(): Promise<void> {
    return Promise.resolve();
  }
}

export const authService = new AuthService();
