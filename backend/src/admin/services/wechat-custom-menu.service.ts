import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WechatOfficialService } from '../../wechat-official/wechat-official.service';
import type {
  WechatCustomMenuDraft,
  WechatMenuLeafButton,
  WechatMenuTopButton,
} from '../../wechat-official/wechat-custom-menu.types';

export const WECHAT_CUSTOM_MENU_DRAFT_KEY = 'wechat_custom_menu_draft';

const MAX_TOP_BUTTONS = 3;
const MAX_SUB_BUTTONS = 5;

@Injectable()
export class WechatCustomMenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wechatOfficialService: WechatOfficialService,
  ) {}

  private emptyDraft(): WechatCustomMenuDraft {
    return { button: [] };
  }

  private normalizeDraft(raw: unknown): WechatCustomMenuDraft {
    if (!raw || typeof raw !== 'object') return this.emptyDraft();
    const button = Array.isArray((raw as WechatCustomMenuDraft).button)
      ? (raw as WechatCustomMenuDraft).button
      : [];
    return {
      button: button.map((item) => ({
        name: String(item?.name || '').trim(),
        type: item?.type,
        key: item?.key,
        url: item?.url,
        appid: item?.appid,
        pagepath: item?.pagepath,
        sub_button: Array.isArray(item?.sub_button)
          ? item.sub_button.map((sub) => ({
              type: sub.type,
              name: String(sub?.name || '').trim(),
              key: sub?.key,
              url: sub?.url,
              appid: sub?.appid,
              pagepath: sub?.pagepath,
            }))
          : undefined,
      })),
    };
  }

  private getNameLimit(isSubMenu: boolean) {
    return isSubMenu ? 8 : 4;
  }

  private validateName(name: string, isSubMenu: boolean) {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('菜单名称不能为空');
    }
    const limit = this.getNameLimit(isSubMenu);
    if (trimmed.length > limit) {
      throw new BadRequestException(
        `${isSubMenu ? '子菜单' : '一级菜单'}名称不能超过 ${limit} 个汉字`,
      );
    }
  }

  private validateLeaf(button: WechatMenuLeafButton, label: string) {
    this.validateName(button.name, true);
    if (!button.type) {
      throw new BadRequestException(`${label} 缺少菜单类型`);
    }
    if (button.type === 'click') {
      if (!String(button.key || '').trim()) {
        throw new BadRequestException(`${label} 的 key 不能为空`);
      }
    }
    if (button.type === 'view') {
      if (!String(button.url || '').trim()) {
        throw new BadRequestException(`${label} 的链接 url 不能为空`);
      }
    }
    if (button.type === 'miniprogram') {
      if (!String(button.appid || '').trim()) {
        throw new BadRequestException(`${label} 的小程序 appid 不能为空`);
      }
      if (!String(button.pagepath || '').trim()) {
        throw new BadRequestException(`${label} 的小程序 pagepath 不能为空`);
      }
      if (!String(button.url || '').trim()) {
        throw new BadRequestException(`${label} 的备用 url 不能为空`);
      }
    }
  }

  private validateTopButton(button: WechatMenuTopButton, index: number) {
    const label = `第 ${index + 1} 个一级菜单`;
    this.validateName(button.name, false);

    const subButtons = Array.isArray(button.sub_button) ? button.sub_button : [];
    if (subButtons.length > 0) {
      if (subButtons.length > MAX_SUB_BUTTONS) {
        throw new BadRequestException(`${label} 的子菜单不能超过 ${MAX_SUB_BUTTONS} 个`);
      }
      subButtons.forEach((sub, subIndex) => {
        this.validateLeaf(sub, `${label} 的第 ${subIndex + 1} 个子菜单`);
      });
      return;
    }

    if (!button.type) {
      throw new BadRequestException(`${label} 需要设置菜单动作或添加子菜单`);
    }
    this.validateLeaf(
      {
        type: button.type,
        name: button.name,
        key: button.key,
        url: button.url,
        appid: button.appid,
        pagepath: button.pagepath,
      },
      label,
    );
  }

  validateDraft(draft: WechatCustomMenuDraft) {
    const buttons = Array.isArray(draft.button) ? draft.button : [];
    if (buttons.length === 0) {
      throw new BadRequestException('至少配置一个一级菜单');
    }
    if (buttons.length > MAX_TOP_BUTTONS) {
      throw new BadRequestException(`一级菜单不能超过 ${MAX_TOP_BUTTONS} 个`);
    }
    buttons.forEach((button, index) => this.validateTopButton(button, index));
    return draft;
  }

  async getDraft() {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: WECHAT_CUSTOM_MENU_DRAFT_KEY },
    });
    if (!setting?.value) {
      return this.emptyDraft();
    }
    try {
      return this.normalizeDraft(JSON.parse(setting.value));
    } catch {
      return this.emptyDraft();
    }
  }

  async saveDraft(draft: WechatCustomMenuDraft, updatedBy: string) {
    const normalized = this.validateDraft(this.normalizeDraft(draft));
    await this.prisma.systemSetting.upsert({
      where: { key: WECHAT_CUSTOM_MENU_DRAFT_KEY },
      update: {
        value: JSON.stringify(normalized),
        description: '微信公众号自定义菜单草稿',
        updatedBy,
      },
      create: {
        key: WECHAT_CUSTOM_MENU_DRAFT_KEY,
        value: JSON.stringify(normalized),
        description: '微信公众号自定义菜单草稿',
        updatedBy,
      },
    });
    return normalized;
  }

  async publishDraft(updatedBy: string) {
    const draft = this.validateDraft(await this.getDraft());
    const payload = this.wechatOfficialService.buildMenuApiPayload(draft);
    const result = await this.wechatOfficialService.createCustomMenu(payload);
    await this.prisma.systemSetting.upsert({
      where: { key: WECHAT_CUSTOM_MENU_DRAFT_KEY },
      update: {
        value: JSON.stringify(draft),
        description: '微信公众号自定义菜单草稿',
        updatedBy,
        metadata: {
          lastPublishedAt: new Date().toISOString(),
          lastPublishedBy: updatedBy,
        },
      },
      create: {
        key: WECHAT_CUSTOM_MENU_DRAFT_KEY,
        value: JSON.stringify(draft),
        description: '微信公众号自定义菜单草稿',
        updatedBy,
        metadata: {
          lastPublishedAt: new Date().toISOString(),
          lastPublishedBy: updatedBy,
        },
      },
    });
    return { draft, result };
  }

  async getRemoteMenu() {
    try {
      return await this.wechatOfficialService.getCurrentSelfMenuInfo();
    } catch {
      return await this.wechatOfficialService.getCustomMenu();
    }
  }

  async deleteRemoteMenu() {
    return this.wechatOfficialService.deleteCustomMenu();
  }
}
