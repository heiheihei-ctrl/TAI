import React from 'react';
import { Handle, Position } from 'reactflow';
import { useLocaleText } from '@/utils/localeText';
import FlowResizableNodeShell from './FlowResizableNodeShell';

type Props = {
  id: string;
  data: { prompt?: string; boxW?: number; boxH?: number };
  selected?: boolean;
};

function AnalysisOutputNodeInner({ id, data, selected }: Props) {
  const { lt } = useLocaleText();
  const [hover, setHover] = React.useState<string | null>(null);
  const borderColor = selected ? '#2563eb' : '#e5e7eb';
  const boxShadow = selected ? '0 0 0 2px rgba(37,99,235,0.12)' : '0 1px 2px rgba(0,0,0,0.04)';

  return (
    <FlowResizableNodeShell
      id={id}
      data={data}
      selected={selected}
      defaultWidth={240}
      defaultHeight={160}
      minWidth={180}
      minHeight={120}
      style={{
        padding: 8,
        background: '#fff',
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        boxShadow,
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        gap: 6,
      }}
    >

      <div style={{ fontWeight: 600 }}>{lt('提示词输出', 'Prompt output')}</div>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          padding: 8,
          fontSize: 12,
          color: data.prompt ? '#374151' : '#9ca3af',
          background: '#f9fafb',
          whiteSpace: 'pre-wrap',
        }}
      >
        {data.prompt && data.prompt.trim().length ? data.prompt : lt('分析结果将显示在这里', 'Analysis result will appear here')}
      </div>

      <Handle
        type="target"
        position={Position.Left}
        id="prompt"
        onMouseEnter={() => setHover('prompt-in')}
        onMouseLeave={() => setHover(null)}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="prompt"
        onMouseEnter={() => setHover('prompt-out')}
        onMouseLeave={() => setHover(null)}
      />

      {hover === 'prompt-in' && (
        <div className="flow-tooltip" style={{ left: -8, top: '50%', transform: 'translate(-100%, -50%)' }}>prompt</div>
      )}
      {hover === 'prompt-out' && (
        <div className="flow-tooltip" style={{ right: -8, top: '50%', transform: 'translate(100%, -50%)' }}>prompt</div>
      )}
    </FlowResizableNodeShell>
  );
}

export default React.memo(AnalysisOutputNodeInner);
