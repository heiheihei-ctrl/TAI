import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { WORKFLOW_AGENT_SYSTEM_PROMPT } from './prompts/system-prompt';
import type {
  WorkflowApplyGraphCommand,
  WorkflowAgentMode,
  WorkflowPlanResult,
} from './workflow-agent.types';

const FLOW_JSON_RE =
  /<<<FLOW_JSON\s*([\s\S]*?)\s*FLOW_JSON>>>/i;

const ALLOWED_ASPECT = new Set([
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '4:5',
  '5:4',
  '21:9',
]);

function isRemoteImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const t = value.trim();
  if (!t) return false;
  if (/^(data:|blob:)/i.test(t)) return false;
  if (/^[A-Za-z0-9+/=]{80,}$/.test(t) && !t.includes('/') && !t.includes(':')) {
    return false;
  }
  if (/^https?:\/\//i.test(t)) return true;
  if (/^(templates|projects|uploads|videos)\//i.test(t.replace(/^\/+/, ''))) {
    return true;
  }
  if (t.startsWith('/api/assets/') || t.startsWith('/assets/')) return true;
  return false;
}

@Injectable()
export class WorkflowAgentService {
  private readonly logger = new Logger(WorkflowAgentService.name);

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

  async planWorkflow(input: {
    prompt: string;
    referenceImageUrls?: string[];
    viewportCenter?: { x: number; y: number };
  }): Promise<WorkflowPlanResult> {
    const { apiKey, baseUrl, model } = this.getDeepSeekConfig();
    if (!apiKey) {
      throw new HttpException(
        {
          message:
            'DEEPSEEK_API_KEY 未配置：工作流 Agent 需要 DeepSeek 才能生成提示词与规划节点',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const refs = (input.referenceImageUrls || []).filter(isRemoteImageUrl);
    const userParts = [
      `用户需求：${input.prompt}`,
      refs.length
        ? `参考图 URL（仅可使用这些）：\n${refs.map((u, i) => `${i + 1}. ${u}`).join('\n')}`
        : '参考图：无（默认文生图）',
    ];

    let rawContent = '';
    try {
      const response = await axios.post(
        `${baseUrl}/v1/chat/completions`,
        {
          model,
          temperature: 0.7,
          messages: [
            { role: 'system', content: WORKFLOW_AGENT_SYSTEM_PROMPT },
            { role: 'user', content: userParts.join('\n\n') },
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
      this.logger.error(`DeepSeek 调用失败: ${detail}`);
      throw new HttpException(
        { message: `工作流 Agent 大脑不可用: ${detail}` },
        HttpStatus.BAD_GATEWAY,
      );
    }

    return this.parseAndBuild(rawContent, refs, input.viewportCenter);
  }

  private parseAndBuild(
    rawContent: string,
    fallbackRefs: string[],
    viewportCenter?: { x: number; y: number },
  ): WorkflowPlanResult {
    const match = rawContent.match(FLOW_JSON_RE);
    let prose = rawContent;
    let parsed: Record<string, any> | null = null;

    if (match?.[1]) {
      prose = rawContent.replace(FLOW_JSON_RE, '').trim();
      try {
        parsed = JSON.parse(match[1].trim());
      } catch (e) {
        this.logger.warn(`FLOW_JSON 解析失败: ${(e as Error).message}`);
      }
    }

    // 兜底：整段当 JSON
    if (!parsed) {
      try {
        const asJson = JSON.parse(rawContent);
        if (asJson && typeof asJson === 'object') {
          parsed = asJson;
          prose = String(asJson.message || '').trim();
        }
      } catch {
        // ignore
      }
    }

    if (!parsed) {
      // 无结构化结果：当闲聊
      return {
        message: prose || '收到。请描述你想生成的画面。',
        command: null,
      };
    }

    const mode = this.normalizeMode(parsed.mode, fallbackRefs);
    const prompt =
      typeof parsed.prompt === 'string' ? parsed.prompt.trim() : '';
    const message =
      (typeof parsed.message === 'string' && parsed.message.trim()) ||
      prose ||
      (mode === 'chat_only' ? '好的。' : '已为你规划生图工作流，正在画布上创建节点…');

    const aspectRatio =
      typeof parsed.aspectRatio === 'string' &&
      ALLOWED_ASPECT.has(parsed.aspectRatio.trim())
        ? parsed.aspectRatio.trim()
        : undefined;

    let refs = Array.isArray(parsed.referenceImageUrls)
      ? parsed.referenceImageUrls.filter(isRemoteImageUrl)
      : [];
    if (mode === 'img2img' && refs.length === 0) {
      refs = fallbackRefs.slice(0, 3);
    }

    if (mode === 'chat_only' || !prompt) {
      return { message, command: null };
    }

    const command = this.buildGraphCommand({
      mode: mode === 'img2img' && refs.length > 0 ? 'img2img' : 'text2img',
      prompt,
      referenceImageUrls: refs,
      aspectRatio,
      viewportCenter,
    });

    return { message, command };
  }

  private normalizeMode(
    raw: unknown,
    refs: string[],
  ): WorkflowAgentMode {
    const m = String(raw || '')
      .trim()
      .toLowerCase();
    if (m === 'chat_only' || m === 'chat') return 'chat_only';
    if (m === 'img2img' || m === 'edit') return 'img2img';
    if (m === 'text2img' || m === 'generate') return 'text2img';
    return refs.length > 0 ? 'img2img' : 'text2img';
  }

  buildGraphCommand(input: {
    mode: 'text2img' | 'img2img';
    prompt: string;
    referenceImageUrls: string[];
    aspectRatio?: string;
    viewportCenter?: { x: number; y: number };
  }): WorkflowApplyGraphCommand {
    const nodes: WorkflowApplyGraphCommand['nodes'] = [];
    const edges: WorkflowApplyGraphCommand['edges'] = [];

    if (input.mode === 'img2img' && input.referenceImageUrls[0]) {
      nodes.push({
        tempId: 'img1',
        type: 'image',
        offset: { x: -420, y: -80 },
        data: {
          imageUrl: input.referenceImageUrls[0],
          imageData: undefined,
        },
      });
      nodes.push({
        tempId: 'tp1',
        type: 'textPrompt',
        offset: { x: -420, y: 160 },
        data: { text: input.prompt, title: 'Agent Prompt' },
      });
      nodes.push({
        tempId: 'gen1',
        type: 'generate',
        offset: { x: 80, y: 40 },
        data: input.aspectRatio
          ? { aspectRatio: input.aspectRatio }
          : undefined,
      });
      edges.push({
        source: 'img1',
        sourceHandle: 'img',
        target: 'gen1',
        targetHandle: 'img',
      });
      edges.push({
        source: 'tp1',
        sourceHandle: 'text',
        target: 'gen1',
        targetHandle: 'text',
      });
    } else {
      nodes.push({
        tempId: 'tp1',
        type: 'textPrompt',
        offset: { x: -320, y: 0 },
        data: { text: input.prompt, title: 'Agent Prompt' },
      });
      nodes.push({
        tempId: 'gen1',
        type: 'generate',
        offset: { x: 160, y: 0 },
        data: input.aspectRatio
          ? { aspectRatio: input.aspectRatio }
          : undefined,
      });
      edges.push({
        source: 'tp1',
        sourceHandle: 'text',
        target: 'gen1',
        targetHandle: 'text',
      });
    }

    return {
      type: 'apply_graph',
      mode: input.mode,
      prompt: input.prompt,
      nodes,
      edges,
      runNodeIds: ['gen1'],
      aspectRatio: input.aspectRatio,
      viewportCenter: input.viewportCenter,
    };
  }
}
