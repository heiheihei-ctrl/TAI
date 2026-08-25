declare module '@/vendor/tencent-asr/speechrecognizer.es.js' {
  export class SpeechRecognizer {
    constructor(params: Record<string, unknown>, requestId?: string, isLog?: boolean);
    start(): Promise<void> | void;
    stop(): void;
    write(data: ArrayBuffer | Uint8Array | Blob | string): boolean | void;
    close(): void;
    OnRecognitionStart?: (res: unknown) => void;
    OnSentenceBegin?: (res: unknown) => void;
    OnRecognitionResultChange?: (res: unknown) => void;
    OnSentenceEnd?: (res: unknown) => void;
    OnRecognitionComplete?: (res: unknown) => void;
    OnError?: (res: unknown) => void;
  }

  export class WebAudioSpeechRecognizer {
    constructor(params: Record<string, unknown>, isLog?: boolean);
    start(): void;
    stop(): void;
    destroyStream(): void;
    OnRecognitionStart?: (res: unknown) => void;
    OnSentenceBegin?: (res: unknown) => void;
    OnRecognitionResultChange?: (res: unknown) => void;
    OnSentenceEnd?: (res: unknown) => void;
    OnRecognitionComplete?: (res: unknown) => void;
    OnError?: (res: unknown) => void;
    OnRecorderStop?: (res: unknown) => void;
  }

  export class SpeechRecognizerV2 {
    constructor(params: Record<string, unknown>, requestId?: string, isLog?: boolean);
  }

  export class WebAudioSpeechRecognizerV2 {
    constructor(params: Record<string, unknown>, isLog?: boolean);
  }
}
