import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

class ReorderItem {
  @ApiProperty({ description: 'Lesson ID' })
  @IsUUID()
  id: string;

  @ApiProperty({ description: 'New order number' })
  @IsInt()
  @Min(0)
  orderNo: number;
}

export class ReorderLessonsDto {
  @ApiProperty({ type: [ReorderItem], description: 'Array of lesson IDs with new order numbers' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItem)
  items: ReorderItem[];
}
