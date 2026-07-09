import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type {
  WechatCustomMenuDraft,
  WechatMenuApiPayload,
} from './wechat-custom-menu.types';

type WechatOfficialStableAccessTokenRequest = {
  grant_type: 'client_credential';
  appid: string;
  secret: string;
  force_refresh?: boolean;
};

type WechatOfficialAccessTokenResponse = {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
};

type WechatApiResponse = {
  errcode?: number;
  errmsg?: string;
};

@Injectable()
export class WechatOfficialService {
  private readonly logger = new Logger(WechatOfficialService.name);
  private accessTokenCache: { token: string; expiresAt: number } | null = null;

  private getConfig() {
    const appId = (process.env.WECHAT_OFFICIAL_APP_ID || '').trim();
    const appSecret = (process.env.WECHAT_OFFICIAL_APP_SECRET || '').trim();
    if (!appId || !appSecret) {
      throw new BadRequestException(
        '未配置 WECHAT_OFFICIAL_APP_ID / WECHAT_OFFICIAL_APP_SECRET，无法调用微信公众号接口',
      );
    }
    return { appId, appSecret };
  }

  async getAccessToken(forceRefresh = false): Promise<string> {
    const config = this.getConfig();
    const now = Date.now();

    if (
      !forceRefresh &&
      this.accessTokenCache &&
      this.accessTokenCache.expiresAt > now + 60_000
    ) {
      return this.accessTokenCache.token;
    }

    const res = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credential',
        appid: config.appId,
        secret: config.appSecret,
        force_refresh: forceRefresh,
      } satisfies WechatOfficialStableAccessTokenRequest),
    });

    const data = (await res.json().catch(() => null)) as
      | WechatOfficialAccessTokenResponse
      | null;

    if (!res.ok || !data?.access_token) {
      const msg = data?.errmsg || `HTTP ${res.status}`;
      throw new BadRequestException(`微信公众号 access_token 获取失败: ${msg}`);
    }

    this.accessTokenCache = {
      token: data.access_token,
      expiresAt: now + Math.max((data.expires_in || 7200) - 300, 300) * 1000,
    };

    return data.access_token;
  }

  private shouldRefreshAccessToken(error?: WechatApiResponse | null) {
    const errCode = Number(error?.errcode);
    const errMsg = (error?.errmsg || '').toLowerCase();
    if (errCode === 40001 || errCode === 42001) return true;
    return (
      errMsg.includes('access_token is invalid') ||
      errMsg.includes('not latest') ||
      errMsg.includes('access token expired')
    );
  }

  private async callWechatApi<T extends WechatApiResponse>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const run = async (forceRefresh = false) => {
      const accessToken = await this.getAccessToken(forceRefresh);
      const url = new URL(`https://api.weixin.qq.com${path}`);
      url.searchParams.set('access_token', accessToken);
      const res = await fetch(url.toString(), init);
      return (await res.json().catch(() => null)) as T | null;
    };

    let data = await run(false);
    if (this.shouldRefreshAccessToken(data)) {
      data = await run(true);
    }
    if (!data) {
      throw new BadRequestException('微信公众号接口无响应');
    }
    if (Number(data.errcode) !== 0 && data.errcode !== undefined) {
      throw new BadRequestException(
        `微信公众号接口错误(${data.errcode}): ${data.errmsg || 'unknown'}`,
      );
    }
    return data;
  }

  async createCustomMenu(payload: WechatMenuApiPayload) {
    this.logger.log('[wechat-menu] create custom menu');
    return this.callWechatApi<WechatApiResponse>('/cgi-bin/menu/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async getCustomMenu() {
    return this.callWechatApi<Record<string, unknown>>('/cgi-bin/menu/get');
  }

  async getCurrentSelfMenuInfo() {
    return this.callWechatApi<Record<string, unknown>>(
      '/cgi-bin/get_current_selfmenu_info',
    );
  }

  async deleteCustomMenu() {
    this.logger.log('[wechat-menu] delete custom menu');
    return this.callWechatApi<WechatApiResponse>('/cgi-bin/menu/delete');
  }

  buildMenuApiPayload(draft: WechatCustomMenuDraft): WechatMenuApiPayload {
    return {
      button: draft.button.map((item) => {
        if (Array.isArray(item.sub_button) && item.sub_button.length > 0) {
          return {
            name: item.name,
            sub_button: item.sub_button.map((sub) => {
              const leaf: Record<string, unknown> = {
                type: sub.type,
                name: sub.name,
              };
              if (sub.type === 'click') leaf.key = sub.key;
              if (sub.type === 'view') leaf.url = sub.url;
              if (sub.type === 'miniprogram') {
                leaf.url = sub.url;
                leaf.appid = sub.appid;
                leaf.pagepath = sub.pagepath;
              }
              return leaf;
            }),
          };
        }

        const top: Record<string, unknown> = {
          type: item.type,
          name: item.name,
        };
        if (item.type === 'click') top.key = item.key;
        if (item.type === 'view') top.url = item.url;
        if (item.type === 'miniprogram') {
          top.url = item.url;
          top.appid = item.appid;
          top.pagepath = item.pagepath;
        }
        return top;
      }),
    };
  }
}
