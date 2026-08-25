export type TencentAsrConfig = {
  available: boolean;
  appId: string;
  secretId: string;
  engineModelType: string;
};

type SpeechRecognizerInstance = {
  start: () => void;
  stop: () => void;
  destroyStream?: () => void;
  OnRecognitionStart?: (res: unknown) => void;
  OnSentenceBegin?: (res: unknown) => void;
  OnRecognitionResultChange?: (res: any) => void;
  OnSentenceEnd?: (res: any) => void;
  OnRecognitionComplete?: (res: unknown) => void;
  OnError?: (res: unknown) => void;
  OnRecorderStop?: (res: unknown) => void;
};

type WebAudioSpeechRecognizerCtor = new (
  params: Record<string, unknown>,
  isLog?: boolean,
) => SpeechRecognizerInstance;

let recognizerCtorPromise: Promise<WebAudioSpeechRecognizerCtor> | null = null;

export async function loadWebAudioSpeechRecognizer(): Promise<WebAudioSpeechRecognizerCtor> {
  if (!recognizerCtorPromise) {
    recognizerCtorPromise = import(
      '@/vendor/tencent-asr/speechrecognizer.es.js'
    ).then((mod: any) => {
      const Ctor =
        mod?.WebAudioSpeechRecognizer ||
        (typeof window !== 'undefined'
          ? (window as any).WebAudioSpeechRecognizer
          : null);
      if (!Ctor) {
        throw new Error('腾讯云语音识别 SDK 加载失败');
      }
      return Ctor as WebAudioSpeechRecognizerCtor;
    });
  }
  return recognizerCtorPromise;
}

export function extractAsrVoiceText(payload: any): string {
  const direct =
    payload?.result?.voice_text_str ||
    payload?.voice_text_str ||
    payload?.result?.text ||
    '';
  if (typeof direct === 'string' && direct.trim()) {
    return direct;
  }
  return '';
}

export function joinAsrText(base: string, committed: string, interim = ''): string {
  const head = String(base || '');
  const body = `${committed || ''}${interim || ''}`;
  if (!head) return body;
  if (!body) return head;
  // 中文通常无需空格；若 base 以空白结尾则直接拼接
  if (/\s$/.test(head) || /^[A-Za-z0-9]/.test(body)) {
    const needsSpace = !/\s$/.test(head) && /^[A-Za-z0-9]/.test(body);
    return needsSpace ? `${head} ${body}` : `${head}${body}`;
  }
  return `${head}${body}`;
}
