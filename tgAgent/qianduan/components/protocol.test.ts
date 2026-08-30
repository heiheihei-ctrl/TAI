import { describe, it, expect } from 'vitest'
import type { DownstreamBody } from '../lib/gateway'
import { assetHttpUrl } from '../lib/gateway'

describe('gateway protocol', () => {
  it('assetHttpUrl passes through absolute URLs', () => {
    expect(assetHttpUrl('https://example.com/img.png')).toBe('https://example.com/img.png')
  })

  it('assetHttpUrl resolves relative URLs against gateway origin', () => {
    expect(assetHttpUrl('/mock-assets/test.svg')).toContain('mock-assets/test.svg')
  })

  it('DownstreamBody union covers all protocol message types', () => {
    const bodies: DownstreamBody[] = [
      { type: 'conversation.delta', sessionId: 's1', delta: 'hi' },
      { type: 'tool.status', sessionId: 's1', callId: 'c1', name: 'x', state: 'running', progress: { stage: 'q', percent: 50 } },
      { type: 'canvas.place', sessionId: 's1', cards: [] },
      { type: 'brief.updated', sessionId: 's1', brief: { styleKeywords: [], materials: [], negative: [], freeText: '', completeness: 'ready', updatedAt: '' } },
      { type: 'canvas.update', sessionId: 's1', updates: [] },
      { type: 'asset.video_completed', sessionId: 's1', jobId: 'j1', asset: {} },
      { type: 'error', sessionId: 's1', code: 'internal', message: 'x' },
      { type: 'job.accepted', sessionId: 's1', job: {} },
    ]
    // Every entry must be a valid DownstreamBody (type narrowing)
    expect(bodies.length).toBe(8)
  })
})
