import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { OpenstackService } from './openstack.service';

type CreateHeatStackBody = {
  stackName: string;
  template: string;
  labSessionId?: string;
  parameters?: Record<string, unknown>;
  files?: Record<string, string>;
  environment?: Record<string, unknown>;
  disableRollback?: boolean;
  timeoutMins?: number;
  leaseMinutes?: number;
  floatingIpReserveCount?: number;
  tags?: string | string[];
};

/**
 * Controller layer is intentionally thin:
 * - normalize user identity from query/header
 * - map HTTP payload into service input objects
 * - delegate all orchestration logic to OpenstackService
 */
@Controller('v1/openstack')
export class OpenstackController {
  constructor(private readonly openstackService: OpenstackService) {}

  // POST /api/v1/openstack/stacks
  // Creates a Heat stack in the OpenStack project of the mapped platform user.
  @Post('stacks')
  async createStack(
    @Body() body: CreateHeatStackBody,
    @Query('userId') userIdQuery: string | undefined,
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Headers('x-user-email') userEmailHeader: string | undefined
  ) {
    const platformUserId = userIdQuery?.trim() || userIdHeader?.trim() || 'admin-portal-user';

    return this.openstackService.createHeatStackForPlatformUser({
      platformUserId,
      userEmail: userEmailHeader?.trim() || undefined,
      stackName: body.stackName,
      labSessionId: body.labSessionId,
      template: body.template,
      parameters: body.parameters,
      files: body.files,
      environment: body.environment,
      disableRollback: body.disableRollback,
      timeoutMins: body.timeoutMins,
      leaseMinutes: body.leaseMinutes,
      floatingIpReserveCount: body.floatingIpReserveCount,
      tags: body.tags,
    });
  }

  // DELETE /api/v1/openstack/stacks/:stackName/:stackId
  // Manually terminates a Heat stack and releases any tracked floating-IP lease.
  @Post('stacks/:stackName/:stackId/delete')
  async deleteStack(
    @Param('stackName') stackNameParam: string,
    @Param('stackId') stackIdParam: string,
    @Query('userId') userIdQuery: string | undefined,
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Headers('x-user-email') userEmailHeader: string | undefined
  ) {
    const platformUserId = userIdQuery?.trim() || userIdHeader?.trim() || 'admin-portal-user';

    return this.openstackService.deleteHeatStackForPlatformUser({
      platformUserId,
      userEmail: userEmailHeader?.trim() || undefined,
      stackName: stackNameParam,
      stackId: stackIdParam,
    });
  }

  // POST /api/v1/openstack/stacks/:stackId/cleanup
  // Cleanup endpoint called by lab-service scheduler when session expires.
  @Post('stacks/:stackId/cleanup')
  async cleanupStack(
    @Param('stackId') stackIdParam: string,
    @Query('userId') userIdQuery: string | undefined,
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Headers('x-user-email') userEmailHeader: string | undefined
  ) {
    const platformUserId = userIdQuery?.trim() || userIdHeader?.trim() || 'admin-portal-user';

    return this.openstackService.cleanupHeatStackForPlatformUser({
      platformUserId,
      userEmail: userEmailHeader?.trim() || undefined,
      stackId: stackIdParam,
    });
  }

  // GET /api/v1/openstack/stacks/:stackName/:stackId/resources
  // Returns stack/resource status and enriched VM info (IP + SSH URL).
  @Get('stacks/:stackName/:stackId/resources')
  async getStackResources(
    @Param('stackName') stackNameParam: string,
    @Param('stackId') stackIdParam: string,
    @Query('userId') userIdQuery: string | undefined,
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Headers('x-user-email') userEmailHeader: string | undefined
  ) {
    const platformUserId = userIdQuery?.trim() || userIdHeader?.trim() || 'admin-portal-user';
    const stackName = stackNameParam?.trim() || '';
    const stackId = stackIdParam?.trim() || '';

    return this.openstackService.getHeatStackResourcesForPlatformUser({
      platformUserId,
      userEmail: userEmailHeader?.trim() || undefined,
      stackName,
      stackId,
    });
  }

