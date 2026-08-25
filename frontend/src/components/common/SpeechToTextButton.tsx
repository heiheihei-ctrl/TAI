import React from 'react';
import { Mic, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTencentRealtimeAsr } from '@/hooks/useTencentRealtimeAsr';
import { useLocaleText } from '@/utils/localeText';

type Props = {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  onError?: (message: string) => void;
  variant?: 'glass' | 'plain';
};

/**
 * 实时语音转文字：点击开始，识别中仅显示动画，再点一次结束。
 */
export default function SpeechToTextButton({
  value,
  onChange,
  className,
  style,
  disabled,
  onError,
  variant = 'glass',
}: Props) {
  const { lt } = useLocaleText();
  const { isListening, isStarting, error, toggle } = useTencentRealtimeAsr({
    value,
    onChange,
    onError,
  });

  const active = isListening || isStarting;
  const title = active
    ? lt('点击结束语音输入', 'Click to stop voice input')
    : lt('语音输入', 'Voice input');

  return (
    <div className={cn('inline-flex flex-col items-end gap-0.5', className)} style={style}>
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void toggle();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        title={title}
        aria-label={title}
        aria-pressed={active}
        data-speech-to-text={active ? 'active' : 'idle'}
        className={cn(
          'relative inline-flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-200',
          active
            ? 'bg-red-500 border-red-500 text-white hover:bg-red-600'
            : variant === 'glass'
              ? 'bg-liquid-glass backdrop-blur-liquid backdrop-saturate-125 border-liquid-glass shadow-liquid-glass hover:bg-liquid-glass-hover text-gray-700'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        {active ? (
          <>
            <span
              className="absolute inset-0 rounded-full bg-red-400/50 animate-ping"
              aria-hidden="true"
            />
            {isStarting ? (
              <Loader2 className="relative z-[1] h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mic className="relative z-[1] h-3.5 w-3.5" />
            )}
          </>
        ) : (
          <Mic className="h-3.5 w-3.5" />
        )}
      </button>
      {error ? (
        <span className="max-w-[160px] text-[10px] leading-tight text-red-500 text-right">
          {error}
        </span>
      ) : null}
    </div>
  );
}
