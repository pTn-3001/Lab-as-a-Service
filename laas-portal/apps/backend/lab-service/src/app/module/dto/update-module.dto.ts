import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, IsArray, IsObject, Min } from 'class-validator';

export class UpdateModuleDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @IsOptional()
  orderNo?: number;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  estimatedMinutes?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  objectives?: string[];

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  definitionJson?: Record<string, any>;
}
