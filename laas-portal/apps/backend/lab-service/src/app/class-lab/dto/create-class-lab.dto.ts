import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsBoolean,
  IsUUID,
  IsDateString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClassLabDto {
  @ApiProperty({ description: 'Group (class) ID to assign this lab to' })
  @IsUUID()
  groupId: string;

  @ApiProperty({ description: 'Lab template to assign' })
  @IsString()
  @IsNotEmpty()
  labTemplateId: string;

  @ApiPropertyOptional({ description: 'Optional lesson to attach this lab to' })
  @IsOptional()
  @IsUUID()
  lessonId?: string;

  @ApiPropertyOptional({ description: 'Custom title override' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Custom description override' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Submission deadline (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional({ description: 'Whether this lab is required', default: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ description: 'Display order within the group' })
  @IsOptional()
  @IsInt()
  @Min(0)
  orderNo?: number;
}
