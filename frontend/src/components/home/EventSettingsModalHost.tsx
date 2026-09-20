import { useEffect, useState } from 'react';
import EventSettingsModal from '@/components/home/EventSettingsModal';
import { getDeploymentBrand } from '@/config/deploymentBrand';
import {
  EVENT_SETTINGS_DISMISS_KEY,
  fetchPublicEventSettings,
  getEventSettingsContentKey,
  isEventSettingsActive,
  type EventSettingsConfig,
} from '@/services/settingsApi';

export default function EventSettingsModalHost() {
  const [config, setConfig] = useState<EventSettingsConfig | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (getDeploymentBrand() === 'linglong') return;
    void fetchPublicEventSettings().then((data) => {
      if (!isEventSettingsActive(data)) return;

      const dismissed = sessionStorage.getItem(EVENT_SETTINGS_DISMISS_KEY);
      if (dismissed === getEventSettingsContentKey(data)) return;

      setConfig(data);
      setOpen(true);
    });
  }, []);

  if (getDeploymentBrand() === 'linglong') return null;

  return (
    <EventSettingsModal
      open={open}
      config={config}
      onClose={() => setOpen(false)}
    />
  );
}
