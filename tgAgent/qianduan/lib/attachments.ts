'use client'

/**
 * 图片附件工具 —— 对应服务端协议 MsgSend.attachments 与 DESIGN.md §3.4 成本控制：
 * 上传图压缩到最长边 ≤1024px、JPEG 0.85，base64 后随消息发送（单条 ≤3 张由调用方控制）。
 */

import type { Attachment } from './gateway'

const MAX_EDGE = 1024

export async function fileToAttachment(file: File): Promise<Attachment> {
  if (!file.type.startsWith('image/')) throw new Error('仅支持图片附件')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  const commaIdx = dataUrl.indexOf(',')
  return { mediaType: 'image/jpeg', data: commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl }
}

/** 附件预览地址（缩略图 chip 用） */
export function attachmentPreviewUrl(a: Attachment): string {
  return `data:${a.mediaType};base64,${a.data}`
}
