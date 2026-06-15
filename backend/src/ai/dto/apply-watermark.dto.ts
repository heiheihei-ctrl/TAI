import { IsNotEmpty, IsString } from 'class-validator';

export class ApplyWatermarkDto {
  @IsString()
  @IsNotEmpty()
  imageData!: string;
}
