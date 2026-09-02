import { useCallback, useEffect, useState } from 'react';
import EventSettingsModal from '@/components/home/EventSettingsModal';
import {
  FLOW_OPEN_ADD_PANEL_EVENT,
  type FlowOpenAddPanelDetail,
} from '@/config/canvasSummerPromo';
import { getDeploymentBrand } from '@/config/deploymentBrand';
import {
  ACTIVITY_SETTINGS_DISMISS_KEY,
  fetchPublicActivitySettings,
  getEventSettingsContentKey,
  isEventSettingsActive,
  type ActivitySettingsConfig,
} from '@/services/settingsApi';

/** 仅挂载于画布页：活动设置弹窗；点击弹窗打开节点面板并滚到视频类 */
export default function ActivitySettingsModalHost() {
  const [config, setConfig] = useState<ActivitySettingsConfig | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // 玲珑品牌不展示居中海报/活动弹窗
    if (getDeploymentBrand() === 'linglong') return;

    void fetchPublicActivitySettings().then((data) => {
      if (!isEventSettingsActive(data)) return;

      const dismissed = sessionStorage.getItem(ACTIVITY_SETTINGS_DISMISS_KEY);
      if (dismissed === getEventSettingsContentKey(data)) return;

      setConfig(data);
      setOpen(true);
    });
  }, []);

  const handleDialogClick = useCallback(() => {
    const detail: FlowOpenAddPanelDetail = {
      tab: 'nodes',
      focusGroup: 'video',
      highlightSeedance: true,
    };
    window.dispatchEvent(
      new CustomEvent(FLOW_OPEN_ADD_PANEL_EVENT, { detail }),
    );
  }, []);

  if (getDeploymentBrand() === 'linglong') {
    return null;
  }

  return (
    <EventSettingsModal
      open={open}
      config={config}
      dismissStorageKey={ACTIVITY_SETTINGS_DISMISS_KEY}
      onClose={() => setOpen(false)}
      onDialogClick={handleDialogClick}
    />
  );
}
