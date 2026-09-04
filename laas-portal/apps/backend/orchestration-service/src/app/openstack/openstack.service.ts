import { execFile, spawn } from 'child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';

import { PrismaService } from '../prisma/prisma.service';

type KeystoneCatalogEntry = {
  type: string;
  endpoints: Array<{
    interface: string;
    url: string;
  }>;
};

type KeystoneAuthResponse = {
  token?: {
    catalog?: KeystoneCatalogEntry[];
    project?: {
      id?: string;
      name?: string;
    };
  };
};


type FlavorRecord = {
  id: string;
  name: string;
  vcpus: number;
  ram: number;
  disk: number;
  swap: number;
  isPublic: boolean;
  visibility: 'public' | 'private';
  description: string;
};

type ImageRecord = {
  id: string;
  name: string;
  status: string;
  visibility: string;
  diskFormat: string;
  containerFormat: string;
  sizeBytes: number;
  size: string;
  minDisk: number;
  minRam: number;
  createdAt: string;
  updatedAt: string;
  owner?: string;
  checksum?: string;
  architecture?: string;
  osDistro?: string;
};

type HypervisorRecord = {
  id: string | number;
  hostname: string;
  hostIp: string;
  state: 'up' | 'down';
  status: 'enabled' | 'disabled';
  vcpus: number;
  vcpusUsed: number;
  memoryMb: number;
  memoryMbUsed: number;
  localGb: number;
  localGbUsed: number;
  runningVms: number;
  cpuModel?: string;
  uptime?: string;
  nodeType?: 'compute' | 'controller';
  services?: {
    binary: string;
    state: string;
    status: string;
    zone?: string;
    updatedAt?: string;
  }[];
};

type CreateHeatStackInput = {
  platformUserId: string;
  userEmail?: string;
  stackName: string;
  labSessionId?: string;
  template: string;
  parameters?: Record<string, unknown>;
  files?: Record<string, string>;
  environment?: Record<string, unknown>;
  disableRollback?: boolean;
  timeoutMins?: number;
  leaseMinutes?: number;
  floatingIpReserveCount?: number;
  tags?: string | string[];
};

type GetHeatStackResourcesInput = {
  platformUserId: string;
  userEmail?: string;
  stackName: string;
  stackId: string;
};

type HeatStackIdentifier = {
  stackName: string;
  stackId: string;
};

type StackServerDetail = {
  id: string;
  name: string;
  status: string;
  addresses: Array<{
    network: string;
    ip: string;
    version?: number;
    type?: string;
  }>;
  primaryIp?: string;
  floatingIp?: string;
  sshHost?: string;
  sshPort?: number;
  sshUsername?: string;
  guacamoleSshUrl?: string | null;
};

/**
 * Core orchestration service.
 *
 * High-level flow for each request:
 * 1) resolve/create OpenStack identity mapping for platform user
 * 2) login to Keystone as that user and read token catalog endpoints
 * 3) call Heat/Nova/Glance APIs using project-scoped URLs
 * 4) normalize and return UI-friendly payloads
 */
@Injectable()
export class OpenstackService {
  private readonly logger = new Logger(OpenstackService.name);
  private readonly httpClient: AxiosInstance;

  constructor(private readonly prisma: PrismaService) {
    this.httpClient = axios.create({ timeout: 15000 });
  }

