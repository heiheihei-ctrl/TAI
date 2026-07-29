import { create } from 'zustand';
import { authApi, type UserInfo } from '@/services/authApi';
import { clearTokens } from '@/services/authTokenStorage';
import { useTeamStore } from '@/stores/teamStore';
import {
  clearContactPopupShownDay,
  requestContactPopupOnNextEnter,
} from '@/utils/contactPopupStorage';
import {
  clearProfileCheckInBannerShownDay,
  requestProfileCheckInBannerOnNextEnter,
} from '@/utils/profileCheckInBannerStorage';

type AuthState = {
  user: UserInfo | null;
  loading: boolean;
  initializing: boolean; // 区分初始化加载和操作加载
  error: string | null;
  connection: 'mock' | 'server' | 'refresh' | 'local' | null;
  clearError: () => void;
  setAuthenticatedUser: (user: UserInfo, connection?: AuthState['connection']) => void;
  updateProfile: (payload: { name?: string; avatarUrl?: string | null }) => Promise<UserInfo>;
  init: () => Promise<void>;
  login: (phone: string, password: string) => Promise<void>;
  loginWithSms: (phone: string, code: string) => Promise<void>;
  register: (phone: string, password: string, confirmPassword: string, code: string, name: string, email?: string, inviteCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  forceLogout: (reason?: string) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  // 初始为 false，采用延迟初始化（只有进入受保护路由或登录时才触发）
  loading: false,
  initializing: false, // 初始化状态
  error: null,
  connection: null,
  clearError: () => set({ error: null }),
  setAuthenticatedUser: (user, connection = 'server') => {
    requestContactPopupOnNextEnter();
    requestProfileCheckInBannerOnNextEnter();
    set({ user, connection, error: null, loading: false, initializing: false });
  },
  updateProfile: async (payload) => {
    set({ loading: true, error: null });
    try {
      const { user } = await authApi.updateProfile(payload);
      set((state) => ({
        user: state.user ? { ...state.user, ...user } : user,
        loading: false,
        error: null,
      }));
      return user;
    } catch (e: any) {
      set({ loading: false, error: e?.message || '更新资料失败' });
      throw e;
    }
  },
  init: async () => {
    set({ initializing: true, error: null });
    try {
      // 详细来源：server / refresh / local / mock
      const { user, source } = await (authApi as any).meDetailed?.() ?? { user: await authApi.me(), source: null };
      set({ user, initializing: false, connection: (source as any) || null });
    } catch (e: any) {
      set({ initializing: false, error: e?.message || '加载失败' });
    }
  },
  loginWithSms: async (phone, code) => {
    set({ loading: true, error: null });
    try {
      const { user } = await authApi.loginWithSms({ phone, code });
      requestContactPopupOnNextEnter();
      requestProfileCheckInBannerOnNextEnter();
      set({ user, loading: false, connection: 'server' });
    } catch (e: any) {
      set({ loading: false, error: e?.message || '登录失败' });
      throw e;
    }
  },
  login: async (phone, password) => {
    set({ loading: true, error: null });
    try {
      const { user } = await authApi.login({ phone, password });
      requestContactPopupOnNextEnter();
      requestProfileCheckInBannerOnNextEnter();
      set({ user, loading: false, connection: 'server' });
    } catch (e: any) {
      set({ loading: false, error: e?.message || '登录失败' });
      throw e;
    }
  },
  register: async (phone, password, confirmPassword, code, name, email, inviteCode) => {
    set({ loading: true, error: null });
    try {
      await authApi.register({ phone, password, confirmPassword, code, name, email, inviteCode });
      set({ loading: false });
    } catch (e: any) {
      set({ loading: false, error: e?.message || '注册失败' });
      throw e;
    }
  },
  logout: async () => {
    set({ loading: true, error: null });
    clearContactPopupShownDay();
    clearProfileCheckInBannerShownDay();
    try {
      await authApi.logout();
      useTeamStore.getState().setTeams([]);
      useTeamStore.getState().setActiveTeamId(null);
      set({ user: null, loading: false, connection: null });
    } catch (e: any) {
      set({ loading: false, error: e?.message || '登出失败' });
    }
  },
  forceLogout: (reason) => {
    clearContactPopupShownDay();
    clearProfileCheckInBannerShownDay();
    set({
      user: null,
      loading: false,
      connection: null,
      error: reason || '登录状态已失效，请重新登录',
    });
    try {
      localStorage.removeItem('mock_user');
      localStorage.removeItem('token_expiry');
      localStorage.removeItem('last_auth_at');
      clearTokens();
    } catch {}
  }
}));
