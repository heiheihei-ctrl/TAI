import React, { useCallback, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { AppLoader } from '@/components/AppLoader';
import { getStoredTokenExpiry } from '@/services/authApi';
import { useTranslation } from 'react-i18next';

interface AuthWrapperProps {
  children: React.ReactNode;
}

export const AuthWrapper: React.FC<AuthWrapperProps> = ({ children }) => {
  const { user, initializing, error } = useAuthStore();
  const { i18n } = useTranslation();
  const isZh = (i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('zh');
  const lt = useCallback((zhText: string, enText: string) => (isZh ? zhText : enText), [isZh]);

  useEffect(() => {
    // 等认证 init 完成后再判定；有 user 说明会话仍有效（可能刚刷新成功）。
    // 避免在 refresh 进行中仅因本地 token_expiry 过期就硬跳登录页（用户感知为闪退）。
    if (initializing || user) return;
    try {
      const expiry = getStoredTokenExpiry();
      if (expiry && expiry > Date.now()) return;
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: lt('当前登录已过期，请重新登录', 'Your login session has expired. Please sign in again'),
            type: 'info',
          },
        })
      );
      // 真正无会话时由 ProtectedRoute Navigate 到登录页，此处不再硬跳，避免与 refresh 竞态。
    } catch {
      // 忽略本地存储读取错误
    }
  }, [lt, initializing, user]);

  // 如果正在初始化认证状态，显示加载器
  if (initializing) {
    return <AppLoader message={lt('验证登录状态...', 'Verifying login status...')} />;
  }

  // 如果认证出错但没有用户，显示错误状态
  if (error && !user) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white">
        <div className="text-center">
          <img
            src="/TAI-logo.png"
            className="h-12 w-auto mx-auto mb-6 sm:h-16"
            alt="TAI"
          />
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800"
          >
            {lt('重新加载', 'Reload')}
          </button>
        </div>
      </div>
    );
  }

  // 认证成功，显示子组件
  return <>{children}</>;
};
