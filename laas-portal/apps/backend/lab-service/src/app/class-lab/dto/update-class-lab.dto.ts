import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateClassLabDto } from './create-class-lab.dto';

// Omit groupId and labTemplateId (immutable after creation) and make remaining fields optional.
export class UpdateClassLabDto extends PartialType(
  OmitType(CreateClassLabDto, ['groupId', 'labTemplateId'] as const),
) {}
