import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardExportQueryDto {
  @ApiProperty({ description: '报表类型', enum: ['daily', 'weekly', 'monthly'] })
  @IsIn(['daily', 'weekly', 'monthly'])
  reportType!: 'daily' | 'weekly' | 'monthly';

  @ApiPropertyOptional({ description: '开始日期 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
