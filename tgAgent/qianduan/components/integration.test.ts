import { describe, it, expect } from 'vitest'
import path from 'path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * 工作区源码 = 布局壳 + 组件实现。
 *
 * canvas-workspace.tsx 已重构为薄壳（布局类名），具体组件下沉到
 * workspace/live-components.tsx。只读单一文件会断言不到实现细节，
 * 故拼接两处后再断言——任一侧移动/重命名都会被真实捕获。
 */
async function readWorkspaceSource(): Promise<string> {
  const fs = await import('node:fs')
  return [
    'canvas-workspace.tsx',
    'workspace/live-components.tsx',
    'workspace/fixture-components.tsx',
    'workspace/constants.ts',
    'workspace/types.ts',
  ]
    .map((p) => fs.readFileSync(path.join(__dirname, p), 'utf-8'))
    .join('\n')
}

describe('VideoConfirmDialog integration', () => {
  it('component file contains VideoConfirmDialog with all 10 motion presets', async () => {
    const content = await readWorkspaceSource()
    expect(content).toContain('VideoConfirmDialog')
    expect(content).toContain('video-confirm-backdrop')
    expect(content).toContain('video-confirm-dialog')
    const presets = ['orbit-left', 'orbit-right', 'orbit-top', 'push-in', 'pull-out',
      'dolly-zoom', 'crane-up', 'fly-through', 'pan-left', 'pan-right', 'static-timelapse']
    for (const preset of presets) {
      expect(content).toContain(preset)
    }
  })

  it('component file contains BriefPanel sidebar', async () => {
    const content = await readWorkspaceSource()
    expect(content).toContain('brief-sidebar')
    expect(content).toContain('<BriefPanel')
  })

  it('component file contains Canvas area section', async () => {
    const content = await readWorkspaceSource()
    expect(content).toContain('canvas-area')
  })

  it('component file contains CardContextMenu with pick options', async () => {
    const content = await readWorkspaceSource()
    expect(content).toContain('ctx-final')
    expect(content).toContain('ctx-weak')
    expect(content).toContain('ctx-candidate')
    expect(content).toContain('ctx-delete')
  })
})

describe('protocol integration', () => {
  it('presentation.ready is handled in useGatewayChat', async () => {
    const fs = await import('node:fs')
    const content = fs.readFileSync(path.join(__dirname, '../lib/useGatewayChat.ts'), 'utf-8')
    expect(content).toContain("case 'presentation.ready'")
  })

  it('presentation.ready is in DownstreamBody union', async () => {
    const fs = await import('node:fs')
    const content = fs.readFileSync(path.join(__dirname, '../lib/gateway.ts'), 'utf-8')
    expect(content).toContain("type: 'presentation.ready'")
  })
})

describe('gateway utilities', () => {
  it('assetHttpUrl passes through absolute URLs', async () => {
    const { assetHttpUrl } = await import('../lib/gateway')
    expect(assetHttpUrl('https://example.com/img.png')).toBe('https://example.com/img.png')
  })

  it('assetHttpUrl resolves relative URLs', async () => {
    const { assetHttpUrl } = await import('../lib/gateway')
    const result = assetHttpUrl('/mock-assets/test.svg')
    expect(result).toContain('mock-assets/test.svg')
  })
})