  // POST /api/v1/openstack/stacks/:stackName/:stackId/setup-nat
  // Called after the stack reaches CREATE_COMPLETE to configure Neutron port forwardings
  // so all VMs are accessible via SSH through a single shared floating IP.
  @Post('stacks/:stackName/:stackId/setup-nat')
  async setupNat(
    @Param('stackName') stackNameParam: string,
    @Param('stackId') stackIdParam: string,
    @Query('userId') userIdQuery: string | undefined,
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Headers('x-user-email') userEmailHeader: string | undefined
  ) {
    const platformUserId = userIdQuery?.trim() || userIdHeader?.trim() || 'admin-portal-user';
    const stackName = stackNameParam?.trim() || '';
    const stackId = stackIdParam?.trim() || '';

    return this.openstackService.setupSshNatPortForwardings({
      platformUserId,
      userEmail: userEmailHeader?.trim() || undefined,
      stackName,
      stackId,
    });
  }

  // GET /api/v1/openstack/flavors
  // Lists compute flavors visible to the mapped OpenStack project.
  @Get('flavors')
  async getFlavors(
    @Query('userId') userIdQuery: string | undefined,
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Headers('x-user-email') userEmailHeader: string | undefined
  ) {
    const platformUserId = userIdQuery?.trim() || userIdHeader?.trim() || 'admin-portal-user';

    return this.openstackService.getFlavorsForPlatformUser({
      platformUserId,
      userEmail: userEmailHeader?.trim() || undefined,
    });
  }

  // POST /api/v1/openstack/servers/:serverId/stop
  // Sends os-stop action to a Nova server (graceful shutdown).
  @Post('servers/:serverId/stop')
  async stopServer(@Param('serverId') serverId: string) {
    return this.openstackService.stopServerById(serverId);
  }

  // DELETE /api/v1/openstack/servers/:serverId
  // Hard-deletes a Nova server. If the server's boot volume has delete_on_termination=false,
  // the volume is NOT deleted and transitions to 'available' (ready for upload-to-image).
  @Delete('servers/:serverId')
  async deleteServer(@Param('serverId') serverId: string) {
    return this.openstackService.deleteServerById(serverId);
  }

  // DELETE /api/v1/openstack/volumes/:volumeId
  // Deletes a Cinder volume. Only call when the volume is 'available' (not in-use).
  @Delete('volumes/:volumeId')
  async deleteVolume(@Param('volumeId') volumeId: string) {
    return this.openstackService.deleteVolumeById(volumeId);
  }

  // DELETE /api/v1/openstack/servers/:serverId/volumes/:volumeId
  // Detaches a Cinder volume from a Nova server so it transitions to 'available'.
  @Delete('servers/:serverId/volumes/:volumeId')
  async detachVolume(
    @Param('serverId') serverId: string,
    @Param('volumeId') volumeId: string,
  ) {
    return this.openstackService.detachVolumeFromServer(serverId, volumeId);
  }

  // GET /api/v1/openstack/volumes/:volumeId/status
  // Returns the current Cinder volume status ('available', 'in-use', 'error', …).
  @Get('volumes/:volumeId/status')
  async getVolumeStatus(@Param('volumeId') volumeId: string) {
    return this.openstackService.getVolumeStatus(volumeId);
  }

  // GET /api/v1/openstack/servers/:serverId/status
  // Returns the current Nova server power status ('ACTIVE', 'SHUTOFF', 'ERROR', …).
  @Get('servers/:serverId/status')
  async getServerStatus(@Param('serverId') serverId: string) {
    return this.openstackService.getServerStatusById(serverId);
  }

  // POST /api/v1/openstack/volumes/:volumeId/clone
  // Clones a Cinder volume to a new volume.
  @Post('volumes/:volumeId/clone')
  async cloneVolume(
    @Param('volumeId') volumeId: string,
    @Body() body: { cloneName: string },
  ) {
    return this.openstackService.cloneVolume(volumeId, body.cloneName);
  }

  // POST /api/v1/openstack/volumes/:volumeId/upload-image
  // Uploads a Cinder volume directly to Glance (golden-image / image-create workflow).
  @Post('volumes/:volumeId/upload-image')
  async uploadVolumeToImage(
    @Param('volumeId') volumeId: string,
    @Body() body: { imageName: string; diskFormat?: string; force?: boolean; metadata?: Record<string, string> },
  ) {
    return this.openstackService.uploadVolumeToGlance({
      volumeId,
      imageName: body.imageName,
      diskFormat: body.diskFormat,
      force: body.force,
      metadata: body.metadata,
    });
  }

