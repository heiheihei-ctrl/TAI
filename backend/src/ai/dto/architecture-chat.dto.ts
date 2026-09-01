import { IsArray, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * 建筑设计 AI（tgagent）对话请求。
 *
 * 该 DTO 只是**转发信封**：本端点不消费 prompt 内容，而是把请求透传给 tgagent，
 * 由 tgagent 的领域大脑（pi + DeepSeek）处理。因此这里不做生图参数校验
 * （aspectRatio / imageSize 等由 tgagent 侧决定），只校验信封结构。
 *
 * 计费说明：tgagent 回调 TAI 生图接口时必须使用本请求携带的用户 JWT 才会扣积分。
 * 见 docs（tgagent 仓库）TAI-INTEGRATION-PLAN.md §7。
 */
export class ArchitectureChatDto {
  /** 用户输入的自然语言需求 */
  @IsString()
  prompt!: string;

  /** TAI 项目 ID，用作 tgagent 的会话隔离键 */
  @IsOptional()
  @IsString()
  projectId?: string;

  /** 延续既有会话（同一对话多轮） */
  @IsOptional()
  @IsString()
  sessionId?: string;

  /**
   * 画布选区引用，结构对齐 tgagent 的 SelectionRef。
   * 其中 normalizedRegion 为归一化 0–1 的局部区域
   * （对应前端 PreciseEditContext.cropRectNormalized）。
   * 注意：该坐标不进生图模型，仅用于 prompt 描述与前端合成。
   */
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  selectionRefs?: Array<Record<string, any>>;

  /** 随消息上传的图片（base64，建议 ≤3 张、≤1024px） */
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  attachments?: Array<Record<string, any>>;

  /**
   * 客户端已知的最新下行 seq。
   * 视频完成等异步事件可能在本轮 SSE 关闭之后才到达，服务端会缓存进 ring，
   * 由下一轮请求带上该游标触发补发；不传则这些事件永久丢失。
   */
  @IsOptional()
  @IsNumber()
  lastSeq?: number;
}
