import { create } from 'zustand';
import { User } from '@rentsmart/contracts';

export type UserRole = 'landlord' | 'tenant';

interface AuthState {
  user: User | null;
  firebaseToken: string | null;
  userRole: UserRole | null;
  isLoading: boolean;
  error: string | null;

  setUser: (user: User) => void;
  setFirebaseToken: (token: string) => void;
  setUserRole: (role: UserRole) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  firebaseToken: null,
  userRole: null,
  isLoading: false,
  error: null,

  setUser: (user) => set({ user }),
  setFirebaseToken: (token) => set({ firebaseToken: token }),
  setUserRole: (role) => set({ userRole: role }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  logout: () => set({ user: null, firebaseToken: null, userRole: null }),
  reset: () => set({
    user: null,
    firebaseToken: null,
    userRole: null,
    isLoading: false,
    error: null,
  }),
}));
