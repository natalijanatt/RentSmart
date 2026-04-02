import { create } from 'zustand';
import { User } from '@rentsmart/contracts';

interface AuthState {
  user: User | null;
  firebaseToken: string | null;
  solanaPubkey: string | null;
  isLoading: boolean;
  error: string | null;

  setUser: (user: User) => void;
  setFirebaseToken: (token: string) => void;
  setSolanaPubkey: (pubkey: string) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  firebaseToken: null,
  solanaPubkey: null,
  isLoading: false,
  error: null,

  setUser: (user) => set({ user }),
  setFirebaseToken: (token) => set({ firebaseToken: token }),
  setSolanaPubkey: (pubkey) => set({ solanaPubkey: pubkey }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  logout: () => set({ user: null, firebaseToken: null, solanaPubkey: null }),
  reset: () => set({
    user: null,
    firebaseToken: null,
    solanaPubkey: null,
    isLoading: false,
    error: null,
  }),
}));
