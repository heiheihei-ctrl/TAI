import { ModelStatus, ProtocolType, TaskType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, Matches } from 'class-validator';

export class CreateModelDto {
  @IsString()
  @Matches(/^[a-z0-9._-]+$/)
  modelKey!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(TaskType)
  taskType!: TaskType;

  @IsEnum(ProtocolType)
  protocolType!: ProtocolType;

  @IsOptional()
  @IsEnum(ModelStatus)
  status?: ModelStatus;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
