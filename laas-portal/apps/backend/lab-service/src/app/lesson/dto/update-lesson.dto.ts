import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateLessonDto } from './create-lesson.dto';

// Omit groupId (immutable after creation) and make all remaining fields optional.
export class UpdateLessonDto extends PartialType(
  OmitType(CreateLessonDto, ['groupId'] as const),
) {}
