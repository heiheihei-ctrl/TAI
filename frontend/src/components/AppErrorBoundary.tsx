import React from 'react';

type AppErrorBoundaryProps = {
  children: React.ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const title = this.props.fallbackTitle ?? '页面加载异常';
    const message =
      this.props.fallbackMessage ??
      '应用遇到错误，已阻止白屏崩溃。请刷新页面重试；若仍失败，可尝试清除浏览器缓存后重新登录。';

    return (
      <div className='flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-white'>
        <div className='w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl'>
          <h1 className='text-lg font-semibold'>{title}</h1>
          <p className='mt-3 text-sm leading-6 text-slate-300'>{message}</p>
          {import.meta.env.DEV && (
            <pre className='mt-4 max-h-40 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-red-300 whitespace-pre-wrap'>
              {this.state.error.message}
            </pre>
          )}
          <button
            type='button'
            onClick={this.handleReload}
            className='mt-6 w-full rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600'
          >
            刷新页面
          </button>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
