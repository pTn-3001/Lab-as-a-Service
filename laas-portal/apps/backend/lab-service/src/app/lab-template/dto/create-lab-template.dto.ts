import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsObject,
  IsIn,
} from 'class-validator';

export class CreateLabTemplateDto {
  @ApiProperty({ example: 'LAB-K8S-001' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: 'Kubernetes Architecture & Cluster Operations' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'kubernetes-architecture-cluster-operations' })
  @IsString()
  @IsNotEmpty()
  slug!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'Cloud' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ example: 'Intermediate' })
  @IsString()
  @IsOptional()
  difficulty?: string;

  @ApiPropertyOptional({ type: [String], example: ['kubernetes', 'cloud'] })
  @IsArray()
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @ApiProperty({ example: 'user_123' })
  @IsString()
  @IsNotEmpty()
  createdById!: string;

  @ApiPropertyOptional({ enum: ['PUBLIC', 'RESTRICTED'], default: 'PUBLIC' })
  @IsIn(['PUBLIC', 'RESTRICTED'])
  @IsOptional()
  accessType?: 'PUBLIC' | 'RESTRICTED';

  @ApiPropertyOptional({ enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], default: 'DRAFT' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  createdBySnapshot?: Record<string, unknown>;
}
