import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsArray,
  IsObject,
  Min,
} from 'class-validator';

export class CreateModuleDto {
  @ApiProperty({ example: 'Kubernetes Cluster Core' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  orderNo: number;

  @ApiPropertyOptional({ example: 60 })
  @IsInt()
  @IsOptional()
  estimatedMinutes?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  objectives?: string[];

  @ApiProperty({ description: 'Module definition JSON (network, vms, scripts, etc.)' })
  @IsObject()
  definitionJson: Record<string, any>;

  @ApiProperty({ example: 'user_123' })
  @IsString()
  @IsNotEmpty()
  createdById: string;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  createdBySnapshot?: Record<string, any>;
}