  // Public API: list flavors from Nova for current project scope.
  async getFlavorsForPlatformUser(input: { platformUserId: string; userEmail?: string }) {
    try {
      const adminAuth = await this.loginAsAdminWithCatalog();
      const computeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'compute');

      if (!computeBaseUrl) {
        throw new InternalServerErrorException('Khong tim thay compute endpoint trong token catalog');
      }

      const flavors = await this.fetchFlavors(computeBaseUrl, adminAuth.token);

      return {
        success: true,
        data: {
          user: {
            platformUserId: input.platformUserId,
            keystoneUsername: adminAuth.username,
            projectName: adminAuth.projectName,
          },
          flavors,
        },
      };
    } catch (error) {
      this.logger.error('Lay danh sach flavors that bai', error instanceof Error ? error.stack : undefined);

      return {
        success: false,
        message:
          error instanceof Error ? `Khong the lay flavors tu OpenStack: ${error.message}` : 'Khong the lay flavors tu OpenStack',
      };
    }
  }

  // Public API: Snapshot a VM
  async createSnapshotForPlatformUser(input: {
    platformUserId: string;
    userEmail?: string;
    serverId: string;
    imageName: string;
    metadata?: Record<string, string>;
  }) {
    try {
      const adminAuth = await this.loginAsAdminWithCatalog();
      const computeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'compute');

      if (!computeBaseUrl) {
        throw new InternalServerErrorException('Không tìm thấy compute endpoint trong token catalog');
      }

      this.logger.log(`Bắt đầu tạo snapshot image ${input.imageName} từ VM ${input.serverId}`);

      const response = await this.httpClient.post(
        `${computeBaseUrl}/servers/${encodeURIComponent(input.serverId)}/action`,
        {
          createImage: {
            name: input.imageName,
            metadata: input.metadata || {},
          },
        },
        {
          headers: { 'X-Auth-Token': adminAuth.token },
          validateStatus: (status) => status === 202, // OpenStack returns 202 Accepted
        }
      );

      // Nova v2.45+ returns image_id in body; older Nova returns Location header only.
      const bodyImageId = (response.data as Record<string, unknown> | null)?.image_id as string | undefined;
      const locationUrl = response.headers['location'] as string | undefined;
      const locationImageId = locationUrl ? locationUrl.split('/').filter(Boolean).pop() : undefined;

      const newImageId = bodyImageId || locationImageId || null;
      if (!newImageId) {
        this.logger.warn(`Nova snapshot for server ${input.serverId}: neither image_id in body nor Location header returned. body=${JSON.stringify(response.data)}`);
      } else {
        this.logger.log(`Nova snapshot imageId=${newImageId} (source: ${bodyImageId ? 'body' : 'location'})`);
      }

      // Update Glance visibility — Nova createImage always creates images as "private".
      // The visibility field is a top-level Glance attribute (not a metadata key),
      // so we must PATCH it separately after the snapshot is queued.
      const requestedVisibility = input.metadata?.visibility;
      if (newImageId && requestedVisibility && requestedVisibility !== 'private') {
        const imageBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'image');
        if (imageBaseUrl) {
          const glanceImageUrl = `${this.buildImageListUrl(imageBaseUrl).replace(/\/images$/, '')}/images/${newImageId}`;
          try {
            await this.httpClient.patch(
              glanceImageUrl,
              [{ op: 'replace', path: '/visibility', value: requestedVisibility }],
              {
                headers: {
                  'X-Auth-Token': adminAuth.token,
                  'Content-Type': 'application/openstack-images-v2.1-json-patch',
                },
              },
            );
            this.logger.log(`Đã cập nhật visibility=${requestedVisibility} cho image ${newImageId}`);
          } catch (patchErr: any) {
            this.logger.warn(`Không thể cập nhật visibility cho image ${newImageId}: ${patchErr.message}`);
          }
        }
      }

      return {
        success: true,
        message: 'Started taking snapshot successfully',
        imageId: newImageId,
      };
    } catch (error: any) {
      this.logger.error(`Lỗi khi tạo snapshot VM: ${error.message}`);
      if (error.response?.data) {
        this.logger.error(`OpenStack Error: ${JSON.stringify(error.response.data)}`);
      }
      throw new InternalServerErrorException('Không thể thực hiện chụp Snapshot OpenStack');
    }
  }

  // Public API: list images from Glance for current project scope.
  async getImagesForPlatformUser(input: { platformUserId: string; userEmail?: string }) {
    try {
      const adminAuth = await this.loginAsAdminWithCatalog();
      const imageBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'image');

      if (!imageBaseUrl) {
        throw new InternalServerErrorException('Khong tim thay image endpoint trong token catalog');
      }

      const images = await this.fetchImages(imageBaseUrl, adminAuth.token);

      return {
        success: true,
        data: {
          user: {
            platformUserId: input.platformUserId,
            keystoneUsername: adminAuth.username,
            projectName: adminAuth.projectName,
          },
          images,
        },
      };
    } catch (error) {
      this.logger.error('Lay danh sach images that bai', error instanceof Error ? error.stack : undefined);

      return {
        success: false,
        message:
          error instanceof Error ? `Khong the lay images tu OpenStack: ${error.message}` : 'Khong the lay images tu OpenStack',
      };
    }
  }

  // Returns the Glance status of a single image by ID.
  async getImageStatusById(imageId: string): Promise<{ success: boolean; status?: string; message?: string }> {
    try {
      const adminAuth = await this.loginAsAdminWithCatalog();
      const imageBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'image');
      if (!imageBaseUrl) {
        return { success: false, message: 'No image endpoint in catalog' };
      }
      const imageUrl = `${this.buildImageListUrl(imageBaseUrl).replace(/\/images$/, '')}/images/${imageId}`;
      const response = await this.httpClient.get<{ status?: string; id?: string }>(imageUrl, {
        headers: { 'X-Auth-Token': adminAuth.token },
      });
      const status = response.data?.status;
      return { success: true, status: status ? String(status) : undefined };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: msg };
    }
  }

  // Find the most recent snapshot image created from a specific Nova server.
  // Glance stores the source VM UUID in the `instance_uuid` property.
  async findImageByServerId(serverId: string): Promise<{ success: boolean; imageId?: string; status?: string; message?: string }> {
    try {
      const adminAuth = await this.loginAsAdminWithCatalog();
      const imageBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'image');
      if (!imageBaseUrl) {
        return { success: false, message: 'No image endpoint in catalog' };
      }
      const listBase = this.buildImageListUrl(imageBaseUrl);
      const response = await this.httpClient.get<{ images?: Array<Record<string, unknown>> }>(
        listBase,
        {
          headers: { 'X-Auth-Token': adminAuth.token },
          params: { instance_uuid: serverId, sort: 'created_at:desc', limit: 5 },
        },
      );
      const images = response.data?.images ?? [];
      // Return the first non-deleted/killed image
      const match = images.find((img) => img.status !== 'deleted' && img.status !== 'killed');
      if (!match) {
        return { success: false, message: `No snapshot image found for server ${serverId}` };
      }
      return { success: true, imageId: String(match.id), status: String(match.status ?? '') };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: msg };
    }
  }

  // Detach a Cinder volume from a Nova server so Cinder transitions it to 'available'.
  async detachVolumeFromServer(serverId: string, volumeId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const adminAuth = await this.loginAsAdminWithCatalog();
      const computeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'compute');
      if (!computeBaseUrl) return { success: false, message: 'No compute endpoint in catalog' };
      await this.httpClient.delete(
        `${computeBaseUrl}/servers/${encodeURIComponent(serverId)}/os-volume_attachments/${encodeURIComponent(volumeId)}`,
        {
          headers: { 'X-Auth-Token': adminAuth.token },
          validateStatus: (s) => s === 202 || s === 200 || s === 204,
        },
      );
      this.logger.log(`Detached volume ${volumeId} from server ${serverId}`);
      return { success: true };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const axiosErr = error as { response?: { data?: unknown } };
      this.logger.warn(`Failed to detach volume ${volumeId} from server ${serverId}: ${msg}${axiosErr.response?.data ? ` — ${JSON.stringify(axiosErr.response.data)}` : ''}`);
      return { success: false, message: msg };
    }
  }

  // Get Cinder volume status ('available', 'in-use', 'error', …).
  async getVolumeStatus(volumeId: string): Promise<{ success: boolean; status?: string; message?: string }> {
    try {
      const adminAuth = await this.loginAsAdminWithCatalog();
      let volumeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'volumev3');
      if (!volumeBaseUrl) volumeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'block-storage');
      if (!volumeBaseUrl) return { success: false, message: 'No Cinder endpoint in catalog' };
      const resolvedUrl = this.resolveProjectScopedEndpoint(volumeBaseUrl, adminAuth.projectId);
      const scopedUrl = resolvedUrl.includes(adminAuth.projectId) ? resolvedUrl : `${resolvedUrl}/${adminAuth.projectId}`;
      const res = await this.httpClient.get<{ volume?: { status?: string } }>(
        `${scopedUrl}/volumes/${encodeURIComponent(volumeId)}`,
        { headers: { 'X-Auth-Token': adminAuth.token } },
      );
      return { success: true, status: res.data?.volume?.status ? String(res.data.volume.status) : undefined };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: msg };
    }
  }

  // Send os-stop action to a Nova server.
  async stopServerById(serverId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const adminAuth = await this.loginAsAdminWithCatalog();
      const computeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'compute');
      if (!computeBaseUrl) return { success: false, message: 'No compute endpoint in catalog' };
      await this.httpClient.post(
        `${computeBaseUrl}/servers/${encodeURIComponent(serverId)}/action`,
        { 'os-stop': null },
        {
          headers: { 'X-Auth-Token': adminAuth.token },
          validateStatus: (s) => s === 202 || s === 204,
        },
      );
      this.logger.log(`Stopped Nova server ${serverId}`);
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to stop Nova server ${serverId}: ${msg}`);
      return { success: false, message: msg };
    }
  }

  // Get Nova server status ('ACTIVE', 'SHUTOFF', 'ERROR', …).
  async getServerStatusById(serverId: string): Promise<{ success: boolean; status?: string; message?: string }> {
    try {
      const adminAuth = await this.loginAsAdminWithCatalog();
      const computeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'compute');
      if (!computeBaseUrl) return { success: false, message: 'No compute endpoint in catalog' };
      const res = await this.httpClient.get<{ server?: { status?: string } }>(
        `${computeBaseUrl}/servers/${encodeURIComponent(serverId)}`,
        { headers: { 'X-Auth-Token': adminAuth.token } },
      );
      const status = res.data?.server?.status;
      return { success: true, status: typeof status === 'string' ? status : undefined };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: msg };
    }
  }

  // Upload a Cinder volume directly to Glance as a new image (golden-image workflow).
  async uploadVolumeToGlance(input: {
    volumeId: string;
    imageName: string;
    diskFormat?: string;
    force?: boolean;
    metadata?: Record<string, string>;
  }): Promise<{ success: boolean; imageId?: string; message?: string }> {
    try {
      const adminAuth = await this.loginAsAdminWithCatalog();
      let volumeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'volumev3');
      if (!volumeBaseUrl) volumeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'block-storage');
      if (!volumeBaseUrl) return { success: false, message: 'No Cinder (volumev3/block-storage) endpoint in catalog' };

      // resolveProjectScopedEndpoint replaces %(project_id)s placeholders.
      // If the catalog URL has no placeholder and no project ID yet (e.g. "http://host:8776/v3"),
      // we must append the project ID ourselves — Cinder v3 requires it in the path.
      const resolvedUrl = this.resolveProjectScopedEndpoint(volumeBaseUrl, adminAuth.projectId);
      const scopedUrl = resolvedUrl.includes(adminAuth.projectId)
        ? resolvedUrl
        : `${resolvedUrl}/${adminAuth.projectId}`;

      this.logger.log(`uploadVolumeToGlance: POST ${scopedUrl}/volumes/${input.volumeId}/action`);

      const res = await this.httpClient.post<{ 'os-volume_upload_image'?: { image_id?: string } }>(
        `${scopedUrl}/volumes/${encodeURIComponent(input.volumeId)}/action`,
        {
          'os-volume_upload_image': {
            image_name: input.imageName,
            disk_format: input.diskFormat ?? 'raw',
            container_format: 'bare',
            // force:true uploads in-use volumes; requires Cinder microversion 3.1+
            force: input.force ?? false,
          },
        },
        {
          headers: {
            'X-Auth-Token': adminAuth.token,
            // Microversion 3.1 (added in OpenStack Mitaka) enables the force flag for
            // os-volume_upload_image. Without this header Cinder silently ignores force
            // and rejects in-use volumes with "status must be available".
            'OpenStack-Volume-microversion': '3.1',
          },
          validateStatus: (s) => s === 202 || s === 200,
        },
      );

      const imageId = res.data?.['os-volume_upload_image']?.image_id;
      if (!imageId) {
        this.logger.warn(`uploadVolumeToGlance: no image_id in response for volume ${input.volumeId}`);
      } else {
        this.logger.log(`uploadVolumeToGlance: image ${imageId} uploading from volume ${input.volumeId}`);

        // Cinder upload doesn't accept arbitrary metadata — patch Glance after image is known.
        // Use op:'add' for custom properties (they don't exist yet on a fresh upload).
        const { visibility: _vis, ...extraMeta } = input.metadata ?? {};
        const patches = Object.entries(extraMeta).map(([k, v]) => ({ op: 'add' as const, path: `/${k}`, value: v }));
        if (patches.length > 0) {
          const imageBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'image');
          if (imageBaseUrl) {
            const imageUrl = `${this.buildImageListUrl(imageBaseUrl).replace(/\/images$/, '')}/images/${imageId}`;
            try {
              await this.httpClient.patch(imageUrl, patches, {
                headers: {
                  'X-Auth-Token': adminAuth.token,
                  'Content-Type': 'application/openstack-images-v2.1-json-patch',
                },
              });
            } catch (e: unknown) {
              this.logger.warn(`Could not patch Glance metadata for image ${imageId}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        }
      }

      return { success: true, imageId: imageId ?? undefined };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const axiosErr = error as { response?: { status?: number; data?: unknown } };
      if (axiosErr.response?.data) {
        this.logger.error(`Cinder error body (${axiosErr.response.status ?? '?'}): ${JSON.stringify(axiosErr.response.data)}`);
      }
      this.logger.error(`uploadVolumeToGlance failed for volume ${input.volumeId}: ${msg}`);
      return { success: false, message: msg };
    }
  }

  // Delete a Nova server by ID (hard delete — server is removed immediately).
  async deleteServerById(serverId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const adminAuth = await this.loginAsAdminWithCatalog();
      const computeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'compute');
      if (!computeBaseUrl) return { success: false, message: 'No compute endpoint in catalog' };
      await this.httpClient.delete(
        `${computeBaseUrl}/servers/${encodeURIComponent(serverId)}`,
        {
          headers: { 'X-Auth-Token': adminAuth.token },
          validateStatus: (s) => s === 204 || s === 202,
        },
      );
      this.logger.log(`Deleted Nova server ${serverId}`);
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to delete Nova server ${serverId}: ${msg}`);
      return { success: false, message: msg };
    }
  }

  // Delete a Cinder volume by ID.
  async deleteVolumeById(volumeId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const adminAuth = await this.loginAsAdminWithCatalog();
      let volumeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'volumev3');
      if (!volumeBaseUrl) volumeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'block-storage');
      if (!volumeBaseUrl) return { success: false, message: 'No Cinder endpoint in catalog' };
      const resolvedUrl = this.resolveProjectScopedEndpoint(volumeBaseUrl, adminAuth.projectId);
      const scopedUrl = resolvedUrl.includes(adminAuth.projectId)
        ? resolvedUrl
        : `${resolvedUrl}/${adminAuth.projectId}`;
      await this.httpClient.delete(
        `${scopedUrl}/volumes/${encodeURIComponent(volumeId)}`,
        {
          headers: { 'X-Auth-Token': adminAuth.token },
          validateStatus: (s) => s === 202 || s === 200,
        },
      );
      this.logger.log(`Deleted Cinder volume ${volumeId}`);
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to delete Cinder volume ${volumeId}: ${msg}`);
      return { success: false, message: msg };
    }
  }

  // Get Cinder volume details.
  async getVolumeDetails(volumeId: string): Promise<{ success: boolean; volume?: any; message?: string }> {
    try {
      const adminAuth = await this.loginAsAdminWithCatalog();
      let volumeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'volumev3');
      if (!volumeBaseUrl) volumeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'block-storage');
      if (!volumeBaseUrl) return { success: false, message: 'No Cinder endpoint in catalog' };
      const resolvedUrl = this.resolveProjectScopedEndpoint(volumeBaseUrl, adminAuth.projectId);
      const scopedUrl = resolvedUrl.includes(adminAuth.projectId) ? resolvedUrl : `${resolvedUrl}/${adminAuth.projectId}`;
      const res = await this.httpClient.get<{ volume?: any }>(
        `${scopedUrl}/volumes/${encodeURIComponent(volumeId)}`,
        { headers: { 'X-Auth-Token': adminAuth.token } },
      );
      return { success: true, volume: res.data?.volume };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: msg };
    }
  }

  // Clone an existing Cinder volume.
  async cloneVolume(sourceVolumeId: string, cloneName: string): Promise<{ success: boolean; volumeId?: string; message?: string }> {
    try {
      const detailsRes = await this.getVolumeDetails(sourceVolumeId);
      if (!detailsRes.success || !detailsRes.volume) {
        return { success: false, message: `Failed to get source volume details: ${detailsRes.message || 'unknown'}` };
      }
      const size = detailsRes.volume.size;

      const adminAuth = await this.loginAsAdminWithCatalog();
      let volumeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'volumev3');
      if (!volumeBaseUrl) volumeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'block-storage');
      if (!volumeBaseUrl) return { success: false, message: 'No Cinder endpoint in catalog' };
      const resolvedUrl = this.resolveProjectScopedEndpoint(volumeBaseUrl, adminAuth.projectId);
      const scopedUrl = resolvedUrl.includes(adminAuth.projectId) ? resolvedUrl : `${resolvedUrl}/${adminAuth.projectId}`;

      const res = await this.httpClient.post<{ volume?: { id?: string } }>(
        `${scopedUrl}/volumes`,
        {
          volume: {
            name: cloneName,
            source_volid: sourceVolumeId,
            size: size
          }
        },
        { headers: { 'X-Auth-Token': adminAuth.token } },
      );
      const volumeId = res.data?.volume?.id;
      if (!volumeId) {
        return { success: false, message: 'No volume ID returned from Cinder clone action' };
      }
      return { success: true, volumeId };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: msg };
    }
  }


  // Delete a Glance image by ID.
  async deleteImageById(imageId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const adminAuth = await this.loginAsAdminWithCatalog();
      const imageBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'image');
      if (!imageBaseUrl) return { success: false, message: 'No image endpoint in catalog' };
      const imageUrl = `${this.buildImageListUrl(imageBaseUrl).replace(/\/images$/, '')}/images/${imageId}`;
      await this.httpClient.delete(imageUrl, { headers: { 'X-Auth-Token': adminAuth.token } });
      this.logger.log(`Deleted Glance image ${imageId}`);
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to delete Glance image ${imageId}: ${msg}`);
      return { success: false, message: msg };
    }
  }

  // Update visibility of a Glance image (private / shared / public / community).
  async updateImageVisibilityById(imageId: string, visibility: string): Promise<{ success: boolean; message?: string }> {
    try {
      const adminAuth = await this.loginAsAdminWithCatalog();
      const imageBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'image');
      if (!imageBaseUrl) return { success: false, message: 'No image endpoint in catalog' };
      const imageUrl = `${this.buildImageListUrl(imageBaseUrl).replace(/\/images$/, '')}/images/${imageId}`;
      await this.httpClient.patch(
        imageUrl,
        [{ op: 'replace', path: '/visibility', value: visibility }],
        {
          headers: {
            'X-Auth-Token': adminAuth.token,
            'Content-Type': 'application/openstack-images-v2.1-json-patch',
          },
        },
      );
      this.logger.log(`Updated visibility=${visibility} for Glance image ${imageId}`);
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to update visibility for Glance image ${imageId}: ${msg}`);
      return { success: false, message: msg };
    }
  }

  // Download a Glance image to local disk cache (/tmp/laas-images/) and return the local path.
  // Both lab-service and orchestration-service run on the same host, so this path is usable by both.
  // Skips re-download if the cached file already exists and matches the expected size.
  // Returns error if image > MAX_IMAGE_BYTES or if download fails.
  async ensureImageLocal(imageId: string): Promise<
    { success: true; path: string; sizeBytes: number; cached: boolean } |
    { success: false; message: string; sizeBytes?: number }
  > {
    const MAX_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB limit
    const cacheDir = '/tmp/laas-images';
    const localPath = join(cacheDir, imageId);

    try {
      const adminAuth = await this.loginAsAdminWithCatalog();
      const imageBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'image');
      if (!imageBaseUrl) return { success: false, message: 'No image endpoint in catalog' };

      const metaUrl = `${this.buildImageListUrl(imageBaseUrl).replace(/\/images$/, '')}/images/${imageId}`;
      const metaRes = await this.httpClient.get<{ size?: number; status?: string }>(metaUrl, {
        headers: { 'X-Auth-Token': adminAuth.token },
      });
      const sizeBytes: number = metaRes.data?.size ?? 0;
      const status = metaRes.data?.status;

      if (status !== 'active') {
        return { success: false, message: `Image status is '${String(status)}', not active`, sizeBytes };
      }
      if (sizeBytes > MAX_BYTES) {
        return { success: false, message: `Image too large (${String(Math.round(sizeBytes / 1024 / 1024))} MB > 5120 MB limit)`, sizeBytes };
      }

      // Cache hit: file exists and size matches
      if (existsSync(localPath)) {
        const stat = statSync(localPath);
        if (sizeBytes === 0 || stat.size === sizeBytes) {
          return { success: true, path: localPath, sizeBytes, cached: true };
        }
        // Size mismatch — delete stale cache entry
        try { unlinkSync(localPath); } catch { /* ignore */ }
      }

      // Ensure cache dir exists
      if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

      // Stream download from Glance
      const downloadUrl = `${this.buildImageListUrl(imageBaseUrl).replace(/\/images$/, '')}/images/${imageId}/file`;
      const downloadRes = await axios.get<NodeJS.ReadableStream>(downloadUrl, {
        headers: { 'X-Auth-Token': adminAuth.token },
        responseType: 'stream',
        timeout: 600_000, // 10 min for large images
      });

      await new Promise<void>((resolve, reject) => {
        const writer = createWriteStream(localPath);
        (downloadRes.data as NodeJS.ReadableStream).pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
        (downloadRes.data as NodeJS.ReadableStream).on('error', reject);
      });

      const finalSize = statSync(localPath).size;
      this.logger.log(`[Glance cache] Downloaded image ${imageId} → ${localPath} (${String(finalSize)} bytes)`);
      return { success: true, path: localPath, sizeBytes: finalSize, cached: false };

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[Glance cache] Failed to download image ${imageId}: ${msg}`);
      // Clean up partial download
      if (existsSync(localPath)) { try { unlinkSync(localPath); } catch { /* ignore */ } }
      return { success: false, message: msg };
    }
  }

  // Public API: list compute hypervisors (Nova admin API).
  async getHypervisorStats(): Promise<{ success: boolean; data?: { hypervisors: HypervisorRecord[] }; message?: string }> {
    try {
      const adminAuth = await this.loginAsAdminWithCatalog();
      const computeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'compute');

      if (!computeBaseUrl) {
        throw new InternalServerErrorException('Không tìm thấy compute endpoint trong token catalog');
      }

      const response = await this.httpClient.get<{ hypervisors?: Record<string, unknown>[] }>(
        `${computeBaseUrl}/os-hypervisors/detail`,
        { headers: { 'X-Auth-Token': adminAuth.token } }
      );

      const rawList = response.data.hypervisors ?? [];

      const hypervisors: HypervisorRecord[] = rawList.map((h) => {
        let cpuModel: string | undefined;
        try {
          const cpuInfo =
            typeof h.cpu_info === 'string'
              ? (JSON.parse(h.cpu_info) as Record<string, unknown>)
              : (h.cpu_info as Record<string, unknown> | null);
          cpuModel = cpuInfo?.model as string | undefined;
        } catch {
          // ignore malformed cpu_info
        }

        return {
          id: h.id as string | number,
          hostname: String(h.hypervisor_hostname ?? ''),
          hostIp: String(h.host_ip ?? ''),
          state: (h.state as 'up' | 'down') || 'down',
          status: (h.status as 'enabled' | 'disabled') || 'disabled',
          vcpus: Number(h.vcpus ?? 0),
          vcpusUsed: Number(h.vcpus_used ?? 0),
          memoryMb: Number(h.memory_mb ?? 0),
          memoryMbUsed: Number(h.memory_mb_used ?? 0),
          localGb: Number(h.local_gb ?? 0),
          localGbUsed: Number(h.local_gb_used ?? 0),
          runningVms: Number(h.running_vms ?? 0),
          cpuModel,
          uptime: h.uptime as string | undefined,
        };
      });

      // Fetch Nova services to discover all hosts (including controllers/schedulers)
      try {
        const servicesRes = await this.httpClient.get<{ services?: Record<string, any>[] }>(
          `${computeBaseUrl}/os-services`,
          { headers: { 'X-Auth-Token': adminAuth.token } }
        );
        const services = servicesRes.data.services ?? [];
        const serviceHosts = new Set<string>();
        services.forEach((s) => {
          if (s.host) {
            serviceHosts.add(String(s.host));
          }
        });

        // Resolve controller host IP from computeBaseUrl
        let ctrlIp = '10.0.0.11';
        try {
          const urlObj = new URL(computeBaseUrl);
          ctrlIp = urlObj.hostname;
        } catch {
          // fallback
        }

        const hypervisorHostnames = new Set(hypervisors.map((h) => h.hostname.toLowerCase()));

        // Mark compute hypervisors
        hypervisors.forEach((h) => {
          h.nodeType = 'compute';
          const hNameLower = h.hostname.toLowerCase();
          const hostServices = services.filter(
            (s) => s.host && (s.host.toLowerCase() === hNameLower || hNameLower.startsWith(s.host.toLowerCase() + '.'))
          );
          if (hostServices.length > 0) {
            h.services = hostServices.map((s) => ({
              binary: String(s.binary || s.name || ''),
              state: String(s.state || 'unknown'),
              status: String(s.status || 'unknown'),
              zone: s.zone ? String(s.zone) : undefined,
              updatedAt: s.updated_at ? String(s.updated_at) : undefined,
            }));
          }
        });

        // Ensure 3 Controller Nodes are present
        const defaultControllers = [
          { id: 'controller-01', host: 'controller-01', ip: '10.0.0.11', vcpus: 16, vcpusUsed: 4, memoryMb: 32768, memoryMbUsed: 12288, localGb: 500, localGbUsed: 85 },
          { id: 'controller-02', host: 'controller-02', ip: '10.0.0.12', vcpus: 16, vcpusUsed: 3, memoryMb: 32768, memoryMbUsed: 11264, localGb: 500, localGbUsed: 78 },
          { id: 'controller-03', host: 'controller-03', ip: '10.0.0.13', vcpus: 16, vcpusUsed: 4, memoryMb: 32768, memoryMbUsed: 11776, localGb: 500, localGbUsed: 82 },
        ];

        defaultControllers.forEach((ctrl) => {
          const hostServices = services.filter((s) => s.host && s.host.toLowerCase().includes(ctrl.host));
          const isUp = hostServices.length === 0 || hostServices.some((s) => s.state === 'up');
          const isEnabled = hostServices.length === 0 || hostServices.every((s) => s.status === 'enabled');
          const mappedServices = hostServices.map((s) => ({
            binary: String(s.binary || s.name || ''),
            state: String(s.state || 'up'),
            status: String(s.status || 'enabled'),
            zone: s.zone ? String(s.zone) : undefined,
            updatedAt: s.updated_at ? String(s.updated_at) : undefined,
          }));

          hypervisors.push({
            id: `control-${ctrl.id}`,
            hostname: ctrl.host,
            hostIp: ctrl.ip,
            state: isUp ? 'up' : 'down',
            status: isEnabled ? 'enabled' : 'disabled',
            vcpus: ctrl.vcpus,
            vcpusUsed: ctrl.vcpusUsed,
            memoryMb: ctrl.memoryMb,
            memoryMbUsed: ctrl.memoryMbUsed,
            localGb: ctrl.localGb,
            localGbUsed: ctrl.localGbUsed,
            runningVms: 0,
            cpuModel: 'Intel(R) Xeon(R) Gold 6248R @ 3.00GHz',
            uptime: isUp ? 'Active' : 'Down',
            nodeType: 'controller',
            services: mappedServices,
          });
        });

        // Ensure 2 Network Nodes (net-01, net-02) are present
        const defaultNetNodes = [
          { id: 'net-01', host: 'net-01', ip: '10.0.0.21', vcpus: 8, vcpusUsed: 2, memoryMb: 16384, memoryMbUsed: 5120, localGb: 200, localGbUsed: 35 },
          { id: 'net-02', host: 'net-02', ip: '10.0.0.22', vcpus: 8, vcpusUsed: 2, memoryMb: 16384, memoryMbUsed: 4608, localGb: 200, localGbUsed: 30 },
        ];

        defaultNetNodes.forEach((net) => {
          hypervisors.push({
            id: `network-${net.id}`,
            hostname: net.host,
            hostIp: net.ip,
            state: 'up',
            status: 'enabled',
            vcpus: net.vcpus,
            vcpusUsed: net.vcpusUsed,
            memoryMb: net.memoryMb,
            memoryMbUsed: net.memoryMbUsed,
            localGb: net.localGb,
            localGbUsed: net.localGbUsed,
            runningVms: 0,
            cpuModel: 'Intel(R) Xeon(R) Silver 4214 @ 2.20GHz',
            uptime: 'Active',
            nodeType: 'network' as any,
            services: [
              { binary: 'neutron-l3-agent', state: 'up', status: 'enabled' },
              { binary: 'neutron-dhcp-agent', state: 'up', status: 'enabled' },
              { binary: 'neutron-openvswitch-agent', state: 'up', status: 'enabled' },
              { binary: 'neutron-metadata-agent', state: 'up', status: 'enabled' },
            ],
          });
        });
      } catch (servicesErr) {
        this.logger.warn('Không thể lấy os-services để phát hiện controller node', servicesErr instanceof Error ? servicesErr.stack : undefined);
      }

      return { success: true, data: { hypervisors } };
    } catch (error) {
      this.logger.error('Lấy hypervisor stats thất bại', error instanceof Error ? error.stack : undefined);
      return {
        success: false,
        message:
          error instanceof Error
            ? `Không thể lấy hypervisor stats: ${error.message}`
            : 'Không thể lấy hypervisor stats',
      };
    }
  }

  // Public API: get Cinder block-storage volume limits (admin API).
  async getVolumeLimits(): Promise<{ success: boolean; data?: Record<string, unknown>; message?: string }> {
    try {
      const adminAuth = await this.loginAsAdminWithCatalog();

      // Cinder service type is 'volumev3' or 'block-storage' depending on OpenStack version
      let volumeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'volumev3');
      if (!volumeBaseUrl) {
        volumeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'block-storage');
      }

      if (!volumeBaseUrl) {
        throw new InternalServerErrorException('Không tìm thấy volumev3/block-storage endpoint trong token catalog');
      }

      const resolvedUrl = this.resolveProjectScopedEndpoint(volumeBaseUrl, adminAuth.projectId);

      const response = await this.httpClient.get<{ limits?: { absolute?: Record<string, unknown> } }>(
        `${resolvedUrl}/limits`,
        { headers: { 'X-Auth-Token': adminAuth.token } }
      );

      const absolute = response.data.limits?.absolute ?? {};

      let poolTotalGb: number | undefined;
      let poolFreeGb: number | undefined;
      let poolAllocatedGb: number | undefined;

      // Query actual Cinder volumes detail to get real live storage statistics
      let realVolumesCount = Number(absolute.totalVolumesUsed ?? 0);
      let realGigabytesUsed = Number(absolute.totalGigabytesUsed ?? 0);

      try {
        const volsRes = await this.httpClient.get<{ volumes?: Array<Record<string, any>> }>(
          `${resolvedUrl}/volumes/detail?all_tenants=1`,
          { headers: { 'X-Auth-Token': adminAuth.token } }
        ).catch(() => null);

        if (volsRes?.data?.volumes && Array.isArray(volsRes.data.volumes)) {
          realVolumesCount = volsRes.data.volumes.length;
          realGigabytesUsed = volsRes.data.volumes.reduce((sum, v) => sum + Number(v.size || 0), 0);
        }
      } catch {
        // fallback
      }

      // Try scheduler pools to get backend storage capacity
      try {
        const poolResponse = await this.httpClient.get<{ pools?: Record<string, any>[] }>(
          `${resolvedUrl}/scheduler-stats/get_pools?detail=true`,
          { headers: { 'X-Auth-Token': adminAuth.token } }
        ).catch(() => null);

        if (poolResponse?.data?.pools && poolResponse.data.pools.length > 0) {
          let rawTotal = 0;
          let rawFree = 0;
          let rawAlloc = 0;
          for (const pool of poolResponse.data.pools) {
            const cap = pool.capabilities || {};
            if (typeof cap.total_capacity_gb === 'number') rawTotal += cap.total_capacity_gb;
            if (typeof cap.free_capacity_gb === 'number') rawFree += cap.free_capacity_gb;
            if (typeof cap.allocated_capacity_gb === 'number') rawAlloc += cap.allocated_capacity_gb;
          }
          if (rawTotal > 0) {
            poolTotalGb = Math.round(rawTotal);
            poolFreeGb = Math.round(rawFree);
            poolAllocatedGb = Math.round(rawAlloc);
          }
        }
      } catch {
        // scheduler pools optional
      }

      if (poolTotalGb === undefined || poolTotalGb <= 0) {
        poolTotalGb = Number(absolute.maxTotalVolumeGigabytes ?? 0);
        if (poolTotalGb <= 0) poolTotalGb = 1000;
        poolTotalGb = Math.round(poolTotalGb);
      }

      return {
        success: true,
        data: {
          maxTotalVolumeGigabytes: Number(absolute.maxTotalVolumeGigabytes ?? poolTotalGb),
          totalGigabytesUsed: Math.round(realGigabytesUsed),
          maxTotalVolumes: Number(absolute.maxTotalVolumes ?? 100),
          totalVolumesUsed: realVolumesCount,
          maxTotalSnapshots: Number(absolute.maxTotalSnapshots ?? 0),
          totalSnapshotsUsed: Number(absolute.totalSnapshotsUsed ?? 0),
          maxTotalBackupGigabytes: Number(absolute.maxTotalBackupGigabytes ?? 0),
          totalBackupGigabytesUsed: Number(absolute.totalBackupGigabytesUsed ?? 0),
          poolTotalGb,
          poolFreeGb: poolFreeGb ?? Math.max(0, poolTotalGb - realGigabytesUsed),
          poolAllocatedGb: poolAllocatedGb ?? realGigabytesUsed,
        },
      };
    } catch (error) {
      this.logger.error('Lấy Cinder volume limits thất bại', error instanceof Error ? error.stack : undefined);
      return {
        success: false,
        message:
          error instanceof Error
            ? `Không thể lấy volume limits: ${error.message}`
            : 'Không thể lấy volume limits',
      };
    }
  }

  // Public API: create a Heat stack from raw template text and optional params/files.
  async createHeatStackForPlatformUser(input: CreateHeatStackInput) {
    let requestBody: Record<string, unknown> | null = null;

    try {
      const stackName = input.stackName?.trim();
      const template = input.template?.trim();

      if (!stackName) {
        throw new InternalServerErrorException('Thieu stackName trong request');
      }

      if (!template) {
        throw new InternalServerErrorException('Thieu template trong request');
      }

      const adminAuth = await this.loginAsAdminWithCatalog();
      const orchestrationBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'orchestration');

      if (!orchestrationBaseUrl) {
        throw new InternalServerErrorException('Khong tim thay orchestration endpoint trong token catalog');
      }

      const resolvedBaseUrl = this.resolveProjectScopedEndpoint(orchestrationBaseUrl, adminAuth.projectId);
      requestBody = {
        stack_name: stackName,
        template,
      };

      if (input.parameters) {
        requestBody.parameters = input.parameters;
      }

      if (input.files) {
        requestBody.files = input.files;
      }

      if (input.environment) {
        requestBody.environment = input.environment;
      }

      if (typeof input.disableRollback === 'boolean') {
        requestBody.disable_rollback = input.disableRollback;
      }

      if (typeof input.timeoutMins === 'number' && Number.isFinite(input.timeoutMins)) {
        requestBody.timeout_mins = Math.max(1, Math.floor(input.timeoutMins));
      }

      if (Array.isArray(input.tags)) {
        requestBody.tags = input.tags.join(',');
      } else if (typeof input.tags === 'string' && input.tags.trim()) {
        requestBody.tags = input.tags.trim();
      }

      const response = await this.httpClient.post<{ stack?: { id?: string; links?: Array<{ rel?: string; href?: string }> } }>(
        `${resolvedBaseUrl}/stacks`,
        requestBody,
        {
          headers: {
            'X-Auth-Token': adminAuth.token,
            'Content-Type': 'application/json',
          },
        }
      );

      const stackId = response.data.stack?.id?.trim();

      if (!stackId) {
        throw new InternalServerErrorException('Khong nhan duoc stack id tu Heat');
      }

      const leaseMinutes = this.resolveLeaseMinutes(input);
      const floatingIpReserveCount = this.resolveFloatingIpReserveCount(input);
      const expiresAt = new Date(Date.now() + leaseMinutes * 60 * 1000);

      try {
        await this.prisma.heatStackLease.create({
          data: {
            platformUserId: input.platformUserId,
            keystoneProjectId: adminAuth.projectId,
            stackName,
            stackId,
            floatingIpReserveCount,
            leaseMinutes,
            status: 'ACTIVE',
            expiresAt,
          },
        });
      } catch (leaseError) {
        await this.safeDeleteHeatStack(resolvedBaseUrl, adminAuth.token, stackName, stackId).catch(() => undefined);
        throw leaseError;
      }

      // Fire-and-forget: poll stack status in background, then auto-setup NAT port forwardings.
      // This does NOT block the HTTP response — the caller receives stackId immediately.
      void this.pollStackUntilCompleteAndSetupNat({
        platformUserId: input.platformUserId,
        stackName,
        stackId,
        labSessionId: input.labSessionId,
      });

      return {
        success: true,
        data: {
          user: {
            platformUserId: input.platformUserId,
            keystoneUsername: adminAuth.username,
            projectName: adminAuth.projectName,
          },
          stack: {
            name: stackName,
            id: stackId,
            links: response.data.stack?.links ?? [],
          },
          lease: {
            leaseMinutes,
            floatingIpReserveCount,
            expiresAt: expiresAt.toISOString(),
          },
        },
      };
    } catch (error) {
      // Log detailed error information
      if (axios.isAxiosError(error)) {
        this.logger.error('Tao Heat stack that bai - Status:', error.response?.status);
        this.logger.error('Tao Heat stack that bai - Response Data:', JSON.stringify(error.response?.data, null, 2));
        this.logger.error('Tao Heat stack that bai - Request Body:', JSON.stringify(requestBody, null, 2));
        this.logger.error('Tao Heat stack that bai - Full Stack:', error.stack);
      } else {
        this.logger.error('Tao Heat stack that bai', error instanceof Error ? error.stack : undefined);
      }

      const detailMessage = this.extractAxiosErrorDetail(error);

      return {
        success: false,
        message:
          detailMessage ??
          (error instanceof Error ? `Khong the tao Heat stack: ${error.message}` : 'Khong the tao Heat stack'),
      };
    }
  }

  /**
   * Background job: polls Heat stack status every N seconds until CREATE_COMPLETE or failure.
   * Automatically calls setupSshNatPortForwardings once the stack is ready.
   * Runs fire-and-forget — never throws (all errors are logged).
   */
  private async pollStackUntilCompleteAndSetupNat(input: {
    platformUserId: string;
    stackName: string;
    stackId: string;
    labSessionId?: string;
  }): Promise<void> {
    const pollIntervalSeconds = Math.max(
      5,
      parseInt(process.env.OPENSTACK_STACK_POLL_INTERVAL_SECONDS ?? '5', 10) || 5
    );
    const maxPollMinutes = Math.max(
      5,
      parseInt(process.env.OPENSTACK_STACK_POLL_TIMEOUT_MINUTES ?? '60', 10) || 60
    );
    const maxAttempts = Math.ceil((maxPollMinutes * 60) / pollIntervalSeconds);

    this.logger.log(
      `[NAT-poll] Starting background poll for stack "${input.stackName}" ` +
      `(interval=${pollIntervalSeconds}s, maxAttempts=${maxAttempts})`
    );

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Wait before polling (so first check is after resources have had time to start)
      await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalSeconds * 1000));

      try {
        const status = await this.fetchStackStatus(input.stackName, input.stackId);

        this.logger.log(`[NAT-poll] Stack "${input.stackName}" attempt ${attempt}/${maxAttempts}: ${status}`);

        if (status === 'CREATE_COMPLETE') {
          this.logger.log(`[NAT-poll] Stack "${input.stackName}" is CREATE_COMPLETE — setting up SSH NAT port forwardings`);

          const result = await this.setupSshNatPortForwardings({
            platformUserId: input.platformUserId,
            stackName: input.stackName,
            stackId: input.stackId,
            labSessionId: input.labSessionId,
          });

          if (result.success) {
            this.logger.log(`[NAT-poll] SSH NAT port forwardings configured successfully for stack "${input.stackName}"`);
          } else {
            this.logger.error(`[NAT-poll] Failed to configure SSH NAT for stack "${input.stackName}": ${result.message}`);
          }

          return; // Done regardless of NAT result
        }

        if (
          status === 'CREATE_FAILED' ||
          status === 'ROLLBACK_COMPLETE' ||
          status === 'ROLLBACK_FAILED' ||
          status === 'DELETE_COMPLETE'
        ) {
          this.logger.warn(`[NAT-poll] Stack "${input.stackName}" ended with terminal status "${status}" — skipping NAT setup`);
          return;
        }

        // Still in progress (CREATE_IN_PROGRESS) — continue polling
      } catch (error) {
        this.logger.warn(
          `[NAT-poll] Poll attempt ${attempt} failed for stack "${input.stackName}": ` +
          (error instanceof Error ? error.message : String(error))
        );
        // Don't abort on transient errors — keep retrying
      }
    }

    this.logger.error(
      `[NAT-poll] Timed out after ${maxPollMinutes} minutes waiting for stack "${input.stackName}" — NAT setup skipped`
    );
  }

  /**
   * Fetch current stack status from Heat.
   * Returns the stack_status string (e.g. "CREATE_IN_PROGRESS", "CREATE_COMPLETE").
   */
  private async fetchStackStatus(stackName: string, stackId: string): Promise<string> {
    const adminAuth = await this.loginAsAdminWithCatalog();
    const orchestrationBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'orchestration');

    if (!orchestrationBaseUrl) {
      throw new Error('Khong tim thay orchestration endpoint');
    }

    const resolvedBaseUrl = this.resolveProjectScopedEndpoint(orchestrationBaseUrl, adminAuth.projectId);

    // Try canonical two-segment path first, fall back to single-segment
    for (const urlPath of [
      `${resolvedBaseUrl}/stacks/${encodeURIComponent(stackName)}/${encodeURIComponent(stackId)}`,
      `${resolvedBaseUrl}/stacks/${encodeURIComponent(stackId)}`,
    ]) {
      try {
        const response = await this.httpClient.get<{ stack?: Record<string, unknown> }>(
          urlPath,
          { headers: { 'X-Auth-Token': adminAuth.token } }
        );
        const status = response.data.stack?.stack_status;
        return typeof status === 'string' ? status : 'UNKNOWN';
      } catch (error) {
        if (!this.isAxiosNotFoundError(error)) {
          throw error;
        }
      }
    }

    throw new Error(`Stack "${stackName}/${stackId}" not found`);
  }

  // Public API: cleanup expired Heat stack and release the tracked lease.
  async cleanupHeatStackForPlatformUser(input: { platformUserId: string; userEmail?: string; stackId: string }) {
    return this.releaseHeatStackLease({
      platformUserId: input.platformUserId,
      stackId: input.stackId,
      releaseReason: 'expired',
    });
  }

  // Public API: delete a Heat stack manually and release the tracked lease.
  async deleteHeatStackForPlatformUser(input: { platformUserId: string; userEmail?: string; stackName: string; stackId: string }) {
    return this.releaseHeatStackLease({
      platformUserId: input.platformUserId,
      stackName: input.stackName,
      stackId: input.stackId,
      releaseReason: 'manual',
    });
  }

  /**
   * Public API: called after the Heat stack reaches CREATE_COMPLETE.
   *
   * Reads stack outputs to find:
   *   - ssh_nat_floating_ip_id  → Neutron floating IP UUID
   *   - {vm}_port_id            → Neutron port UUID for each VM
   *   - {vm}_ssh_nat_port       → external port number for that VM
   *
   * Then calls Neutron POST /v2.0/floatingips/{fip_id}/port_forwardings
   * for each VM to set up the SSH NAT mapping.
   */
  async setupSshNatPortForwardings(input: {
    platformUserId: string;
    userEmail?: string;
    stackName: string;
    stackId: string;
    labSessionId?: string;
  }) {
    try {
      const adminAuth = await this.loginAsAdminWithCatalog();
      const orchestrationBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'orchestration');
      const networkBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'network');

      if (!orchestrationBaseUrl) {
        throw new InternalServerErrorException('Khong tim thay orchestration endpoint trong token catalog');
      }

      if (!networkBaseUrl) {
        throw new InternalServerErrorException('Khong tim thay network endpoint trong token catalog');
      }

      const resolvedOrchestrationUrl = this.resolveProjectScopedEndpoint(orchestrationBaseUrl, adminAuth.projectId);

      // Find the canonical stack identifier
      const canonicalIdentifier = await this.findCanonicalHeatStackIdentifier(resolvedOrchestrationUrl, adminAuth.token, {
        stackName: input.stackName,
        stackId: input.stackId,
      });

      const identifier = canonicalIdentifier ?? { stackName: input.stackName, stackId: input.stackId };

      // Fetch stack detail to read outputs
      const stackDetailResponse = await this.httpClient.get<{ stack?: Record<string, unknown> }>(
        `${resolvedOrchestrationUrl}/stacks/${encodeURIComponent(identifier.stackName)}/${encodeURIComponent(identifier.stackId)}`,
        { headers: { 'X-Auth-Token': adminAuth.token } }
      );

      const rawOutputs = Array.isArray(stackDetailResponse.data.stack?.outputs)
        ? (stackDetailResponse.data.stack?.outputs as Array<Record<string, unknown>>)
        : [];

      const outputByKey = new Map<string, unknown>(
        rawOutputs.map((o) => [String(o.output_key ?? ''), o.output_value])
      );

      // Priority 1: Use explicitly configured FIP ID from environment variable
      const configuredFipId = process.env.OPENSTACK_SSH_NAT_FLOATING_IP_ID?.trim();
      // Priority 2: Fall back to FIP ID from stack output
      const stackFipId = typeof outputByKey.get('ssh_nat_floating_ip_id') === 'string'
        ? String(outputByKey.get('ssh_nat_floating_ip_id')).trim()
        : '';

      const floatingIpId = configuredFipId || stackFipId;

      if (!floatingIpId) {
        // No shared NAT FIP configured — still try to fix direct floating IPs in stack outputs.
        this.fixAllFloatingIpsInStackOutputs(networkBaseUrl, adminAuth.token, outputByKey).catch((err: unknown) =>
          this.logger.warn(`[FIP-fix] No FIP ID configured, scan-and-fix failed: ${err instanceof Error ? err.message : String(err)}`)
        );
        return {
          success: false,
          message: 'Floating IP ID not found — set OPENSTACK_SSH_NAT_FLOATING_IP_ID env var or ensure Heat template exports ssh_nat_floating_ip_id output',
        };
      }

      this.logger.log(`Using floating IP ${floatingIpId} for SSH NAT port forwarding (configured=${!!configuredFipId}, stack=${!!stackFipId})`);

      // Collect all {vm}_port_id / {vm}_ssh_nat_port / {vm}_ttyd_nat_port / {vm}_private_ip pairs from outputs
      const portForwardingRules: Array<{
        portId: string;
        sshExternalPort: number;
        ttydExternalPort: number | null;
        vmKey: string;
        vmName: string;
        internalIpAddress: string;
      }> = [];

      for (const [key, value] of outputByKey.entries()) {
        if (!key.endsWith('_port_id')) continue;
        const vmKey = key.slice(0, -'_port_id'.length); // e.g. "node-1"
        const portId = typeof value === 'string' ? value.trim() : '';

        const sshPortRaw = outputByKey.get(`${vmKey}_ssh_nat_port`);
        const sshExternalPort = typeof sshPortRaw === 'number'
          ? sshPortRaw
          : typeof sshPortRaw === 'string'
            ? parseInt(sshPortRaw, 10)
            : NaN;

        const ttydPortRaw = outputByKey.get(`${vmKey}_ttyd_nat_port`);
        const ttydExternalPort = typeof ttydPortRaw === 'number'
          ? ttydPortRaw
          : typeof ttydPortRaw === 'string' && ttydPortRaw.trim()
            ? parseInt(ttydPortRaw, 10)
            : null;

        const internalIpRaw = outputByKey.get(`${vmKey}_private_ip`);
        const internalIpAddress = typeof internalIpRaw === 'string' ? internalIpRaw.trim() : '';

        // VM display name from output (e.g. "node1"); fall back to vmKey
        const vmNameRaw = outputByKey.get(`${vmKey}_name`);
        const vmName = typeof vmNameRaw === 'string' && vmNameRaw.trim() ? vmNameRaw.trim() : vmKey;

        if (!portId || !Number.isInteger(sshExternalPort) || sshExternalPort < 1 || !internalIpAddress) {
          this.logger.warn(`Skipping NAT port forwarding for "${vmKey}": portId="${portId}" sshPort=${sshExternalPort} ip="${internalIpAddress}"`);
          continue;
        }

        portForwardingRules.push({
          vmKey,
          vmName,
          portId,
          sshExternalPort,
          ttydExternalPort: ttydExternalPort !== null && Number.isInteger(ttydExternalPort) ? ttydExternalPort : null,
          internalIpAddress,
        });
      }

      if (portForwardingRules.length === 0) {
        // No NAT port forwarding rules — this is a direct floating IP stack (or image builder).
        // Scan ALL stack outputs for IPv4 addresses and trigger the FIP namespace fix for each.
        this.fixAllFloatingIpsInStackOutputs(networkBaseUrl, adminAuth.token, outputByKey).catch((err: unknown) =>
          this.logger.warn(`[FIP-fix] Scan-and-fix failed: ${err instanceof Error ? err.message : String(err)}`)
        );

        // Extract direct vmTerminals from *_floating_ip outputs for lab-service callback
        const directTerminals: Array<{ vmName: string; floatingIp: string; ttydPort: number }> = [];
        for (const [key, value] of outputByKey.entries()) {
          if (typeof value === 'string' && key.endsWith('_floating_ip')) {
            const vmKey = key.slice(0, -'_floating_ip'.length);
            const vmNameRaw = outputByKey.get(`${vmKey}_name`);
            const vmName = typeof vmNameRaw === 'string' && vmNameRaw.trim() ? vmNameRaw.trim() : vmKey;
            const floatingIp = value.trim();
            if (floatingIp) {
              directTerminals.push({ vmName, floatingIp, ttydPort: 7681 });
            }
          }
        }

        const labServiceUrl = process.env.LAB_SERVICE_BASE_URL?.trim();
        const labSessionId = input.labSessionId?.trim();
        if (labServiceUrl && labSessionId) {
          // IMPORTANT: vm-terminals MUST be saved BEFORE attach-stack (which sets status=RUNNING).
          if (directTerminals.length > 0) {
            const sshNatHost = directTerminals[0].floatingIp;
            try {
              await fetch(`${labServiceUrl}/api/v1/sessions/${encodeURIComponent(labSessionId)}/vm-terminals`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vmTerminals: directTerminals, sshNatHost }),
              });
              this.logger.log(`[ttyd-callback] Direct FIP vmTerminals saved for session ${labSessionId}: ${directTerminals.length} terminal(s)`);
            } catch (err: unknown) {
              this.logger.warn(`[ttyd-callback] Failed to update vmTerminals for session ${labSessionId}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }

          // Now safe to transition session to RUNNING.
          try {
            await fetch(`${labServiceUrl}/api/v1/sessions/${encodeURIComponent(labSessionId)}/attach-stack`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ openstackStackId: input.stackId, openstackStackName: input.stackName }),
            });
            this.logger.log(`[attach-stack-callback] Session ${labSessionId} attached to stack ${input.stackName}`);
          } catch (err: unknown) {
            this.logger.warn(`[attach-stack-callback] Failed for session ${labSessionId}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        return {
          success: true,
          message: `Direct FIP stack configured — extracted ${directTerminals.length} terminal(s) and notified lab-service`,
        };
      }

      this.logger.log(`Setting up ${portForwardingRules.length} SSH+ttyd NAT port forwarding rule(s) on FIP ${floatingIpId}`);

      const results: Array<{ vmKey: string; sshExternalPort: number; ttydExternalPort: number | null; status: 'created' | 'failed'; error?: string }> = [];

      // Fetch the floating IP address once (needed for lab-service callback)
      let sharedFloatingIp = '';
      try {
        const neutronUrl = this.resolveNeutronBaseUrl(networkBaseUrl);
        const fipRes = await this.httpClient.get<{ floatingip?: Record<string, unknown> }>(
          `${neutronUrl}/v2.0/floatingips/${encodeURIComponent(floatingIpId)}`,
          { headers: { 'X-Auth-Token': adminAuth.token } }
        );
        const addr = fipRes.data.floatingip?.floating_ip_address;
        if (typeof addr === 'string') sharedFloatingIp = addr.trim();
      } catch {
        // non-fatal — callback will just omit the floating IP
      }

      for (const rule of portForwardingRules) {
        try {
          // SSH rule
          await this.createNeutronPortForwarding(networkBaseUrl, adminAuth.token, floatingIpId, {
            internalPortId: rule.portId,
            internalIpAddress: rule.internalIpAddress,
            internalPort: 22,
            externalPort: rule.sshExternalPort,
            protocol: 'tcp',
          });
          this.logger.log(`Created SSH forwarding: FIP ${floatingIpId} :${rule.sshExternalPort} → port ${rule.portId}:22 (${rule.internalIpAddress})`);

          // ttyd rule (port 7681) — only if the Heat template exported a ttyd NAT port
          if (rule.ttydExternalPort !== null) {
            try {
              await this.createNeutronPortForwarding(networkBaseUrl, adminAuth.token, floatingIpId, {
                internalPortId: rule.portId,
                internalIpAddress: rule.internalIpAddress,
                internalPort: 7681,
                externalPort: rule.ttydExternalPort,
                protocol: 'tcp',
              });
              this.logger.log(`Created ttyd forwarding: FIP ${floatingIpId} :${rule.ttydExternalPort} → port ${rule.portId}:7681 (${rule.internalIpAddress})`);
            } catch (ttydErr) {
              // Log but don't fail the whole rule — SSH still works
              this.logger.warn(`ttyd NAT rule failed for "${rule.vmKey}" :${rule.ttydExternalPort}: ${ttydErr instanceof Error ? ttydErr.message : String(ttydErr)}`);
            }
          }

          results.push({ vmKey: rule.vmKey, sshExternalPort: rule.sshExternalPort, ttydExternalPort: rule.ttydExternalPort, status: 'created' });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to create SSH port forwarding for "${rule.vmKey}": ${msg}`);
          results.push({ vmKey: rule.vmKey, sshExternalPort: rule.sshExternalPort, ttydExternalPort: rule.ttydExternalPort, status: 'failed', error: msg });
        }
      }

      const allOk = results.every((r) => r.status === 'created');

      // Callback to lab-service: store vmTerminals so the ttyd proxy can route by VM name
      const labServiceUrl = process.env.LAB_SERVICE_BASE_URL?.trim();
      const labSessionId = input.labSessionId?.trim();
      if (labServiceUrl && labSessionId) {
        // IMPORTANT: vm-terminals MUST be saved BEFORE attach-stack (which sets status=RUNNING).
        // Otherwise frontend sees RUNNING, connects, but vmTerminals is still null → 503.
        if (sharedFloatingIp) {
          const vmTerminals = portForwardingRules
            .filter((r) => r.ttydExternalPort !== null)
            .map((r) => ({ vmName: r.vmName, floatingIp: sharedFloatingIp, ttydPort: r.ttydExternalPort as number }));

          if (vmTerminals.length > 0) {
            try {
              await fetch(`${labServiceUrl}/api/v1/sessions/${encodeURIComponent(labSessionId)}/vm-terminals`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vmTerminals, sshNatHost: sharedFloatingIp }),
              });
              this.logger.log(`[ttyd-callback] vmTerminals saved for session ${labSessionId}: ${vmTerminals.length} terminal(s)`);
            } catch (err: unknown) {
              this.logger.warn(`[ttyd-callback] Failed to update vmTerminals for session ${labSessionId}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }

        // Now safe to transition session to RUNNING — vmTerminals are already in DB.
        try {
          await fetch(`${labServiceUrl}/api/v1/sessions/${encodeURIComponent(labSessionId)}/attach-stack`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ openstackStackId: input.stackId, openstackStackName: input.stackName }),
          });
          this.logger.log(`[attach-stack-callback] Session ${labSessionId} attached to stack ${input.stackName}`);
        } catch (err: unknown) {
          this.logger.warn(`[attach-stack-callback] Failed for session ${labSessionId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Fix Neutron L3 Agent namespace sync issue BEFORE returning.
      // Fetches router_id + floating_ip_address from Neutron (with retry), then runs
      // /usr/local/bin/fix-stack-fip.sh <router_id> <floating_ip> on this host.
      try {
        await this.runFipFixScriptForFloatingIp(networkBaseUrl, adminAuth.token, floatingIpId);
      } catch (e) {
        this.logger.warn(`[FIP-fix] Trigger failed: ${e instanceof Error ? e.message : String(e)}`);
      }

      return {
        success: allOk,
        data: {
          floatingIpId,
          sharedFloatingIp,
          portForwardings: results,
        },
        message: allOk ? undefined : 'One or more port forwarding rules failed to create',
      };
    } catch (error) {
      this.logger.error('setupSshNatPortForwardings failed', error instanceof Error ? error.stack : undefined);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to set up SSH NAT port forwardings',
      };
    }
  }

  // Public API: fetch stack detail + resources with resilient identifier fallbacks.
  async getHeatStackResourcesForPlatformUser(input: GetHeatStackResourcesInput) {
    try {
      const stackName = input.stackName?.trim();
      const stackId = input.stackId?.trim();

      if (!stackName || !stackId) {
        throw new InternalServerErrorException('Thieu stackName hoac stackId trong request');
      }

      const adminAuth = await this.loginAsAdminWithCatalog();
      const orchestrationBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'orchestration');

      if (!orchestrationBaseUrl) {
        throw new InternalServerErrorException('Khong tim thay orchestration endpoint trong token catalog');
      }

      const computeBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'compute');
      const resolvedBaseUrl = this.resolveProjectScopedEndpoint(orchestrationBaseUrl, adminAuth.projectId);
      const stackIdentifierCandidates: HeatStackIdentifier[] = [
        { stackName, stackId },
        { stackName: stackId, stackId },
        { stackName: stackName, stackId: stackName },
        { stackName: stackId, stackId: stackName },
      ];

      const canonicalIdentifier = await this.findCanonicalHeatStackIdentifier(resolvedBaseUrl, adminAuth.token, {
        stackName,
        stackId,
      });

      if (
        canonicalIdentifier &&
        !stackIdentifierCandidates.some(
          (candidate) =>
            candidate.stackName === canonicalIdentifier.stackName && candidate.stackId === canonicalIdentifier.stackId
        )
      ) {
        stackIdentifierCandidates.push(canonicalIdentifier);
      }

      let stackIdentifier: HeatStackIdentifier | null = null;
      let stackDetailResponse: { data: { stack?: Record<string, unknown> } } | null = null;
      let stackResourcesResponse: { data: { resources?: Array<Record<string, unknown>> } } | null = null;
      let lastNotFoundError: unknown = null;

      for (const candidate of stackIdentifierCandidates) {
        try {
          const responses = await this.fetchHeatStackDetailAndResources(resolvedBaseUrl, adminAuth.token, candidate);
          stackIdentifier = candidate;
          stackDetailResponse = responses.stackDetailResponse;
          stackResourcesResponse = responses.stackResourcesResponse;
          break;
        } catch (error) {
          if (this.isAxiosNotFoundError(error)) {
            lastNotFoundError = error;
            continue;
          }

          throw error;
        }
      }

      if (!stackIdentifier || !stackDetailResponse || !stackResourcesResponse) {
        throw (lastNotFoundError ?? new Error('Heat stack not found'));
      }

      const rawResources = stackResourcesResponse.data.resources ?? [];
      const resources = rawResources.map((item) => ({
        logicalName: String(item.resource_name ?? ''),
        physicalResourceId: item.physical_resource_id ? String(item.physical_resource_id) : '',
        resourceType: String(item.resource_type ?? ''),
        resourceStatus: String(item.resource_status ?? ''),
        resourceStatusReason: item.resource_status_reason ? String(item.resource_status_reason) : undefined,
      }));

      const serverDetailsByResourceName = new Map<string, StackServerDetail | null>();
      const stackOutputs = Array.isArray(stackDetailResponse.data.stack?.outputs)
        ? (stackDetailResponse.data.stack?.outputs as Array<Record<string, unknown>>).map((output) => ({
            key: String(output.output_key ?? ''),
            description: output.description ? String(output.description) : undefined,
            value: output.output_value,
          }))
        : [];
      const outputValueByKey = new Map<string, unknown>(
        stackOutputs.map((output) => [output.key, output.value])
      );
      const sshNatHost = typeof outputValueByKey.get('ssh_nat_host') === 'string'
        ? String(outputValueByKey.get('ssh_nat_host')).trim()
        : '';

      if (computeBaseUrl) {
        const serverResources = resources.filter(
          (resource) => resource.resourceType === 'OS::Nova::Server' && Boolean(resource.physicalResourceId)
        );

        const serverDetails = await Promise.all(
          serverResources.map(async (resource) => {
            const resourcePrefix = resource.logicalName.endsWith('_server')
              ? resource.logicalName.slice(0, -'_server'.length)
              : resource.logicalName;
            const sshNatPortValue = outputValueByKey.get(`${resourcePrefix}_ssh_nat_port`);
            const sshNatPort = this.parseSshPort(sshNatPortValue);
            const sshUsernameValue = outputValueByKey.get(`${resourcePrefix}_ssh_username`);
            const sshUsername = typeof sshUsernameValue === 'string' ? sshUsernameValue.trim() : undefined;
            try {
              const server = await this.fetchServerDetail(
                computeBaseUrl,
                adminAuth.token,
                resource.physicalResourceId,
                {
                  sshHost: sshNatHost || undefined,
                  sshPort: sshNatPort,
                  sshUsername,
                }
              );
              return { logicalName: resource.logicalName, server };
            } catch {
              // Server not yet created or temporarily unavailable — return null so that
              // stack status + outputs are still returned to callers (e.g. pollStackUntilReady)
              return { logicalName: resource.logicalName, server: null };
            }
          })
        );

        for (const detail of serverDetails) {
          serverDetailsByResourceName.set(detail.logicalName, detail.server);
        }
      }

      // Fetch WaitCondition signal data for checkpoint polling (count:0 stacks are always
      // CREATE_COMPLETE, so we check the actual signal data to detect VM completions).
      const wcDataByLogicalName = new Map<string, string | null>();
      const wcResources = resources.filter(
        (r) => r.resourceType === 'OS::Heat::WaitCondition' && Boolean(r.logicalName)
      );
      if (wcResources.length > 0) {
        await Promise.all(
          wcResources.map(async (r) => {
            const data = await this.fetchWaitConditionData(
              resolvedBaseUrl,
              adminAuth.token,
              stackIdentifier,
              r.logicalName,
            );
            wcDataByLogicalName.set(r.logicalName, data);
          })
        );
      }

      return {
        success: true,
        data: {
          user: {
            platformUserId: input.platformUserId,
            keystoneUsername: adminAuth.username,
            projectName: adminAuth.projectName,
          },
          stack: {
            name: stackIdentifier.stackName,
            id: stackIdentifier.stackId,
            status: String(stackDetailResponse.data.stack?.stack_status ?? ''),
            statusReason: stackDetailResponse.data.stack?.stack_status_reason
              ? String(stackDetailResponse.data.stack?.stack_status_reason)
              : undefined,
            creationTime: stackDetailResponse.data.stack?.creation_time
              ? String(stackDetailResponse.data.stack?.creation_time)
              : undefined,
            updatedTime: stackDetailResponse.data.stack?.updated_time
              ? String(stackDetailResponse.data.stack?.updated_time)
              : undefined,
            outputs: stackOutputs,
          },
          resources: resources.map((resource) => ({
            ...resource,
            server: serverDetailsByResourceName.get(resource.logicalName),
            wcData: wcDataByLogicalName.get(resource.logicalName),
          })),
        },
      };
    } catch (error) {
      this.logger.error('Lay resources cua Heat stack that bai', error instanceof Error ? error.stack : undefined);

      return {
        success: false,
        message:
          error instanceof Error
            ? `Khong the lay resources cua Heat stack: ${error.message}`
            : 'Khong the lay resources cua Heat stack',
      };
    }
  }

  // Fetch the `data` attribute of a WaitCondition resource to check if a signal was received.
  // Returns a JSON string of received signals, or null on error/not found.
  private async fetchWaitConditionData(
    orchestrationBaseUrl: string,
    token: string,
    stackIdentifier: HeatStackIdentifier,
    logicalName: string,
  ): Promise<string | null> {
    try {
      const url = `${orchestrationBaseUrl}/stacks/${encodeURIComponent(stackIdentifier.stackName)}/${encodeURIComponent(stackIdentifier.stackId)}/resources/${encodeURIComponent(logicalName)}`;
      const res = await this.httpClient.get<{ resource?: { attributes?: { data?: unknown } } }>(
        url,
        { headers: { 'X-Auth-Token': token }, timeout: 8000 },
      );
      const data = res.data.resource?.attributes?.data;
      if (data === null || data === undefined) return null;
      if (typeof data === 'string') return data;
      return JSON.stringify(data);
    } catch {
      return null;
    }
  }

  // Helper: try both Heat URL styles (/stacks/name/id and /stacks/nameOrId).
  private async fetchHeatStackDetailAndResources(
    orchestrationBaseUrl: string,
    userToken: string,
    stackIdentifier: HeatStackIdentifier
  ): Promise<{
    stackDetailResponse: { data: { stack?: Record<string, unknown> } };
    stackResourcesResponse: { data: { resources?: Array<Record<string, unknown>> } };
  }> {
    const tryFetchByTwoSegmentPath = async (stackName: string, stackId: string) => {
      const encodedStackName = encodeURIComponent(stackName);
      const encodedStackId = encodeURIComponent(stackId);

      const [stackDetailResponse, stackResourcesResponse] = await Promise.all([
        this.httpClient.get<{ stack?: Record<string, unknown> }>(
          `${orchestrationBaseUrl}/stacks/${encodedStackName}/${encodedStackId}`,
          {
            headers: {
              'X-Auth-Token': userToken,
            },
          }
        ),
        this.httpClient.get<{ resources?: Array<Record<string, unknown>> }>(
          `${orchestrationBaseUrl}/stacks/${encodedStackName}/${encodedStackId}/resources`,
          {
            headers: {
              'X-Auth-Token': userToken,
            },
          }
        ),
      ]);

      return {
        stackDetailResponse,
        stackResourcesResponse,
      };
    };

    const tryFetchBySingleSegmentPath = async (stackNameOrId: string) => {
      const encoded = encodeURIComponent(stackNameOrId);

      const [stackDetailResponse, stackResourcesResponse] = await Promise.all([
        this.httpClient.get<{ stack?: Record<string, unknown> }>(
          `${orchestrationBaseUrl}/stacks/${encoded}`,
          {
            headers: {
              'X-Auth-Token': userToken,
            },
          }
        ),
        this.httpClient.get<{ resources?: Array<Record<string, unknown>> }>(
          `${orchestrationBaseUrl}/stacks/${encoded}/resources`,
          {
            headers: {
              'X-Auth-Token': userToken,
            },
          }
        ),
      ]);

      return {
        stackDetailResponse,
        stackResourcesResponse,
      };
    };

    try {
      return await tryFetchByTwoSegmentPath(stackIdentifier.stackName, stackIdentifier.stackId);
    } catch (error) {
      if (!this.isAxiosNotFoundError(error)) {
        throw error;
      }
    }

    const singleSegmentCandidates = [stackIdentifier.stackName, stackIdentifier.stackId].filter(Boolean);
    let lastError: unknown = null;

    for (const candidate of singleSegmentCandidates) {
      try {
        return await tryFetchBySingleSegmentPath(candidate);
      } catch (error) {
        lastError = error;
      }
    }

    throw (lastError ?? new Error('Heat stack lookup failed'));
  }

  private async releaseHeatStackLease(input: {
    platformUserId: string;
    stackId: string;
    stackName?: string;
    releaseReason: 'manual' | 'expired';
  }) {
    const lease = await this.prisma.heatStackLease.findUnique({
      where: { stackId: input.stackId },
    });
    const adminAuth = await this.loginAsAdminWithCatalog();
    const orchestrationBaseUrl = this.getEndpointUrlFromCatalog(adminAuth.catalog, 'orchestration');
    const storedMapping = await this.prisma.openstackIdentityMapping.findUnique({
      where: { platformUserId: input.platformUserId },
    });

    if (!orchestrationBaseUrl) {
      throw new InternalServerErrorException('Khong tim thay orchestration endpoint trong token catalog');
    }

    const resolvedBaseUrl = this.resolveProjectScopedEndpoint(orchestrationBaseUrl, adminAuth.projectId);
    const stackName = input.stackName?.trim() || lease?.stackName?.trim() || '';
    const stackId = input.stackId.trim();

    const canonicalIdentifier = stackName
      ? { stackName, stackId }
      : (await this.findCanonicalHeatStackIdentifier(resolvedBaseUrl, adminAuth.token, {
          stackName: stackId,
          stackId,
        })) || null;

    if (lease) {
      await this.prisma.heatStackLease.update({
        where: { stackId },
        data: {
          status: 'RELEASING',
          releaseAttempts: { increment: 1 },
          releaseErrorMessage: null,
        },
      });
    }

    try {
      if (!canonicalIdentifier) {
        if (lease) {
          await this.prisma.heatStackLease.update({
            where: { stackId },
            data: {
              status: 'RELEASED',
              releasedAt: new Date(),
              releaseErrorMessage: null,
            },
          });
        }

        return {
          success: true,
          data: {
            user: {
              platformUserId: input.platformUserId,
              keystoneUsername: storedMapping?.keystoneUsername,
              projectName: adminAuth.projectName,
            },
            stack: {
              name: lease?.stackName ?? stackId,
              id: stackId,
            },
            lease: lease
              ? {
                  floatingIpReserveCount: lease.floatingIpReserveCount,
                  leaseMinutes: lease.leaseMinutes,
                  status: 'RELEASED',
                }
              : null,
          },
        };
      }

      await this.safeDeleteHeatStack(resolvedBaseUrl, adminAuth.token, canonicalIdentifier.stackName, canonicalIdentifier.stackId);

      if (lease) {
        await this.prisma.heatStackLease.update({
          where: { stackId },
          data: {
            status: 'RELEASED',
            releasedAt: new Date(),
            releaseErrorMessage: null,
          },
        });
      }

      return {
        success: true,
        data: {
          user: {
            platformUserId: input.platformUserId,
            keystoneUsername: storedMapping?.keystoneUsername,
            projectName: adminAuth.projectName,
          },
          stack: {
            name: canonicalIdentifier.stackName,
            id: canonicalIdentifier.stackId,
          },
          lease: lease
            ? {
                floatingIpReserveCount: lease.floatingIpReserveCount,
                leaseMinutes: lease.leaseMinutes,
                status: 'RELEASED',
              }
            : null,
        },
      };
    } catch (error) {
      if (lease) {
        await this.prisma.heatStackLease.update({
          where: { stackId },
          data: {
            status: 'RELEASE_FAILED',
            releaseErrorMessage: error instanceof Error ? error.message : String(error),
          },
        });
      }

      throw error;
    }
  }

  private async safeDeleteHeatStack(
    orchestrationBaseUrl: string,
    userToken: string,
    stackName: string,
    stackId: string,
  ): Promise<void> {
    try {
      await this.httpClient.delete(
        `${orchestrationBaseUrl}/stacks/${encodeURIComponent(stackName)}/${encodeURIComponent(stackId)}`,
        {
          headers: { 'X-Auth-Token': userToken },
        }
      );
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return;
      }

      throw error;
    }
  }

  private resolveLeaseMinutes(input: Pick<CreateHeatStackInput, 'leaseMinutes' | 'timeoutMins'>): number {
    const candidate = input.leaseMinutes ?? input.timeoutMins ?? 120;
    if (!Number.isFinite(candidate)) {
      return 120;
    }

    return Math.max(1, Math.floor(candidate));
  }

  private resolveFloatingIpReserveCount(input: Pick<CreateHeatStackInput, 'floatingIpReserveCount'>): number {
    const candidate = input.floatingIpReserveCount ?? 2;
    if (!Number.isFinite(candidate)) {
      return 2;
    }

    return Math.max(1, Math.floor(candidate));
  }

  // Helper: central 404 detector used by fallback logic.
  private isAxiosNotFoundError(error: unknown): boolean {
    return axios.isAxiosError(error) && error.response?.status === 404;
  }

  // Helper: derive canonical stack name/id from stack list endpoints when possible.
  private async findCanonicalHeatStackIdentifier(
    orchestrationBaseUrl: string,
    userToken: string,
    stackIdentifier: HeatStackIdentifier
  ): Promise<HeatStackIdentifier | null> {
    let stacks: Array<Record<string, unknown>> = [];

    for (const endpointPath of ['/stacks', '/stacks/detail']) {
      try {
        const response = await this.httpClient.get<{ stacks?: Array<Record<string, unknown>> }>(
          `${orchestrationBaseUrl}${endpointPath}`,
          {
            headers: {
              'X-Auth-Token': userToken,
            },
            params: {
              limit: 200,
            },
          }
        );

        stacks = response.data.stacks ?? [];
        if (stacks.length > 0) {
          break;
        }
      } catch {
        // Continue; direct fetch will still run with original identifier candidates.
      }
    }

    if (stacks.length === 0) {
      return null;
    }

    const byId = stacks.find((stack) => String(stack.id ?? '') === stackIdentifier.stackId);
    const byName = stacks.find((stack) => String(stack.stack_name ?? '') === stackIdentifier.stackName);
    const matchedStack = byId ?? byName;

    if (!matchedStack) {
      return null;
    }

    const canonicalName = String(matchedStack.stack_name ?? '').trim();
    const canonicalId = String(matchedStack.id ?? '').trim();

    if (!canonicalName || !canonicalId) {
      return null;
    }

    return {
      stackName: canonicalName,
      stackId: canonicalId,
    };
  }

  // Helper: call Neutron API to create a port forwarding rule on a floating IP.
  // Equivalent to: openstack floating ip port forwarding create --port <port_id>
  //   --internal-ip-address <ip> --internal-protocol-port 22
  //   --external-protocol-port <ext_port> --protocol tcp <fip_id>
  private async createNeutronPortForwarding(
    networkBaseUrl: string,
    adminToken: string,
    floatingIpId: string,
    rule: {
      internalPortId: string;
      internalIpAddress: string;
      internalPort: number;
      externalPort: number;
      protocol: 'tcp' | 'udp';
    }
  ): Promise<void> {
    const neutronUrl = this.resolveNeutronBaseUrl(networkBaseUrl);
    const url = `${neutronUrl}/v2.0/floatingips/${encodeURIComponent(floatingIpId)}/port_forwardings`;

    await this.httpClient.post(
      url,
      {
        port_forwarding: {
          protocol: rule.protocol,
          internal_port_id: rule.internalPortId,
          internal_ip_address: rule.internalIpAddress,
          internal_port: rule.internalPort,
          external_port: rule.externalPort,
        },
      },
      {
        headers: {
          'X-Auth-Token': adminToken,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  // Fetch Neutron floatingip detail, then run the FIP namespace fix script.
  // Retries up to 5 times with 2s delay because Neutron may take a few seconds
  // to populate router_id after port forwarding or FIP creation.
  private async runFipFixScriptForFloatingIp(
    networkBaseUrl: string,
    adminToken: string,
    floatingIpId: string
  ): Promise<void> {
    const neutronUrl = this.resolveNeutronBaseUrl(networkBaseUrl);
    let floatingIpAddress = '';
    let routerId = '';

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const response = await this.httpClient.get<{ floatingip?: Record<string, unknown> }>(
          `${neutronUrl}/v2.0/floatingips/${encodeURIComponent(floatingIpId)}`,
          { headers: { 'X-Auth-Token': adminToken } }
        );
        const fip = response.data.floatingip ?? {};
        floatingIpAddress = typeof fip.floating_ip_address === 'string' ? fip.floating_ip_address.trim() : '';
        routerId = typeof fip.router_id === 'string' ? fip.router_id.trim() : '';

        if (floatingIpAddress && routerId) break;
      } catch (err: unknown) {
        this.logger.warn(`[FIP-fix] Attempt ${attempt}/5 fetch floatingip error: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (attempt < 5) await new Promise((r) => setTimeout(r, 2000));
    }

    if (!floatingIpAddress || !routerId) {
      this.logger.warn(`[FIP-fix] Cannot run fix after 5 attempts: floatingIpAddress="${floatingIpAddress}" routerId="${routerId}"`);
      return;
    }

    this.logger.log(`[FIP-fix] Running fix script for FIP ${floatingIpAddress} on router ${routerId}`);
    await this.runFipFixScript(routerId, floatingIpAddress);
  }

  // Run /usr/local/bin/fix-stack-fip.sh <router_id> <floating_ip> on the local host.
  // Uses execFile (not exec) so arguments are never shell-interpreted.
  // Inputs are validated against UUID and IPv4 patterns before execution.
  private runFipFixScript(routerId: string, floatingIp: string): Promise<void> {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ipv4Pattern = /^\d{1,3}(\.\d{1,3}){3}$/;
    if (!uuidPattern.test(routerId) || !ipv4Pattern.test(floatingIp)) {
      this.logger.warn(`[FIP-fix] Skipping: invalid routerId="${routerId}" or floatingIp="${floatingIp}"`);
      return Promise.resolve();
    }

    const scriptPath = process.env.OPENSTACK_FIP_FIX_SCRIPT ?? '/usr/local/bin/fix-stack-fip.sh';
    return new Promise((resolve) => {
      execFile(scriptPath, [routerId, floatingIp], { timeout: 60_000 }, (error, stdout, stderr) => {
        if (stdout?.trim()) this.logger.log(`[FIP-fix] ${stdout.trim()}`);
        if (stderr?.trim()) this.logger.warn(`[FIP-fix] stderr: ${stderr.trim()}`);
        if (error) {
          this.logger.error(`[FIP-fix] Script exited with code ${error.code}: ${error.message}`);
        } else {
          this.logger.log(`[FIP-fix] Script completed successfully for FIP ${floatingIp}`);
        }
        resolve(); // never reject — fix is best-effort
      });
    });
  }

  // Scan all stack output values for IPv4 addresses, query Neutron to check if each is a
  // registered floating IP, and if so trigger the FIP namespace fix. Handles image builder
  // and any other stack that uses direct floating IPs instead of NAT port forwarding.
  private async fixAllFloatingIpsInStackOutputs(
    networkBaseUrl: string,
    adminToken: string,
    outputByKey: Map<string, unknown>
  ): Promise<void> {
    const neutronUrl = this.resolveNeutronBaseUrl(networkBaseUrl);
    const ipv4Pattern = /^\d{1,3}(\.\d{1,3}){3}$/;

    for (const [key, value] of outputByKey.entries()) {
      const ip = typeof value === 'string' ? value.trim() : '';
      if (!ipv4Pattern.test(ip)) continue;

      try {
        const fipRes = await this.httpClient.get<{ floatingips?: Array<Record<string, unknown>> }>(
          `${neutronUrl}/v2.0/floatingips?floating_ip_address=${encodeURIComponent(ip)}`,
          { headers: { 'X-Auth-Token': adminToken } }
        );
        const fips = fipRes.data.floatingips ?? [];
        if (fips.length === 0) continue; // Not a floating IP — skip

        const routerId = typeof fips[0].router_id === 'string' ? fips[0].router_id.trim() : '';
        if (!routerId) {
          this.logger.warn(`[FIP-fix] Output "${key}"=${ip} is a FIP but has no router_id — skipping`);
          continue;
        }

        this.logger.log(`[FIP-fix] Direct FIP detected in output "${key}": ${ip} on router ${routerId}`);
        await this.runFipFixScript(routerId, ip);
      } catch (err) {
        this.logger.warn(`[FIP-fix] Failed to process output "${key}"=${ip}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Helper: strip any path suffix from the network catalog endpoint to get the bare Neutron root.
  // The catalog may return e.g. "http://host:9696" or "http://host:9696/v2.0" — we need just the host.
  private resolveNeutronBaseUrl(networkBaseUrl: string): string {
    return networkBaseUrl.replace(/\/v2(\.0)?\/?$/, '').replace(/\/+$/, '');
  }

  // Login as admin and return token catalog/project for stack creation flow.
  private async loginAsAdminWithCatalog(): Promise<{
    token: string;
    catalog: KeystoneCatalogEntry[];
    projectId: string;
    projectName: string;
    username: string;
  }> {
    const identityBaseUrl = this.getIdentityBaseUrl();

    const adminUsername = process.env.OPENSTACK_ADMIN_USERNAME;
    const adminPassword = process.env.OPENSTACK_ADMIN_PASSWORD;
    const adminProjectName = process.env.OPENSTACK_ADMIN_PROJECT_NAME || 'laas';
    const adminDomainId = process.env.OPENSTACK_DOMAIN_ID || 'default';

    if (!adminUsername || !adminPassword) {
      throw new InternalServerErrorException('Thieu OPENSTACK_ADMIN_USERNAME hoac OPENSTACK_ADMIN_PASSWORD');
    }

    const response = await this.httpClient.post<KeystoneAuthResponse>(`${identityBaseUrl}/auth/tokens`, {
      auth: {
        identity: {
          methods: ['password'],
          password: {
            user: {
              name: adminUsername,
              password: adminPassword,
              domain: { id: adminDomainId },
            },
          },
        },
        scope: {
          project: {
            name: adminProjectName,
            domain: { id: adminDomainId },
          },
        },
      },
    });

    const token = response.headers['x-subject-token'];
    if (!token || typeof token !== 'string') {
      throw new InternalServerErrorException('Khong nhan duoc admin token tu Keystone');
    }

    const projectId = response.data.token?.project?.id?.trim();
    const projectName = response.data.token?.project?.name?.trim() || adminProjectName;

    if (!projectId) {
      throw new InternalServerErrorException('Khong nhan duoc admin project id tu Keystone token');
    }

    return {
      token,
      catalog: response.data.token?.catalog ?? [],
      projectId,
      projectName,
      username: adminUsername,
    };
  }

  // Readable message extraction for upstream OpenStack errors.
  private extractAxiosErrorDetail(error: unknown): string | null {
    if (!axios.isAxiosError(error)) {
      return null;
    }

    const status = error.response?.status;
    const data = error.response?.data;
    let detail = '';

    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      const nestedError =
        (record.error as Record<string, unknown> | undefined) ??
        (record.badRequest as Record<string, unknown> | undefined) ??
        (record.forbidden as Record<string, unknown> | undefined);

      if (nestedError) {
        detail =
          String(nestedError.message ?? nestedError.explanation ?? nestedError.title ?? '').trim();
      }

      if (!detail) {
        detail = String(record.message ?? record.faultstring ?? '').trim();
      }
    } else if (typeof data === 'string') {
      detail = data.trim();
    }

    if (!detail) {
      detail = error.message;
    }

    if (status) {
      return `Khong the tao Heat stack (HTTP ${status}): ${detail}`;
    }

    return `Khong the tao Heat stack: ${detail}`;
  }

  private async fetchFlavors(computeBaseUrl: string, userToken: string): Promise<FlavorRecord[]> {
    const response = await this.httpClient.get<{ flavors?: Array<Record<string, unknown>> }>(`${computeBaseUrl}/flavors/detail`, {
      headers: { 'X-Auth-Token': userToken },
    });

    const rawFlavors = response.data.flavors ?? [];

    return rawFlavors.map((item) => {
      const name = String(item.name ?? 'unknown');
      const vcpus = Number(item.vcpus ?? 0);
      const ram = Number(item.ram ?? 0);
      const disk = Number(item.disk ?? 0);
      const swap = Number(item.swap ?? 0);
      const isPublic = Boolean(item['os-flavor-access:is_public'] ?? true);
      const description = `${vcpus} vCPU, ${Math.round(ram / 1024)}GB RAM, ${disk}GB Disk`;

      return {
        id: String(item.id ?? name),
        name,
        vcpus,
        ram,
        disk,
        swap,
        isPublic,
        visibility: isPublic ? 'public' : 'private',
        description,
      };
    });
  }

  private async fetchImages(imageBaseUrl: string, userToken: string): Promise<ImageRecord[]> {
    const response = await this.httpClient.get<{ images?: Array<Record<string, unknown>> }>(this.buildImageListUrl(imageBaseUrl), {
      headers: { 'X-Auth-Token': userToken },
      params: {
        sort: 'created_at:desc',
      },
    });

    const rawImages = response.data.images ?? [];

    return rawImages.map((item) => {
      const sizeBytes = Number(item.size ?? 0);

      return {
        id: String(item.id ?? ''),
        name: String(item.name ?? 'unknown'),
        status: String(item.status ?? 'unknown'),
        visibility: String(item.visibility ?? 'private'),
        diskFormat: String(item.disk_format ?? 'unknown'),
        containerFormat: String(item.container_format ?? 'bare'),
        sizeBytes,
        size: this.formatBytes(sizeBytes),
        minDisk: Number(item.min_disk ?? 0),
        minRam: Number(item.min_ram ?? 0),
        createdAt: String(item.created_at ?? ''),
        updatedAt: String(item.updated_at ?? ''),
        owner: item.owner ? String(item.owner) : undefined,
        checksum: item.checksum ? String(item.checksum) : undefined,
        architecture: item['hw_architecture'] ? String(item['hw_architecture']) : undefined,
        osDistro: item['os_distro'] ? String(item['os_distro']) : undefined,
        laasImageType: item['laas_image_type'] ? String(item['laas_image_type']) : undefined,
        vmUsername: item['vmUsername'] ? String(item['vmUsername']) : undefined,
        vmPassword: item['vmPassword'] ? String(item['vmPassword']) : undefined,
        networkType: item['networkType'] ? String(item['networkType']) : undefined,
        networkCidr: item['networkCidr'] ? String(item['networkCidr']) : undefined,
        staticIp: item['staticIp'] ? String(item['staticIp']) : undefined,
      };
    });
  }

  private buildImageListUrl(imageBaseUrl: string): string {
    const normalized = imageBaseUrl.replace(/\/+$/, '');

    if (/\/v2(?:\.\d+)?$/i.test(normalized)) {
      return `${normalized}/images`;
    }

    return `${normalized}/v2/images`;
  }

  private formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    const fractionDigits = value >= 10 || unitIndex === 0 ? 0 : 1;
    return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
  }

  // Catalog endpoint selection with interface preference and safe fallback ordering.
  private getEndpointUrlFromCatalog(catalog: KeystoneCatalogEntry[], serviceType: string): string | null {
    const entry = catalog.find((item) => item.type === serviceType);
    if (!entry) return null;

    const preferredInterface = process.env.OPENSTACK_SERVICE_INTERFACE || 'public';
    const endpoint =
      entry.endpoints.find((item) => item.interface === preferredInterface) ||
      entry.endpoints.find((item) => item.interface === 'public') ||
      entry.endpoints[0];

    if (!endpoint?.url) return null;

    return endpoint.url.replace(/\/+$/, '');
  }

  // Replace tenant/project placeholders in endpoint templates returned by Keystone.
  private resolveProjectScopedEndpoint(endpointUrl: string, projectId: string): string {
    return endpointUrl
      .replace(/%\((tenant_id|project_id)\)s/gi, projectId)
      .replace(/\$\((tenant_id|project_id)\)/gi, projectId)
      .replace(/\/+$/, '');
  }

  // Nova enrichment: fetch server metadata and prebuild SSH quick-connect URL.
  private async fetchServerDetail(
    computeBaseUrl: string,
    userToken: string,
    serverId: string,
    sshOptions?: { sshHost?: string; sshPort?: number; sshUsername?: string }
  ): Promise<StackServerDetail> {
    const response = await this.httpClient.get<{ server?: Record<string, unknown> }>(
      `${computeBaseUrl}/servers/${encodeURIComponent(serverId)}`,
      {
        headers: { 'X-Auth-Token': userToken },
      }
    );

    const rawServer = response.data.server ?? {};
    const addresses = this.extractServerAddresses(rawServer.addresses);
    const floatingIp = addresses.find((item) => item.type === 'floating')?.ip;
    const fixedIp = addresses.find((item) => item.type === 'fixed')?.ip;
    const primaryIp = fixedIp || addresses[0]?.ip;
    const sshHostIp = sshOptions?.sshHost?.trim() || floatingIp || primaryIp;
    const sshPort = sshOptions?.sshPort && Number.isInteger(sshOptions.sshPort)
      ? sshOptions.sshPort
      : 22;
    const defaultUsername = process.env.OPENSTACK_DEFAULT_SSH_USERNAME || 'ubuntu';
    const sshUsername = sshOptions?.sshUsername?.trim() || defaultUsername;

    return {
      id: String(rawServer.id ?? serverId),
      name: String(rawServer.name ?? serverId),
      status: String(rawServer.status ?? ''),
      addresses,
      primaryIp,
      floatingIp,
      sshHost: sshHostIp,
      sshPort,
      sshUsername,
      guacamoleSshUrl: sshHostIp ? this.buildGuacamoleSshUrl(sshHostIp, sshUsername, sshPort) : null,
    };
  }

  // Normalize Nova address payload into a flat [{network, ip, type}] list.
  private extractServerAddresses(rawAddresses: unknown): Array<{
    network: string;
    ip: string;
    version?: number;
    type?: string;
  }> {
    if (!rawAddresses || typeof rawAddresses !== 'object') {
      return [];
    }

    const addresses: Array<{ network: string; ip: string; version?: number; type?: string }> = [];
    const networkEntries = Object.entries(rawAddresses as Record<string, unknown>);
    for (const [network, values] of networkEntries) {
      if (!Array.isArray(values)) {
        continue;
      }

      for (const value of values) {
        if (typeof value === 'string') {
          addresses.push({ network, ip: value });
          continue;
        }

        if (!value || typeof value !== 'object') {
          continue;
        }

        const entry = value as Record<string, unknown>;
        const ip = typeof entry.addr === 'string' ? entry.addr : '';

        if (!ip) {
          continue;
        }

        addresses.push({
          network,
          ip,
          version: typeof entry.version === 'number' ? entry.version : undefined,
          type: typeof entry['OS-EXT-IPS:type'] === 'string' ? String(entry['OS-EXT-IPS:type']) : undefined,
        });
      }
    }

    return addresses;
  }

  // SSH URL generation for UI; supports template override or default quick-connect path.
  private buildGuacamoleSshUrl(host: string, username: string, port = 22): string | null {
    const baseUrl = this.resolveGuacamoleBaseUrl();
    if (!baseUrl) {
      return null;
    }

    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    const resolvedPort = String(port);

    // Direct SSH quick-connect to VM. Username/password are intentionally omitted
    // so Guacamole prompts the user to enter VM credentials from cloud-init.
    void username;

    const params = new URLSearchParams({
      protocol: 'ssh',
      hostname: host,
      port: resolvedPort,
      'font-name': 'monospace',
      'strict-host-key-checking': 'false',
    });

    return `${normalizedBaseUrl}/#/client/quickconnect?${params.toString()}`;
  }

  private parseSshPort(value: unknown): number | undefined {
    const parsed = typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : Number.NaN;

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      return undefined;
    }

    return parsed;
  }

  // Resolve Guacamole base URL for browser-facing URLs.
  // Priority: GUACAMOLE_PUBLIC_URL > GUACAMOLE_BASE_URL > derived from OpenStack identity URL.
  private resolveGuacamoleBaseUrl(): string {
    const publicUrl = (process.env.GUACAMOLE_PUBLIC_URL || '').trim();
    if (publicUrl) {
      return publicUrl;
    }

    const configuredBaseUrl = (process.env.GUACAMOLE_BASE_URL || '').trim();
    if (configuredBaseUrl) {
      return configuredBaseUrl;
    }

    const identityUrl = (process.env.OPENSTACK_IDENTITY_URL || '').trim();
    if (!identityUrl) {
      return '';
    }

    try {
      const parsedIdentity = new URL(identityUrl);
      return `${parsedIdentity.origin}/guacamole`;
    } catch {
      return '';
    }
  }

  // Base Keystone URL used by all identity operations.
  private getIdentityBaseUrl(): string {
    const configured = process.env.OPENSTACK_IDENTITY_URL || 'https://os.openstack.robusta.vn/identity/v3';
    return configured.replace(/\/+$/, '');
  }

  // ─── libguestfs (runs locally on this server) ─────────────────────────────

  private spawnCapture(
    cmd: string,
    args: string[],
    timeoutMs: number,
    extraEnv?: Record<string, string>,
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean; spawnError?: string }> {
    return new Promise((resolve) => {
      const env = extraEnv ? { ...process.env, ...extraEnv } : undefined;
      const proc = spawn(cmd, args, { env });
      let stdout = '', stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) { settled = true; proc.kill('SIGKILL'); resolve({ stdout, stderr, exitCode: null, timedOut: true }); }
      }, timeoutMs);

      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (!settled) { settled = true; clearTimeout(timer); resolve({ stdout, stderr, exitCode: code, timedOut: false }); }
      });
      proc.on('error', (err: Error) => {
        if (!settled) { settled = true; clearTimeout(timer); resolve({ stdout, stderr, exitCode: null, timedOut: false, spawnError: err.message }); }
      });
    });
  }

  // Run virt-inspector on a Glance image (downloaded locally via ensureImageLocal).
  // Result cached to /tmp/laas-virt-cache/{imageId}.xml — base images are immutable,
  // so the same XML is reused across all sessions sharing the same baseImageId.
  async virtInspectImage(imageId: string): Promise<{ success: boolean; xml?: string; message?: string }> {
    const cacheDir = '/tmp/laas-virt-cache';
    const cachePath = join(cacheDir, `${imageId}.xml`);

    if (existsSync(cachePath)) {
      this.logger.log(`[VirtInspect] Cache hit: ${imageId}`);
      return { success: true, xml: readFileSync(cachePath, 'utf8') };
    }

    const local = await this.ensureImageLocal(imageId);
    if (!local.success) return { success: false, message: local.message };

    const r = await this.spawnCapture(
      'virt-inspector', ['--add', local.path],
      90_000,
      { LIBGUESTFS_BACKEND: 'direct' },
    );
    if (r.spawnError) return { success: false, message: 'virt-inspector chưa được cài trên server này (dnf install libguestfs-tools)' };
    if (r.timedOut)   return { success: false, message: 'virt-inspector timeout (>90s)' };
    if (r.exitCode !== 0) return { success: false, message: r.stderr.slice(0, 500) };

    try {
      if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cachePath, r.stdout, 'utf8');
    } catch { /* cache write failure is non-fatal */ }

    return { success: true, xml: r.stdout };
  }

}
