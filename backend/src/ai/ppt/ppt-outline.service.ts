import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { PptOutlinePage, PptOutlineResult } from './ppt-outline.types';

const PPT_OUTLINE_SYSTEM_PROMPT = `你是专业的建筑设计/方案汇报 PPT 大纲策划助手。
用户会用一句话描述想要的演示文稿主题。请据此生成结构清晰、可直接用于排版的多页大纲。

要求：
1. 输出 6～12 页，覆盖完整汇报逻辑（封面、目录、分析、方案、细节、总结等按主题取舍）。
2. 每一页必须包含：
   - title：简洁中文标题（一般 4～12 字）
   - content：该页画面与文案说明，写清版式、主图内容、配色/标注/图例等设计指引，便于后续生图与排版；用中文，2～5 句，不要空泛口号。
3. 只输出 JSON，不要 markdown 代码块，不要其它解释文字。格式严格为：
{"pages":[{"title":"...","content":"..."}]}`;

@Injectable()
export class PptOutlineService {
  private readonly logger = new Logger(PptOutlineService.name);

  constructor(private readonly config: ConfigService) {}

  private getDeepSeekConfig() {
    const apiKey = (this.config.get<string>('DEEPSEEK_API_KEY') || '').trim();
    const baseUrl = (
      this.config.get<string>('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com'
    )
      .trim()
      .replace(/\/+$/, '');
    const model =
      (this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat').trim() ||
      'deepseek-chat';
    return { apiKey, baseUrl, model };
  }

  async generateOutline(prompt: string): Promise<PptOutlineResult> {
    const trimmed = String(prompt || '').trim();
    if (!trimmed) {
      throw new HttpException({ message: 'prompt 不能为空' }, HttpStatus.BAD_REQUEST);
    }

    const { apiKey, baseUrl, model } = this.getDeepSeekConfig();
    if (!apiKey) {
      throw new HttpException(
        {
          message:
            'DEEPSEEK_API_KEY 未配置：一句话生成大纲需要 DeepSeek',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    let rawContent = '';
    try {
      const response = await axios.post(
        `${baseUrl}/v1/chat/completions`,
        {
          model,
          temperature: 0.7,
          messages: [
            { role: 'system', content: PPT_OUTLINE_SYSTEM_PROMPT },
            {
              role: 'user',
              content: `请根据以下一句话需求生成 PPT 大纲，并只返回 JSON：\n${trimmed}`,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 90_000,
        },
      );

      rawContent = String(
        response?.data?.choices?.[0]?.message?.content || '',
      ).trim();
      if (!rawContent) {
        throw new Error('DeepSeek 返回空内容');
      }
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      const detail =
        typeof error?.response?.data === 'string'
          ? error.response.data.slice(0, 300)
          : error?.response?.data?.error?.message ||
            error?.message ||
            'unknown';
      this.logger.error(`PPT 大纲 DeepSeek 调用失败: ${detail}`);
      throw new HttpException(
        { message: `大纲生成失败: ${detail}` },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const pages = this.parsePages(rawContent);
    if (!pages.length) {
      throw new HttpException(
        { message: '大纲解析失败，请重试' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    return { pages };
  }

  private parsePages(rawContent: string): PptOutlinePage[] {
    let text = rawContent.trim();
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) text = fenced[1].trim();

    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(text.slice(start, end + 1));
        } catch {
          parsed = null;
        }
      }
    }

    const list = Array.isArray(parsed?.pages)
      ? parsed.pages
      : Array.isArray(parsed)
        ? parsed
        : null;
    if (!list) return [];

    return list
      .map((item: any) => ({
        title: String(item?.title || item?.name || '').trim(),
        content: String(
          item?.content || item?.description || item?.body || '',
        ).trim(),
      }))
      .filter((p: PptOutlinePage) => p.title || p.content)
      .slice(0, 20);
  }
}
