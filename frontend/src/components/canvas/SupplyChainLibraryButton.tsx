import React from "react";
import { Crown } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUIStore } from "@/stores";
import { useAIChatStore } from "@/stores/aiChatStore";
import { isLinglongRestrictedPalette } from "@/config/linglongPalette";
import { useLocaleText } from "@/utils/localeText";
import { cn } from "@/lib/utils";

/**
 * 玲珑专属：左侧工具栏下方单独一颗供应链图库入口（不并入工具栏主壳）。
 * 临时关闭：linglong 画布先隐藏该入口。
 */
const SUPPLY_CHAIN_LIBRARY_ENTRY_ENABLED = false;

const SupplyChainLibraryButton: React.FC = () => {
  const { lt } = useLocaleText();
  const isAIChatMaximized = useAIChatStore((s) => s.isMaximized);
  const chatTheme = useAIChatStore((s) => s.chatTheme);
  const isBlackTheme = chatTheme === "black";

  const {
    showLayerPanel,
    showSupplyChainLibrary,
    setShowSupplyChainLibrary,
    setShowLibraryPanel,
    setShowTemplatePanel,
  } = useUIStore(
    useShallow((state) => ({
      showLayerPanel: state.showLayerPanel,
      showSupplyChainLibrary: state.showSupplyChainLibrary,
      setShowSupplyChainLibrary: state.setShowSupplyChainLibrary,
      setShowLibraryPanel: state.setShowLibraryPanel,
      setShowTemplatePanel: state.setShowTemplatePanel,
    }))
  );

  if (
    !SUPPLY_CHAIN_LIBRARY_ENTRY_ENABLED ||
    !isLinglongRestrictedPalette() ||
    isAIChatMaximized
  ) {
    return null;
  }

  const handleToggle = () => {
    const next = !useUIStore.getState().showSupplyChainLibrary;
    if (next) {
      setShowLibraryPanel(false);
      setShowTemplatePanel(false);
    }
    setShowSupplyChainLibrary(next);
  };

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <div
        className="fixed z-[1000] transition-all duration-[50ms] ease-out"
        style={{
          left: showLayerPanel ? "322px" : "8px",
          // 主工具栏在垂直居中偏上；本按钮单独落在其下方
          top: "calc(50% + 220px)",
        }}
      >
        <div className="px-2">
          <div
            className={cn(
              "flex items-center justify-center rounded-full p-1",
              isBlackTheme
                ? "bg-[#1d1d1d] border border-[#1a1a1a] shadow-[0_12px_28px_rgba(0,0,0,0.55)]"
                : "bg-liquid-glass backdrop-blur-minimal backdrop-saturate-125 shadow-liquid-glass-lg border border-liquid-glass"
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showSupplyChainLibrary ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-8 w-8 rounded-full p-0",
                    showSupplyChainLibrary
                      ? isBlackTheme
                        ? "tanva-toolbar-active bg-white text-[#1d1d1d] border border-white hover:bg-white"
                        : "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                      : isBlackTheme
                        ? "bg-transparent text-gray-300 border-transparent hover:bg-white/10"
                        : "bg-white/60 text-gray-700 border-transparent hover:bg-white"
                  )}
                  onClick={handleToggle}
                >
                  <Crown className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {lt("供应链图库", "Supply Chain Gallery")}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default SupplyChainLibraryButton;
