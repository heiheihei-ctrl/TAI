import React, { useEffect, useState, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

const Toast: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string; type?: ToastType }>).detail;
      if (detail?.message) {
        addToast(detail.message, detail.type || 'info');
      }
    };

    window.addEventListener('toast', handleToast);
    return () => window.removeEventListener('toast', handleToast);
  }, [addToast]);

  const getToastStyle = (type: ToastType) => {
    switch (type) {
      case 'success':
        return 'border-emerald-200 bg-emerald-50 text-emerald-700';
      case 'error':
        return 'border-red-200 bg-red-50 text-red-700';
      case 'warning':
        return 'border-yellow-200 bg-yellow-50 text-yellow-700';
      case 'info':
      default:
        return 'border-blue-200 bg-blue-50 text-blue-700';
    }
  };

  return (
    <div className="fixed right-6 top-6 z-[100] space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`min-w-[240px] rounded-lg border px-4 py-3 text-sm shadow-lg ${getToastStyle(toast.type)}`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
};

export default Toast;