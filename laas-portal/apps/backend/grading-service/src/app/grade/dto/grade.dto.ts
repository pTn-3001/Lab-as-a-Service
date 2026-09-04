import { IsString, IsOptional, IsNumber, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ── Sync grade from lab-service checkpoint data ─────────────────────────

export class CheckpointDataDto {
  @ApiProperty() @IsString() id!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() points?: number;
  @ApiProperty() @IsString() status!: string; // PENDING | COMPLETED | FAILED
  @ApiPropertyOptional() @IsOptional() @IsString() completedAt?: string;
}

export class SyncGradeDto {
  @ApiProperty({ description: 'ClassLab ID (from lab-service)' })
  @IsString() classLabId!: string;

  @ApiProperty({ description: 'Group/Class ID (from user-service)' })
  @IsString() groupId!: string;

  @ApiProperty({ description: 'Student user ID' })
  @IsString() studentId!: string;

  @ApiProperty({ description: 'Lab template ID' })
  @IsString() labTemplateId!: string;

  @ApiPropertyOptional({ description: 'Lab session ID from lab-service' })
  @IsOptional() @IsString() sessionId?: string;

  @ApiPropertyOptional({ description: 'Grade status (IN_PROGRESS, FINISHED, COMPLETED, GRADED)' })
  @IsOptional() @IsString() status?: string;

  @ApiProperty({ description: 'Array of checkpoint states', type: [CheckpointDataDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckpointDataDto)
  checkpoints!: CheckpointDataDto[];
}

// ── Manual grade / feedback ────────────────────────────────────────────

export class ManualGradeDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) manualScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() feedback?: string;
}

// ── Query ──────────────────────────────────────────────────────────────

export class QueryGradesDto {
  @ApiPropertyOptional() @IsOptional() @IsString() groupId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() classLabId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() studentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) page?: number = 1;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(100) limit?: number = 50;
}