  // POST /api/v1/openstack/servers/:serverId/snapshot
  // Takes a snapshot (image) of a specific Nova server instance
  @Post('servers/:serverId/snapshot')
  async createServerSnapshot(
    @Param('serverId') serverIdParam: string,
    @Body() body: { imageName: string; metadata?: Record<string, string> },
    @Query('userId') userIdQuery: string | undefined,
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Headers('x-user-email') userEmailHeader: string | undefined
  ) {
    const platformUserId = userIdQuery?.trim() || userIdHeader?.trim() || 'admin-portal-user';

    return this.openstackService.createSnapshotForPlatformUser({
      platformUserId,
      userEmail: userEmailHeader?.trim() || undefined,
      serverId: serverIdParam,
      imageName: body.imageName,
      metadata: body.metadata,
    });
  }

  // GET /api/v1/openstack/hypervisors
  // Lists Nova compute hypervisors with resource stats (admin-only, uses env credentials).
  @Get('hypervisors')
  async getHypervisors() {
    return this.openstackService.getHypervisorStats();
  }

  // GET /api/v1/openstack/volume-limits
  // Returns Cinder block-storage volume usage limits (admin-only, uses env credentials).
  @Get('volume-limits')
  async getVolumeLimits() {
    return this.openstackService.getVolumeLimits();
  }

  // GET /api/v1/openstack/images/:imageId/status
  // Returns the Glance status of a single image (queued / saving / active / killed).
  @Get('images/:imageId/status')
  async getImageStatus(@Param('imageId') imageId: string) {
    return this.openstackService.getImageStatusById(imageId);
  }

  // GET /api/v1/openstack/images/by-server/:serverId
  // Finds the most recent snapshot image whose instance_uuid matches the given Nova server ID.
  @Get('images/by-server/:serverId')
  async getImageByServer(@Param('serverId') serverId: string) {
    return this.openstackService.findImageByServerId(serverId);
  }

  // DELETE /api/v1/openstack/images/:imageId
  @Delete('images/:imageId')
  async deleteImage(@Param('imageId') imageId: string) {
    return this.openstackService.deleteImageById(imageId);
  }

  // PATCH /api/v1/openstack/images/:imageId/visibility
  @Patch('images/:imageId/visibility')
  async updateImageVisibility(
    @Param('imageId') imageId: string,
    @Body() body: { visibility: string },
  ) {
    return this.openstackService.updateImageVisibilityById(imageId, body.visibility);
  }

  // GET /api/v1/openstack/images/:imageId/ensure-local
  // Downloads a Glance image to /tmp/laas-images/ cache on this host and returns the local path.
  // Both lab-service and orchestration-service run on the same host, so the path is usable by both.
  @Get('images/:imageId/ensure-local')
  async ensureImageLocal(@Param('imageId') imageId: string) {
    return this.openstackService.ensureImageLocal(imageId);
  }

  // GET /api/v1/openstack/images/:imageId/virt-inspect
  // Downloads the Glance image locally then runs virt-inspector on this server.
  // Result is cached to /tmp/laas-virt-cache/{imageId}.xml (base images are immutable).
  // Requires: libguestfs-tools installed on this host (dnf install -y libguestfs-tools).
  @Get('images/:imageId/virt-inspect')
  async virtInspectImage(@Param('imageId') imageId: string) {
    return this.openstackService.virtInspectImage(imageId);
  }

  // GET /api/v1/openstack/images
  // Lists glance images visible to the mapped OpenStack project.
  @Get('images')
  async getImages(
    @Query('userId') userIdQuery: string | undefined,
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Headers('x-user-email') userEmailHeader: string | undefined
  ) {
    const platformUserId = userIdQuery?.trim() || userIdHeader?.trim() || 'admin-portal-user';

    return this.openstackService.getImagesForPlatformUser({
      platformUserId,
      userEmail: userEmailHeader?.trim() || undefined,
    });
  }
}
