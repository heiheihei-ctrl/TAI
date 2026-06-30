import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import {
  VOLC_VIDEO_ENHANCE_FPS_RANGE,
  VOLC_VIDEO_ENHANCE_LIMIT_RANGE,
  VOLC_VIDEO_ENHANCE_PRESET_RESOLUTIONS,
  VOLC_VIDEO_ENHANCE_SCENES,
  VOLC_VIDEO_ENHANCE_TOOL_VERSIONS,
} from '../constants/volc-video-enhance.constants';

export class CreateVolcEnhanceVideoDto {
  @ApiProperty({ description: '待增强视频 URL' })
  @IsString()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  videoUrl!: string;

  @ApiProperty({ enum: VOLC_VIDEO_ENHANCE_TOOL_VERSIONS })
  @IsEnum(VOLC_VIDEO_ENHANCE_TOOL_VERSIONS)
  toolVersion!: (typeof VOLC_VIDEO_ENHANCE_TOOL_VERSIONS)[number];

  @ApiProperty({ enum: VOLC_VIDEO_ENHANCE_SCENES })
  @IsEnum(VOLC_VIDEO_ENHANCE_SCENES)
  scene!: (typeof VOLC_VIDEO_ENHANCE_SCENES)[number];

  @ApiPropertyOptional({ enum: VOLC_VIDEO_ENHANCE_PRESET_RESOLUTIONS })
  @IsOptional()
  @IsEnum(VOLC_VIDEO_ENHANCE_PRESET_RESOLUTIONS)
  resolution?: (typeof VOLC_VIDEO_ENHANCE_PRESET_RESOLUTIONS)[number];

  @ApiPropertyOptional({
    minimum: VOLC_VIDEO_ENHANCE_LIMIT_RANGE.min,
    maximum: VOLC_VIDEO_ENHANCE_LIMIT_RANGE.max,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(VOLC_VIDEO_ENHANCE_LIMIT_RANGE.min)
  @Max(VOLC_VIDEO_ENHANCE_LIMIT_RANGE.max)
  resolutionLimit?: number;

  @ApiPropertyOptional({
    minimum: VOLC_VIDEO_ENHANCE_FPS_RANGE.min,
    maximum: VOLC_VIDEO_ENHANCE_FPS_RANGE.max,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(VOLC_VIDEO_ENHANCE_FPS_RANGE.min)
  @Max(VOLC_VIDEO_ENHANCE_FPS_RANGE.max)
  fps?: number;
}

export class VolcEnhanceVideoQueryResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  taskId!: string;

  @ApiProperty({ enum: ['queued', 'processing', 'succeeded', 'failed'] })
  status!: 'queued' | 'processing' | 'succeeded' | 'failed';

  @ApiPropertyOptional()
  videoUrl?: string;

  @ApiPropertyOptional()
  error?: string;
}

