import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignInstructorDto {
  @ApiProperty({ description: 'Instructor UUID to assign to the group' })
  @IsUUID()
  instructorId!: string;
}
