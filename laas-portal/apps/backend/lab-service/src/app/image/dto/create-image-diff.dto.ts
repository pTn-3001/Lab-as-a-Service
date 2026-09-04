export class CreateImageDiffDto {
  baseVersionId?: string;
  targetVersionId: string;
  storageUrl?: string;
  requestedById: string;
}
