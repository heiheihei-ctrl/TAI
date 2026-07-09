export type WechatMenuLeafType = 'click' | 'view' | 'miniprogram';

export interface WechatMenuLeafButton {
  type: WechatMenuLeafType;
  name: string;
  key?: string;
  url?: string;
  appid?: string;
  pagepath?: string;
}

export interface WechatMenuTopButton {
  name: string;
  type?: WechatMenuLeafType;
  key?: string;
  url?: string;
  appid?: string;
  pagepath?: string;
  sub_button?: WechatMenuLeafButton[];
}

export interface WechatCustomMenuDraft {
  button: WechatMenuTopButton[];
}

export interface WechatMenuApiPayload {
  button: Array<Record<string, unknown>>;
}
