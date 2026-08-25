import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTencentAsrConfig, signTencentAsr } from '@/services/tencentAsrAPI';
import {
  extractAsrVoiceText,
  joinAsrText,
  loadWebAudioSpeechRecognizer,
} from '@/services/tencentRealtimeAsr';

export type UseTencentRealtimeAsrOptions = {
  /** 当前输入框完整文本（开始录音时作为 base） */
  value: string;
  /** 写入输入框（含实时 interim） */
  onChange: (next: string) => void;
  onError?: (message: string) => void;
};

export type UseTencentRealtimeAsrResult = {
  isListening: boolean;
  isStarting: boolean;
  error: string | null;
  toggle: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => void;
};

function normalizeAsrError(err: unknown): string {
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err && typeof err === 'object') {
    const anyErr = err as Record<string, unknown>;
    const msg =
      (typeof anyErr.message === 'string' && anyErr.message) ||
      (typeof anyErr.error === 'string' && anyErr.error) ||
      (typeof anyErr.msg === 'string' && anyErr.msg) ||
      '';
    if (msg) return msg;
    try {
      return JSON.stringify(err);
    } catch {
      // ignore
    }
  }
  return '语音识别失败';
}

export function useTencentRealtimeAsr(
  options: UseTencentRealtimeAsrOptions,
): UseTencentRealtimeAsrResult {
  const { value, onChange, onError } = options;
  const [isListening, setIsListening] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognizerRef = useRef<any>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);
  const baseTextRef = useRef('');
  const committedRef = useRef('');
  const listeningRef = useRef(false);
  const startingRef = useRef(false);
  const sessionIdRef = useRef(0);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const emitError = useCallback((message: string) => {
    const text = message || '语音识别失败';
    setError(text);
    onErrorRef.current?.(text);
  }, []);

  const cleanupRecognizer = useCallback(() => {
    const instance = recognizerRef.current;
    recognizerRef.current = null;
    listeningRef.current = false;
    startingRef.current = false;
    setIsListening(false);
    setIsStarting(false);
    if (!instance) return;
    try {
      instance.stop?.();
    } catch {
      // ignore
    }
    try {
      instance.destroyStream?.();
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => () => cleanupRecognizer(), [cleanupRecognizer]);

  const stop = useCallback(() => {
    sessionIdRef.current += 1;
    cleanupRecognizer();
  }, [cleanupRecognizer]);

  const pushText = useCallback((committed: string, interim = '') => {
    const next = joinAsrText(baseTextRef.current, committed, interim);
    onChangeRef.current(next);
  }, []);

  const start = useCallback(async () => {
    if (listeningRef.current || startingRef.current) return;

    const sessionId = sessionIdRef.current + 1;
    sessionIdRef.current = sessionId;
    startingRef.current = true;
    listeningRef.current = true;
    setIsStarting(true);
    setIsListening(true);
    setError(null);

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('当前浏览器不支持麦克风录音，请使用 Chrome / Edge（需 HTTPS 或 localhost）');
      }

      const config = await fetchTencentAsrConfig();
      if (sessionIdRef.current !== sessionId) return;

      const WebAudioSpeechRecognizer = await loadWebAudioSpeechRecognizer();
      if (sessionIdRef.current !== sessionId) return;

      baseTextRef.current = valueRef.current || '';
      committedRef.current = '';

      const params: Record<string, unknown> = {
        appid: String(config.appId),
        secretid: config.secretId,
        // secretkey 留空：强制走后端 signCallback，避免 SDK 本地签名
        secretkey: '',
        engine_model_type: config.engineModelType || '16k_zh',
        voice_format: 1,
        needvad: 1,
        filter_dirty: 1,
        filter_modal: 1,
        filter_punc: 0,
        convert_num_mode: 1,
        signCallback: async (signStr: string) => {
          const signature = await signTencentAsr(signStr);
          return signature;
        },
      };

      const recognizer = new WebAudioSpeechRecognizer(params, false);
      if (sessionIdRef.current !== sessionId) {
        try {
          recognizer.stop?.();
          recognizer.destroyStream?.();
        } catch {
          // ignore
        }
        return;
      }
      recognizerRef.current = recognizer;

      recognizer.OnRecognitionStart = () => {
        if (sessionIdRef.current !== sessionId) return;
        startingRef.current = false;
        setIsStarting(false);
        setIsListening(true);
      };

      recognizer.OnSentenceBegin = () => {
        // no-op：保持会话
      };

      recognizer.OnRecognitionResultChange = (res: any) => {
        if (sessionIdRef.current !== sessionId) return;
        const interim = extractAsrVoiceText(res);
        if (!interim) return;
        pushText(committedRef.current, interim);
      };

      recognizer.OnSentenceEnd = (res: any) => {
        if (sessionIdRef.current !== sessionId) return;
        const finalText = extractAsrVoiceText(res);
        if (finalText) {
          committedRef.current = `${committedRef.current}${finalText}`;
        }
        pushText(committedRef.current, '');
      };

      recognizer.OnRecognitionComplete = () => {
        if (sessionIdRef.current !== sessionId) return;
        cleanupRecognizer();
      };

      recognizer.OnError = (err: unknown) => {
        if (sessionIdRef.current !== sessionId) return;
        // SDK 在正常 stop 时也可能触发 close 回调；若已主动结束则忽略
        if (!listeningRef.current && !startingRef.current) return;
        emitError(normalizeAsrError(err));
        cleanupRecognizer();
      };

      recognizer.OnRecorderStop = () => {
        if (sessionIdRef.current !== sessionId) return;
        // 录音停止后仍保留已提交文本；仅清理连接
        cleanupRecognizer();
      };

      recognizer.start();
    } catch (err) {
      if (sessionIdRef.current !== sessionId) return;
      emitError(normalizeAsrError(err));
      cleanupRecognizer();
    }
  }, [cleanupRecognizer, emitError, pushText]);

  const toggle = useCallback(async () => {
    if (listeningRef.current || startingRef.current || isListening || isStarting) {
      stop();
      return;
    }
    await start();
  }, [isListening, isStarting, start, stop]);

  return {
    isListening,
    isStarting,
    error,
    toggle,
    start,
    stop,
  };
}
