import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, Min } from 'class-validator';

export class CreateTeamSeatPackageOrderDto {
  @ApiProperty({ minimum: 2 })
  @IsInt()
  @Min(2)
  seats!: number;

  @ApiProperty({ enum: ['monthly', 'annual'] })
  @IsIn(['monthly', 'annual'])
  cycle!: 'monthly' | 'annual';

  @ApiProperty({ enum: ['alipay', 'wechat'] })
  @IsIn(['alipay', 'wechat'])
  paymentMethod!: 'alipay' | 'wechat';
}

export class CreateTeamCreditsTopupOrderDto {
  @ApiProperty({ minimum: 1 })
  @IsNumber()
  @Min(1)
  amount!: number;

  @ApiProperty({ enum: ['alipay', 'wechat'] })
  @IsIn(['alipay', 'wechat'])
  paymentMethod!: 'alipay' | 'wechat';
}
