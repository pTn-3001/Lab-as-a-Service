export class CreateImageVersionDto {
  versionNumber?: number;
  storageUrl?: string;
  metadata?: any;
  provisioningProfileId?: string;
  createdById: string;
}
