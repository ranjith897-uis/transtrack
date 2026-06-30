import { create } from 'zustand';
import { api, setTokens, clearTokens, getTokens } from '@/lib/api';
import { User } from '@/types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadCurrentUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  login: async (email: string, password: string) => {
    const data = await api.post<{ user: User; accessToken: string; refreshToken: string }>('/auth/login', {
      email,
      password,
    });
    await setTokens(data.accessToken, data.refreshToken);
    set({ user: data.user, isLoading: false });
  },

  logout: async () => {
    await clearTokens();
    set({ user: null, isLoading: false });
  },

  loadCurrentUser: async () => {
    const tokens = await getTokens();
    if (!tokens) {
      set({ user: null, isLoading: false });
      return;
    }
    try {
      const data = await api.get<{ user: User }>('/auth/me');
      set({ user: data.user, isLoading: false });
    } catch {
      await clearTokens();
      set({ user: null, isLoading: false });
    }
  },
}));
