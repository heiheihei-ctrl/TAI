import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

/**
 * 工作流 Agent 对话请求。
 * DeepSeek 只负责写 prompt + 规划 Flow；生图在前端节点 Run。
 */
export class WorkflowChatDto {
  @IsString()
  prompt!: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  /** 远程参考图 URL（禁止 data:/blob:/裸 base64） */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  referenceImageUrls?: string[];

  /** 画布视口中心（flow 世界坐标），用于落点 */
  @IsOptional()
  @IsNumber()
  viewportCenterX?: number;

  @IsOptional()
  @IsNumber()
  viewportCenterY?: number;
}
