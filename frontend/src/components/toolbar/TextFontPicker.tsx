import React, { useMemo } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  TEXT_TOOL_SYSTEM_FONTS,
  TEXT_TOOL_WEB_FONT_GROUPS,
  getTextToolFontOptionByValue,
  extractPrimaryFontFamily,
  type TextToolFontOption,
} from '@/constants/textToolFonts';

type TextFontPickerProps = {
  value: string;
  isZh: boolean;
  onChange: (fontFamily: string) => void;
  labelFont?: string;
};

const TextFontPicker: React.FC<TextFontPickerProps> = ({
  value,
  isZh,
  onChange,
  labelFont = 'Font',
}) => {
  const selectedOption = getTextToolFontOptionByValue(value);
  const selectedLabel = selectedOption
    ? isZh
      ? selectedOption.labelZh
      : selectedOption.labelEn
    : extractPrimaryFontFamily(value);

  const groups = useMemo(
    () => [
      ...TEXT_TOOL_WEB_FONT_GROUPS.map((group) => ({
        id: group.id,
        label: isZh ? group.labelZh : group.labelEn,
        fonts: group.fonts,
      })),
      {
        id: 'system',
        label: isZh ? '系统字体' : 'System fonts',
        fonts: TEXT_TOOL_SYSTEM_FONTS,
      },
    ],
    [isZh],
  );

  const renderFontItem = (font: TextToolFontOption) => {
    const isActive = value === font.value;
    const label = isZh ? font.labelZh : font.labelEn;
    const previewFamily = extractPrimaryFontFamily(font.value);

    return (
      <DropdownMenuItem
        key={font.value}
        type="button"
        className={cn(
          'mx-1 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors',
          isActive
            ? 'bg-gray-900 text-white hover:bg-gray-900'
            : 'text-gray-700 hover:bg-gray-100',
        )}
        style={{ fontFamily: previewFamily }}
        onClick={() => onChange(font.value)}
      >
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {isActive ? <Check className="ml-2 h-3.5 w-3.5 shrink-0" /> : null}
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className={cn(
          'flex h-8 w-full items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 text-xs text-gray-800',
          'transition-colors hover:border-gray-400 hover:bg-gray-50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300',
        )}
        title={labelFont}
      >
        <span
          className="min-w-0 flex-1 truncate text-left"
          style={{ fontFamily: extractPrimaryFontFamily(value) }}
        >
          {selectedLabel}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-500" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="left-0 right-auto w-full min-w-[168px] overflow-hidden rounded-xl border border-gray-200 bg-white p-0 shadow-lg"
      >
        <div className="max-h-[180px] overflow-y-auto overflow-x-hidden scrollbar-hidden">
          {groups.map((group, index) => (
            <div key={group.id}>
              {index > 0 ? <DropdownMenuSeparator className="my-1" /> : null}
              <DropdownMenuLabel className="sticky top-0 z-[1] border-b border-gray-100 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 shadow-[0_1px_0_rgba(255,255,255,0.9)]">
                {group.label}
              </DropdownMenuLabel>
              {group.fonts.map(renderFontItem)}
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default TextFontPicker;
