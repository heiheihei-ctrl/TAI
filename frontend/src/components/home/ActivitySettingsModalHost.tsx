import { useEffect, useState } from 'react';
import EventSettingsModal from '@/components/home/EventSettingsModal';
import {
  ACTIVITY_SETTINGS_DISMISS_KEY,
  fetchPublicActivitySettings,
  getEventSettingsContentKey,
  isEventSettingsActive,
  type ActivitySettingsConfig,
} from '@/services/settingsApi';

/** 仅挂载于画布页：活动设置弹窗（逻辑同赛事设置） */
export default function ActivitySettingsModalHost() {
  const [config, setConfig] = useState<ActivitySettingsConfig | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void fetchPublicActivitySettings().then((data) => {
      if (!isEventSettingsActive(data)) return;

      const dismissed = sessionStorage.getItem(ACTIVITY_SETTINGS_DISMISS_KEY);
      if (dismissed === getEventSettingsContentKey(data)) return;

      setConfig(data);
      setOpen(true);
    });
  }, []);

  return (
    <EventSettingsModal
      open={open}
      config={config}
      dismissStorageKey={ACTIVITY_SETTINGS_DISMISS_KEY}
      onClose={() => setOpen(false)}
    />
  );
}
