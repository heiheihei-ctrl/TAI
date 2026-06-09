import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AdminService } from './admin.service';

const EVENT_SETTINGS_KEY = 'event_settings';

type EventSettingsPayload = {
  images: string[];
  copy: string;
  link: string;
  eventAt: string;
  eventEndAt: string;
};

const parseIsoDateTime = (value?: string | null): string => {
  if (typeof value !== 'string' || !value.trim()) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const parseEventSettings = (value?: string | null): EventSettingsPayload => {
  if (!value) {
    return { images: [], copy: '', link: '', eventAt: '', eventEndAt: '' };
  }
  try {
    const parsed = JSON.parse(value) as Partial<EventSettingsPayload>;
    return {
      images: Array.isArray(parsed.images)
        ? parsed.images.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [],
      copy: typeof parsed.copy === 'string' ? parsed.copy : '',
      link: typeof parsed.link === 'string' ? parsed.link : '',
      eventAt: parseIsoDateTime(parsed.eventAt),
      eventEndAt: parseIsoDateTime(parsed.eventEndAt),
    };
  } catch {
    return { images: [], copy: '', link: '', eventAt: '', eventEndAt: '' };
  }
};

@ApiTags('公开设置')
@Controller('settings')
export class SettingsPublicController {
  constructor(private readonly adminService: AdminService) {}

  @Get('wechat-qrcodes')
  @ApiOperation({ summary: '获取微信二维码配置（公开接口）' })
  async getWeChatQrCodes() {
    const officialAccountSetting = await this.adminService.getSetting('wechat_official_account_qrcode');
    const wechatGroupSetting = await this.adminService.getSetting('wechat_group_qrcode');

    return {
      officialAccount: officialAccountSetting?.value || null,
      wechatGroup: wechatGroupSetting?.value || null,
    };
  }

  @Get('event-settings')
  @ApiOperation({ summary: '获取赛事设置（公开接口）' })
  async getEventSettings() {
    const setting = await this.adminService.getSetting(EVENT_SETTINGS_KEY);
    return parseEventSettings(setting?.value);
  }
}
