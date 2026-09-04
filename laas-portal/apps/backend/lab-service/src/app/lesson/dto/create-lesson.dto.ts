import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsUUID,
  IsIn,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLessonDto {
  @ApiProperty({ description: 'Group (class) ID this lesson belongs to' })
  @IsUUID()
  groupId: string;

  @ApiProperty({ description: 'Lesson title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Lesson description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Lesson content (rich text / markdown)' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    enum: ['TEXT', 'VIDEO', 'PDF', 'LINK'],
    default: 'TEXT',
    description: 'Lesson type',
  })
  @IsOptional()
  @IsIn(['TEXT', 'VIDEO', 'PDF', 'LINK'])
  type?: string;

  @ApiPropertyOptional({ description: 'URL for external resource' })
  @IsOptional()
  @IsString()
  resourceUrl?: string;

  @ApiPropertyOptional({ description: 'Display order within the group' })
  @IsOptional()
  @IsInt()
  @Min(0)
  orderNo?: number;

  @ApiPropertyOptional({ description: 'Whether the lesson is visible to students' })
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}
