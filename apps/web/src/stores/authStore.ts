// Auth Store - Zustand store for authentication state
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UserSafe, LoginResponse } from '@avc/shared-types';
import { api } from '../utils/api';

interface AuthState {
  user: UserSafe | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<void>;
  setUser: (user: UserSafe) => void;
  updateProfile: (data: Partial<UserSafe>) => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: true,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        const response = await api.post<LoginResponse>('/auth/login', { email, password });
        const { user, access_token, refresh_token, expires_in } = response.data;

        // Set token expiry
        const expiresAt = Date.now() + expires_in * 1000;
        localStorage.setItem('token_expires_at', expiresAt.toString());

        set({
          user,
          accessToken: access_token,
          refreshToken: refresh_token,
          isAuthenticated: true,
          isLoading: false,
        });

        api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      },

      logout: async () => {
        try {
          await api.post('/auth/logout');
        } catch {
          // Ignore logout errors
        }
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          // Without this the app stays in the loading state forever (a spinner
          // with no way to reach the login page) when the refresh token has
          // expired — the user is stuck on a blank screen.
          isLoading: false,
        });
        delete api.defaults.headers.common['Authorization'];
        localStorage.removeItem('token_expires_at');
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get();
        if (!refreshToken) throw new Error('No refresh token');

        const response = await api.post<LoginResponse>('/auth/refresh', { refresh_token: refreshToken });
        const { user, access_token, refresh_token, expires_in } = response.data;

        const expiresAt = Date.now() + expires_in * 1000;
        localStorage.setItem('token_expires_at', expiresAt.toString());

        set({
          user,
          accessToken: access_token,
          refreshToken: refresh_token,
        });
        api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      },

      setUser: (user: UserSafe) => set({ user }),

      updateProfile: (data: Partial<UserSafe>) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...data } : null,
        })),

      checkAuth: async () => {
        const accessToken = localStorage.getItem('accessToken') || get().accessToken;
        const refreshToken = localStorage.getItem('refreshToken') || get().refreshToken;

        if (!accessToken) {
          set({ isLoading: false, isAuthenticated: false });
          return;
        }

        // The access token may still be valid even without a refresh token —
        // always ask the server who the user is (the persisted user can be
        // stale: a changed site, a changed role).
        const expiresAt = localStorage.getItem('token_expires_at');
        const tokenExpired = !!expiresAt && Date.now() > parseInt(expiresAt);
        if (tokenExpired && refreshToken) {
          try {
            await get().refreshAccessToken();
          } catch {
            await get().logout();
            return;
          }
        } else if (tokenExpired && !refreshToken) {
          await get().logout();
          return;
        }

        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

        try {
          const response = await api.get<UserSafe>('/auth/me');
          set({
            user: response.data,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          // If /auth/me fails (e.g., token invalid), try to refresh once
          if (error instanceof Error && 'response' in error && (error as any).response?.status === 401) {
            try {
              await get().refreshAccessToken();
              // Retry the /auth/me call
              const response = await api.get<UserSafe>('/auth/me');
              set({
                user: response.data,
                accessToken: get().accessToken,
                refreshToken: get().refreshToken,
                isAuthenticated: true,
                isLoading: false,
              });
              return;
            } catch {
              await get().logout();
              return;
            }
          }
          set({ isLoading: false, isAuthenticated: false });
        }
      },
    }),
    {
      name: 'avc-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);

// Initialize auth on app start
if (typeof window !== 'undefined') {
  useAuthStore.getState().checkAuth();
}