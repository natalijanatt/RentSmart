import { create } from 'zustand';
import { User } from '@rentsmart/contracts';

interface AuthState {
  user: User | null;
  firebaseToken: string | null;
  isLoading: boolean;
  error: string | null;

  setUser: (user: User) => void;
  setFirebaseToken: (token: string) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  firebaseToken: null,
  isLoading: false,
  error: null,

  setUser: (user) => set({ user }),
  setFirebaseToken: (token) => set({ firebaseToken: token }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  logout: () => set({ user: null, firebaseToken: null }),
  reset: () => set({
    user: null,
    firebaseToken: null,
    isLoading: false,
    error: null,
  }),
}));
