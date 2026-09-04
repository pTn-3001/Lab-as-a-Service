import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryLabTemplateDto {
  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  @IsOptional()
  limit?: number = 10;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  keyword?: string;

  @ApiPropertyOptional({ enum: ['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED', 'NOT_REVIEW'] })
  @IsIn(['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED', 'NOT_REVIEW'])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  difficulty?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  createdById?: string;

  @ApiPropertyOptional({ enum: ['PUBLIC', 'RESTRICTED'] })
  @IsIn(['PUBLIC', 'RESTRICTED'])
  @IsOptional()
  accessType?: string;

  @ApiPropertyOptional({ description: 'When provided, response includes hasAccess flag per lab' })
  @IsString()
  @IsOptional()
  userId?: string;
}
