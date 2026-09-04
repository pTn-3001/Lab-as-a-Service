import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddStudentsDto {
  @ApiProperty({ description: 'Array of student UUIDs to add', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  studentIds!: string[];
}
