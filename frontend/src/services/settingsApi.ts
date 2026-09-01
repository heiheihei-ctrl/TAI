import { getApiBaseUrl } from '@/utils/assetProxy';
import type { PaymentMembershipPlan } from '@/services/adminApi';

export type EventSettingsConfig = {
  images: string[];
  copy: string;
  link: string;
  /** ISO 8601，赛事开始时间，精确到秒 */
  eventAt: string;
  /** ISO 8601，赛事结束时间，精确到秒 */
  eventEndAt: string;
};

const EMPTY_EVENT_SETTINGS: EventSettingsConfig = {
  images: [],
  copy: '',
  link: '',
  eventAt: '',
  eventEndAt: '',
};

export const EVENT_SETTINGS_DISMISS_KEY = 'tai_event_settings_dismissed';

const parseIsoDateTime = (value?: string | null): string => {
  if (typeof value !== 'string' || !value.trim()) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

export function parseEventSettingsPayload(
  value?: Partial<EventSettingsConfig> | null
): EventSettingsConfig {
  if (!value || typeof value !== 'object') {
    return { ...EMPTY_EVENT_SETTINGS };
  }

  return {
    images: Array.isArray(value.images)
      ? value.images.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
    copy: typeof value.copy === 'string' ? value.copy : '',
    link: typeof value.link === 'string' ? value.link : '',
    eventAt: parseIsoDateTime(value.eventAt),
    eventEndAt: parseIsoDateTime(value.eventEndAt),
  };
}

export function hasEventSettingsContent(config: EventSettingsConfig): boolean {
  return (
    config.images.length > 0 ||
    config.copy.trim().length > 0 ||
    config.link.trim().length > 0
  );
}

/** 当前时间是否在赛事展示窗口内（未开始或已结束则不展示） */
export function isEventSettingsActive(
  config: EventSettingsConfig,
  now: Date = new Date(),
): boolean {
  if (!hasEventSettingsContent(config)) return false;

  const nowMs = now.getTime();

  if (config.eventAt) {
    const startMs = new Date(config.eventAt).getTime();
    if (!Number.isNaN(startMs) && nowMs < startMs) return false;
  }

  if (config.eventEndAt) {
    const endMs = new Date(config.eventEndAt).getTime();
    if (!Number.isNaN(endMs) && nowMs > endMs) return false;
  }

  return true;
}

export function getEventSettingsContentKey(config: EventSettingsConfig): string {
  return JSON.stringify({
    images: config.images,
    copy: config.copy.trim(),
    link: config.link.trim(),
    eventAt: config.eventAt,
    eventEndAt: config.eventEndAt,
  });
}

export async function fetchPublicMembershipPlans(): Promise<PaymentMembershipPlan[]> {
  try {
    const apiBase = getApiBaseUrl();
    const response = await fetch(`${apiBase}/api/payment/membership-plans`);
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as { plans?: PaymentMembershipPlan[] };
    return Array.isArray(data.plans) ? data.plans : [];
  } catch {
    return [];
  }
}

export async function fetchPublicEventSettings(): Promise<EventSettingsConfig> {
  try {
    const apiBase = getApiBaseUrl();
    const response = await fetch(`${apiBase}/api/settings/event-settings`);
    if (!response.ok) {
      return { ...EMPTY_EVENT_SETTINGS };
    }
    const data = (await response.json()) as Partial<EventSettingsConfig>;
    return parseEventSettingsPayload(data);
  } catch {
    return { ...EMPTY_EVENT_SETTINGS };
  }
}

export const ACTIVITY_SETTINGS_DISMISS_KEY = 'tai_activity_settings_dismissed';

export type ActivitySettingsConfig = EventSettingsConfig;

export async function fetchPublicActivitySettings(): Promise<ActivitySettingsConfig> {
  try {
    const apiBase = getApiBaseUrl();
    const response = await fetch(`${apiBase}/api/settings/activity-settings`);
    if (!response.ok) {
      return { ...EMPTY_EVENT_SETTINGS };
    }
    const data = (await response.json()) as Partial<ActivitySettingsConfig>;
    return parseEventSettingsPayload(data);
  } catch {
    return { ...EMPTY_EVENT_SETTINGS };
  }
}

export function openEventSettingsLink(link: string): void {
  const trimmed = link.trim();
  if (!trimmed) return;

  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('//')) {
    window.open(trimmed, '_blank', 'noopener,noreferrer');
    return;
  }

  window.location.href = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
