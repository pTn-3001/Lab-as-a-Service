import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mkdir, rm, writeFile } from "fs/promises";
import * as path from "path";
import axios from "axios";
import {
  ArtifactScope,
  ArtifactType,
  Prisma,
  ValidationStatus,
} from "../../generated/prisma-client";
import { PrismaService } from "../prisma/prisma.service";

type NetworkZone = {
  id: string;
  name: string;
  cidr: string;
  gateway?: string;
  dhcpStart?: string;
  dhcpEnd?: string;
  dnsServers?: string[];
  hasInternet?: boolean;
  connectedZoneIds?: string[];
};

type VmConfig = {
  id: string;
  nodeName: string;
  zoneId: string;
  zoneIds?: string[];
  networkType?: "dhcp" | "static";
  staticIp?: string;
  operatingSystem?: string;
  flavor?: string;
  volumeSizeGb?: number;
  initialUsername?: string;
  initialPassword?: string;
  ansibleRepoUrl?: string;
  command?: string;
};

type CheckpointDef = {
  id: string;
  name: string;
  description?: string;
  points?: number;
  vmId?: string;
  checkScript?: string;
};

type ModuleDefinition = {
  networkZones?: NetworkZone[];
  vmConfigs?: VmConfig[];
  checkpoints?: CheckpointDef[];
  scripts?: {
    init?: string;
    postDeploy?: string;
    validation?: string;
  };
};

type LoadedModule = {
  id: string;
  name: string;
  orderNo: number;
  estimatedMinutes: number | null;
  objectives: Prisma.JsonValue;
  validationStatus: ValidationStatus;
  definitionJson: Prisma.JsonValue;
};

/**
 * Artifact generation service.
 *
 * It converts lab/module JSON definitions into concrete artifacts:
 * - lab-definition JSON
 * - Heat templates (YAML)
 * - cloud-init scripts (YAML)
 *
 * Artifacts are written to filesystem and mirrored in DB for API retrieval.
 */
@Injectable()
export class ArtifactGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // Full regeneration pipeline for one lab template.
  async regenerateForLab(labTemplateId: string) {
    const lab = await this.prisma.labTemplate.findFirst({
      where: { id: labTemplateId, deletedAt: null },
      select: {
        id: true,
        code: true,
        slug: true,
        name: true,
        description: true,
        category: true,
        difficulty: true,
        status: true,
        version: true,
        tags: true,
      },
    });

    if (!lab) {
      throw new NotFoundException(`Lab template "${labTemplateId}" not found`);
    }

    const modules = await this.prisma.module.findMany({
      where: { labTemplateId, deletedAt: null },
      orderBy: { orderNo: "asc" },
      select: {
        id: true,
        name: true,
        orderNo: true,
        estimatedMinutes: true,
        objectives: true,
        validationStatus: true,
        definitionJson: true,
      },
    });

    const records: Prisma.ArtifactCreateManyInput[] = [];
    const generatedAt = new Date().toISOString();
    const outputDir = path.join(this.getOutputRootDir(), labTemplateId);

    await this.resetOutputDir(outputDir);

    const labDefinition = {
      version: "1.0",
      generatedAt,
      lab: {
        id: lab.id,
        code: lab.code,
        slug: lab.slug,
        name: lab.name,
        description: lab.description,
        category: lab.category,
        difficulty: lab.difficulty,
        status: lab.status,
        revision: lab.version,
        tags: lab.tags,
      },
      modules: modules.map((mod) => {
        const definition = this.toModuleDefinition(mod.definitionJson);
        return {
          id: mod.id,
          name: mod.name,
          orderNo: mod.orderNo,
          estimatedMinutes: mod.estimatedMinutes,
          objectives: mod.objectives,
          validationStatus: mod.validationStatus,
          vmCount: definition.vmConfigs.length,
          networkCount: definition.networkZones.length,
          definitionJson: mod.definitionJson,
          artifacts: {
            heatTemplate: this.buildHeatFileName(mod),
            cloudInitFiles: definition.vmConfigs.map((vm) =>
              this.buildCloudInitFileName(mod, vm),
            ),
          },
        };
      }),
    };

    const labDefinitionFileName = this.buildLabDefinitionFileName(lab.code);
    records.push({
      labTemplateId,
      moduleId: null,
      type: ArtifactType.LAB_DEFINITION_JSON,
      scope: ArtifactScope.LAB,
      fileName: labDefinitionFileName,
      contentText: JSON.stringify(labDefinition, null, 2),
      storageUrl: this.toStoragePath(outputDir, labDefinitionFileName),
      metadata: {
        format: "json",
        generatedAt,
      },
    });

    // Collect all image IDs referenced by VMs across all modules, then check
    // which are custom-built images so we can skip cloud-init for those VMs.
    const allImageIds = new Set<string>();
    for (const mod of modules) {
      const def = this.toModuleDefinition(mod.definitionJson);
      for (const vm of def.vmConfigs) {
        if (vm.operatingSystem) allImageIds.add(vm.operatingSystem);
      }
    }
    const customImageIds = new Set<string>();
    const customImagesMap = new Map<
      string,
      { username: string; password?: string }
    >();
    if (allImageIds.size > 0) {
      try {
        const orchestrationUrl =
          this.configService.get<string>("ORCHESTRATION_SERVICE_URL") ||
          process.env.ORCHESTRATION_SERVICE_URL ||
          "http://localhost:3004/api";
        const response = await axios.get(
          `${orchestrationUrl}/v1/openstack/images?userId=admin-portal-user`,
          { timeout: 10000 },
        );
        const glanceImages = response.data?.data?.images || [];
        for (const img of glanceImages) {
          if (img.laasImageType === "custom") {
            const info = {
              username: img.vmUsername || "labuser",
              password: img.vmPassword || undefined,
            };
            if (img.id) {
              customImageIds.add(img.id);
              customImagesMap.set(img.id, info);
            }
            if (img.name) {
              customImageIds.add(img.name);
              customImagesMap.set(img.name, info);
            }
          }
        }
      } catch (e) {
        // Fallback to database
        const customSessions = await this.prisma.imageBuildSession.findMany({
          where: {
            OR: [
              { glanceImageId: { in: Array.from(allImageIds) } },
              { targetImageName: { in: Array.from(allImageIds) } },
              { pendingImageName: { in: Array.from(allImageIds) } },
            ],
            status: "COMPLETED",
          },
          select: {
            glanceImageId: true,
            targetImageName: true,
            pendingImageName: true,
            vmUsername: true,
            vmPassword: true,
          },
        });
        for (const s of customSessions) {
          const info = {
            username: s.vmUsername || "labuser",
            password: s.vmPassword || undefined,
          };
          if (s.glanceImageId) {
            customImageIds.add(s.glanceImageId);
            customImagesMap.set(s.glanceImageId, info);
          }
          if (s.targetImageName) {
            customImageIds.add(s.targetImageName);
            customImagesMap.set(s.targetImageName, info);
          }
          if (s.pendingImageName) {
            customImageIds.add(s.pendingImageName);
            customImagesMap.set(s.pendingImageName, info);
          }
        }
      }
    }

    for (const mod of modules) {
      records.push(
        ...this.generateModuleArtifacts(
          labTemplateId,
          outputDir,
          mod,
          customImageIds,
          customImagesMap,
        ),
      );
    }

    await this.writeFiles(records);

    await this.prisma.$transaction(async (tx) => {
      await tx.artifact.deleteMany({
        where: {
          labTemplateId,
          type: {
            in: [
              ArtifactType.LAB_DEFINITION_JSON,
              ArtifactType.HEAT_TEMPLATE,
              ArtifactType.CLOUD_INIT,
            ],
          },
        },
      });

      if (records.length > 0) {
        await tx.artifact.createMany({ data: records });
      }
    });
  }

  // Remove both DB metadata and generated artifact files for a lab.
  async clearLabArtifacts(labTemplateId: string) {
    await this.prisma.artifact.deleteMany({ where: { labTemplateId } });
    await rm(path.join(this.getOutputRootDir(), labTemplateId), {
      recursive: true,
      force: true,
    });
  }

  private generateModuleArtifacts(
    labTemplateId: string,
    outputDir: string,
    mod: LoadedModule,
    customImageIds: Set<string> = new Set(),
    customImagesMap: Map<
      string,
      { username: string; password?: string }
    > = new Map(),
  ): Prisma.ArtifactCreateManyInput[] {
    // For each module, generate one Heat template + N cloud-init files (N = VM count).
    const definition = this.toModuleDefinition(mod.definitionJson);
    this.validateModuleNetworkPlanning(mod, definition);
    const rows: Prisma.ArtifactCreateManyInput[] = [];
    const moduleFolder = this.buildModuleFolder(mod);
    const heatFileName = `${moduleFolder}/${this.buildHeatFileName(mod)}`;

    rows.push({
      labTemplateId,
      moduleId: mod.id,
      type: ArtifactType.HEAT_TEMPLATE,
      scope: ArtifactScope.MODULE,
      fileName: heatFileName,
      contentText: this.renderHeatTemplate(
        mod,
        definition,
        customImageIds,
        customImagesMap,
      ),
      storageUrl: this.toStoragePath(outputDir, heatFileName),
      metadata: {
        format: "yaml",
        moduleName: mod.name,
      },
    });

    for (const vm of definition.vmConfigs) {
      const cloudInitFileName = `${moduleFolder}/${this.buildCloudInitFileName(mod, vm)}`;
      rows.push({
        labTemplateId,
        moduleId: mod.id,
        type: ArtifactType.CLOUD_INIT,
        scope: ArtifactScope.NODE,
        nodeName: vm.nodeName,
        fileName: cloudInitFileName,
        contentText: this.renderCloudInit(
          definition,
          vm,
          customImagesMap.get(vm.operatingSystem || ""),
        ),
        storageUrl: this.toStoragePath(outputDir, cloudInitFileName),
        metadata: {
          format: "yaml",
          vmName: vm.nodeName,
          zoneId: vm.zoneId,
        },
      });
    }

    return rows;
  }

  private validateModuleNetworkPlanning(
    mod: LoadedModule,
    definition: Required<ModuleDefinition>,
  ) {
    const zoneById = new Map(
      definition.networkZones.map((zone) => [zone.id, zone]),
    );

    for (const vm of definition.vmConfigs) {
      const selectedZoneIds = Array.from(
        new Set(
          (Array.isArray(vm.zoneIds) ? vm.zoneIds : [vm.zoneId]).filter(
            Boolean,
          ),
        ),
      );
      const zones = selectedZoneIds
        .map((zoneId) => zoneById.get(zoneId))
        .filter((zone): zone is NetworkZone => Boolean(zone));

      if (zones.length === 0) {
        continue;
      }

      if (vm.networkType === "dhcp") {
        const zoneWithoutPool = zones.find(
          (zone) => !(zone.dhcpStart?.trim() && zone.dhcpEnd?.trim()),
        );
        if (zoneWithoutPool) {
          throw new Error(
            `Module ${mod.name}: VM ${vm.nodeName || vm.id} dung DHCP nhung zone ${zoneWithoutPool.name || zoneWithoutPool.id} chua co DHCP start-end`,
          );
        }
      }

      if (vm.networkType === "static" && vm.staticIp?.trim()) {
        for (const zone of zones) {
          if (!zone.dhcpStart?.trim() || !zone.dhcpEnd?.trim()) {
            continue;
          }

          if (
            this.isIpInRange(
              vm.staticIp.trim(),
              zone.dhcpStart.trim(),
              zone.dhcpEnd.trim(),
            )
          ) {
            throw new Error(
              `Module ${mod.name}: static IP ${vm.staticIp} cua VM ${vm.nodeName || vm.id} nam trong DHCP range ${zone.dhcpStart}-${zone.dhcpEnd} cua zone ${zone.name || zone.id}`,
            );
          }
        }
      }
    }
  }

  private isIpInRange(ip: string, start: string, end: string): boolean {
    const ipNum = this.ipv4ToNumber(ip);
    const startNum = this.ipv4ToNumber(start);
    const endNum = this.ipv4ToNumber(end);

    if (ipNum === null || startNum === null || endNum === null) {
      return false;
    }

    const min = Math.min(startNum, endNum);
    const max = Math.max(startNum, endNum);
    return ipNum >= min && ipNum <= max;
  }

  private ipv4ToNumber(ip: string): number | null {
    const parts = ip.trim().split(".");
    if (parts.length !== 4) {
      return null;
    }

    const octets = parts.map((part) => Number(part));
    if (
      octets.some(
        (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
      )
    ) {
      return null;
    }

    return (
      ((octets[0] << 24) >>> 0) +
      ((octets[1] << 16) >>> 0) +
      ((octets[2] << 8) >>> 0) +
      octets[3]
    );
  }

  // Persist rendered text artifacts to disk paths referenced by storageUrl.
  private async writeFiles(records: Prisma.ArtifactCreateManyInput[]) {
    for (const record of records) {
      if (!record.storageUrl || typeof record.contentText !== "string") {
        continue;
      }

      const targetPath = record.storageUrl;
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, record.contentText, "utf8");
    }
  }

  // Clean old output to avoid stale files from previous render versions.
  private async resetOutputDir(outputDir: string) {
    await rm(outputDir, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });
  }

  // Output directory can be overridden by env for deployment flexibility.
  private getOutputRootDir(): string {
    const configured = this.configService
      .get<string>("LAB_ARTIFACT_OUTPUT_DIR")
      ?.trim();
    if (configured) {
      return path.resolve(configured);
    }

    return path.resolve(process.cwd(), "local-artifacts", "lab-service");
  }

  private buildModuleFolder(mod: { orderNo: number; name: string }): string {
    return `modules/module-${mod.orderNo}-${this.toResourceName(mod.name)}`;
  }

  private toStoragePath(baseDir: string, fileName: string): string {
    return path.join(baseDir, ...fileName.split("/"));
  }

  private toModuleDefinition(
    rawDefinition: Prisma.JsonValue,
  ): Required<ModuleDefinition> {
    // Normalize potentially sparse JSON into arrays to simplify render logic.
    const definition =
      rawDefinition &&
      typeof rawDefinition === "object" &&
      !Array.isArray(rawDefinition)
        ? (rawDefinition as ModuleDefinition)
        : {};

    const networkZones = Array.isArray(definition.networkZones)
      ? definition.networkZones
      : [];
    const vmConfigs = Array.isArray(definition.vmConfigs)
      ? definition.vmConfigs
      : [];
    const checkpoints = Array.isArray(definition.checkpoints)
      ? definition.checkpoints
      : [];

    return {
      networkZones,
      vmConfigs,
      checkpoints,
      scripts: definition.scripts ?? {},
    };
  }

  // Render OpenStack Heat template from module networking/VM model.
  private renderHeatTemplate(
    mod: LoadedModule,
    definition: Required<ModuleDefinition>,
    customImageIds: Set<string> = new Set(),
    customImagesMap: Map<
      string,
      { username: string; password?: string }
    > = new Map(),
  ): string {
    const zones =
      definition.networkZones.length > 0
        ? definition.networkZones
        : [
            {
              id: "default-zone",
              name: "tenant-net",
              cidr: "10.10.0.0/24",
              gateway: "10.10.0.1",
              hasInternet: true,
            },
          ];

    const vms = definition.vmConfigs;
    const zoneById = new Map<string, NetworkZone>(zones.map((z) => [z.id, z]));
    const zoneIndexMap = new Map<string, number>(
      zones.map((z, idx) => [z.id, idx]),
    );
    const getZoneAlias = (z: NetworkZone) => {
      const idx = zoneIndexMap.get(z.id) ?? 0;
      return this.toResourceName(z.name || `zone-${idx + 1}`);
    };
    const sharedRouterId =
      this.configService.get<string>("OPENSTACK_SHARED_ROUTER_ID")?.trim() ??
      "";
    const configuredNatStartPort = Number(
      this.configService.get<string>("OPENSTACK_SSH_NAT_START_PORT") ?? "2201",
    );
    const sshNatStartPort =
      Number.isInteger(configuredNatStartPort) &&
      configuredNatStartPort >= 1024 &&
      configuredNatStartPort <= 65000
        ? configuredNatStartPort
        : 2201;
    const configuredTtydNatStartPort = Number(
      this.configService.get<string>("OPENSTACK_TTYD_NAT_START_PORT") ?? "9001",
    );
    const ttydNatStartPort =
      Number.isInteger(configuredTtydNatStartPort) &&
      configuredTtydNatStartPort >= 1024 &&
      configuredTtydNatStartPort <= 65000
        ? configuredTtydNatStartPort
        : 9001;
    // Restrict ttyd (7681) access to the proxy server IP only (e.g. 192.168.2.250/32).
    // Defaults to 0.0.0.0/0 if not set; set OPENSTACK_TTYD_PROXY_SOURCE_IP in production.
    const ttydProxySourceIp =
      this.configService
        .get<string>("OPENSTACK_TTYD_PROXY_SOURCE_IP")
        ?.trim() || "0.0.0.0/0";
    // FloatingIPPortForwarding requires OpenStack Wallaby+ (2021-10)
    // Disable for older OpenStack versions by default (set OPENSTACK_ENABLE_PORT_FORWARDING=true for Wallaby+)
    const enablePortForwarding =
      this.configService
        .get<string>("OPENSTACK_ENABLE_PORT_FORWARDING")
        ?.toLowerCase() === "true";

    const lines: string[] = [];
    lines.push("heat_template_version: 2018-08-31");
    lines.push("");
    lines.push(
      `description: Auto-generated template for module ${this.escapeYaml(mod.name)}`,
    );
    lines.push("");
    lines.push("parameters:");
    lines.push("  provider_network:");
    lines.push("    type: string");
    lines.push("    default: provider-net");
    lines.push("  shared_router_id:");
    lines.push("    type: string");
    lines.push(`    default: ${this.escapeYaml(sharedRouterId)}`);
    lines.push("  session_id:");
    lines.push("    type: string");
    lines.push('    default: ""');
    lines.push("  laas_api_url:");
    lines.push("    type: string");
    lines.push('    default: ""');

    lines.push("conditions:");
    lines.push("  create_router:");
    lines.push("    equals:");
    lines.push("      - { get_param: shared_router_id }");
    lines.push('      - ""');
    lines.push("");

    lines.push("");
    lines.push("resources:");

    zones.forEach((zone, idx) => {
      const zoneAlias = getZoneAlias(zone);
      const zoneName = zone.name || `tenant-net-${idx + 1}`;

      lines.push(`  ${zoneAlias}_network:`);
      lines.push("    type: OS::Neutron::Net");
      lines.push("    properties:");
      lines.push("      name:");
      lines.push("        str_replace:");
      lines.push("          template: \"%zone%-%stack%\"");
      lines.push("          params:");
      lines.push(`            \"%zone%\": ${this.escapeYaml(zoneName)}`);
      lines.push("            \"%stack%\": { get_param: \"OS::stack_name\" }");
      lines.push("");
      lines.push(`  ${zoneAlias}_subnet:`);
      lines.push("    type: OS::Neutron::Subnet");
      lines.push("    properties:");
      lines.push("      name:");
      lines.push("        str_replace:");
      lines.push("          template: \"%zone%-subnet-%stack%\"");
      lines.push("          params:");
      lines.push(`            \"%zone%\": ${this.escapeYaml(zoneName)}`);
      lines.push("            \"%stack%\": { get_param: \"OS::stack_name\" }");
      lines.push(`      network: { get_resource: ${zoneAlias}_network }`);
      lines.push(`      cidr: ${zone.cidr || `10.10.${idx}.0/24`}`);
      lines.push(`      gateway_ip: ${zone.gateway || `10.10.${idx}.1`}`);
      const zoneDnsServers = (
        Array.isArray(zone.dnsServers) ? zone.dnsServers : []
      )
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 5);
      const dnsServers =
        zoneDnsServers.length > 0 ? zoneDnsServers : ["8.8.8.8", "1.1.1.1"];
      lines.push(`      dns_nameservers: [${dnsServers.join(", ")}]`);
      if (zone.dhcpStart?.trim() && zone.dhcpEnd?.trim()) {
        lines.push("      allocation_pools:");
        lines.push(`        - start: ${zone.dhcpStart.trim()}`);
        lines.push(`          end: ${zone.dhcpEnd.trim()}`);
      }
      lines.push("");

      lines.push(`  ${zoneAlias}_router_interface:`);
      lines.push("    type: OS::Neutron::RouterInterface");
      lines.push("    properties:");
      lines.push("      router_id: { get_resource: module_router }");
      lines.push(`      subnet: { get_resource: ${zoneAlias}_subnet }`);
      lines.push("");
    });

    lines.push("  module_router:");
    lines.push("    type: OS::Neutron::Router");
    lines.push("    properties:");
    lines.push("      name:");
    lines.push("        str_replace:");
    lines.push("          template: \"router-%stack%\"");
    lines.push("          params:");
    lines.push("            \"%stack%\": { get_param: \"OS::stack_name\" }");
    lines.push("      external_gateway_info:");
    lines.push("        network: { get_param: provider_network }");
    lines.push("");

    // Generate a Security Group for each Network Zone (with custom ingress/egress based on internet & connection configuration)
    zones.forEach((zone, idx) => {
      const zoneAlias = getZoneAlias(zone);
      const secGroupAlias = `secgroup_${zoneAlias}`;

      lines.push(`  ${secGroupAlias}:`);
      lines.push("    type: OS::Neutron::SecurityGroup");
      lines.push("    properties:");
      lines.push("      name:");
      lines.push("        str_replace:");
      lines.push("          template: \"secgroup-%zone%-%stack%\"");
      lines.push("          params:");
      lines.push(`            \"%zone%\": ${this.escapeYaml(zoneAlias)}`);
      lines.push("            \"%stack%\": { get_param: \"OS::stack_name\" }");
      lines.push("      rules:");

      // Default Ingress for SSH and Ttyd
      lines.push("        - direction: ingress");
      lines.push("          ethertype: IPv4");
      lines.push("          protocol: tcp");
      lines.push("          port_range_min: 22");
      lines.push("          port_range_max: 22");
      lines.push("          remote_ip_prefix: 0.0.0.0/0");
      lines.push("        - direction: ingress");
      lines.push("          ethertype: IPv4");
      lines.push("          protocol: tcp");
      lines.push("          port_range_min: 7681");
      lines.push("          port_range_max: 7681");
      lines.push(`          remote_ip_prefix: ${ttydProxySourceIp}`);

      // Allow Ingress from same zone's CIDR (local communication)
      if (zone.cidr?.trim()) {
        lines.push("        - direction: ingress");
        lines.push("          ethertype: IPv4");
        lines.push(`          remote_ip_prefix: ${zone.cidr.trim()}`);
      }

      // Allow Ingress from other zones that connect to this zone
      zones.forEach((otherZone) => {
        if (otherZone.id !== zone.id && otherZone.cidr?.trim()) {
          const otherConnectedZoneIds = Array.isArray(
            otherZone.connectedZoneIds,
          )
            ? otherZone.connectedZoneIds
            : [];
          if (otherConnectedZoneIds.includes(zone.id)) {
            lines.push("        - direction: ingress");
            lines.push("          ethertype: IPv4");
            lines.push(`          remote_ip_prefix: ${otherZone.cidr.trim()}`);
          }
        }
      });

      // Egress Rules
      if (zone.hasInternet !== false) {
        // Egress to all (internet enabled)
        lines.push("        - direction: egress");
        lines.push("          ethertype: IPv4");
        lines.push("          remote_ip_prefix: 0.0.0.0/0");
        lines.push("        - direction: egress");
        lines.push("          ethertype: IPv6");
        lines.push("          remote_ip_prefix: ::/0");
      } else {
        // Egress to own zone CIDR (local communication)
        if (zone.cidr?.trim()) {
          lines.push("        - direction: egress");
          lines.push("          ethertype: IPv4");
          lines.push(`          remote_ip_prefix: ${zone.cidr.trim()}`);
        }

        // Egress to connected zones CIDRs
        const connectedIds = Array.isArray(zone.connectedZoneIds)
          ? zone.connectedZoneIds
          : [];
        connectedIds.forEach((targetZoneId) => {
          const targetZone = zoneById.get(targetZoneId);
          if (targetZone && targetZone.cidr?.trim()) {
            lines.push("        - direction: egress");
            lines.push("          ethertype: IPv4");
            lines.push(`          remote_ip_prefix: ${targetZone.cidr.trim()}`);
          }
        });

        // Always allow egress to the Portal API IP/subnet so checkpoints can signal the portal
        const portalUrl = (
          process.env.LAAS_PUBLIC_URL ||
          this.configService.get<string>("LAAS_PORTAL_API_URL") ||
          ""
        ).trim();
        let portalIp = "";
        try {
          if (portalUrl) {
            const parsed = new URL(portalUrl);
            portalIp = parsed.hostname;
          }
        } catch {}

        if (portalIp) {
          if (/^[0-9.]+$/.test(portalIp)) {
            lines.push("        - direction: egress");
            lines.push("          ethertype: IPv4");
            lines.push(`          remote_ip_prefix: ${portalIp}/32`);
          } else {
            let portalPort = 3000;
            try {
              if (portalUrl) {
                const parsed = new URL(portalUrl);
                portalPort = parsed.port
                  ? Number(parsed.port)
                  : parsed.protocol === "https:"
                    ? 443
                    : 80;
              }
            } catch {}

            // Allow DNS resolution (port 53 UDP)
            lines.push("        - direction: egress");
            lines.push("          ethertype: IPv4");
            lines.push("          protocol: udp");
            lines.push("          port_range_min: 53");
            lines.push("          port_range_max: 53");
            lines.push("          remote_ip_prefix: 0.0.0.0/0");

            // Allow TCP egress to portal port
            lines.push("        - direction: egress");
            lines.push("          ethertype: IPv4");
            lines.push("          protocol: tcp");
            lines.push(`          port_range_min: ${portalPort}`);
            lines.push(`          port_range_max: ${portalPort}`);
            lines.push("          remote_ip_prefix: 0.0.0.0/0");
          }
        }
      }

      lines.push("");
    });

    vms.forEach((vm, idx) => {
      const vmName = vm.nodeName || `vm-${idx + 1}`;
      const vmAlias = this.toResourceName(vmName);
      const selectedZoneIds = Array.from(
        new Set(
          (Array.isArray(vm.zoneIds) ? vm.zoneIds : [vm.zoneId]).filter(
            Boolean,
          ),
        ),
      );
      const vmZones = selectedZoneIds
        .map((zoneId) => zoneById.get(zoneId))
        .filter((zone): zone is NetworkZone => Boolean(zone));
      const resolvedVmZones = vmZones.length > 0 ? vmZones : [zones[0]];
      const zoneAliases = resolvedVmZones.map((zone) => getZoneAlias(zone));
      const vmPortAliases = zoneAliases.map(
        (zoneAlias) => `${vmAlias}_${zoneAlias}_port`,
      );

      vmPortAliases.forEach((vmPortAlias, zoneIndex) => {
        const zoneAlias = zoneAliases[zoneIndex];
        const zone = resolvedVmZones[zoneIndex];
        const secGroupRef = `secgroup_${zoneAlias}`;

        lines.push(`  ${vmPortAlias}:`);
        lines.push("    type: OS::Neutron::Port");
        lines.push("    depends_on:");
        lines.push(`      - ${zoneAlias}_subnet`);
        lines.push("    properties:");
        lines.push(`      network: { get_resource: ${zoneAlias}_network }`);
        lines.push(`      security_groups: [{ get_resource: ${secGroupRef} }]`);
        if (vm.networkType === "static" && vm.staticIp && zoneIndex === 0) {
          lines.push("      fixed_ips:");
          lines.push(`        - subnet: { get_resource: ${zoneAlias}_subnet }`);
          lines.push(`          ip_address: ${vm.staticIp}`);
        }
        lines.push("");
      });

      const isCustomImage = customImageIds.has(vm.operatingSystem || "");

      // Create a Cinder volume explicitly so we can set the exact size (regular images only).
      if (!isCustomImage) {
        lines.push(`  ${vmAlias}_volume:`);
        lines.push("    type: OS::Cinder::Volume");
        lines.push("    properties:");
        lines.push(`      name: ${this.escapeYaml(vmName + "-boot")}`);
        lines.push(
          `      size: ${this.resolveBootVolumeSizeGb(vm.flavor, vm.volumeSizeGb)}`,
        );
        lines.push(
          `      image: ${this.escapeYaml(vm.operatingSystem || "Ubuntu 22.04 LTS")}`,
        );
        lines.push("");
      }

      lines.push(`  ${vmAlias}_server:`);
      lines.push("    type: OS::Nova::Server");
      lines.push("    depends_on:");
      vmPortAliases.forEach((vmPortAlias) => {
        lines.push(`      - ${vmPortAlias}`);
      });
      if (!isCustomImage) {
        lines.push(`      - ${vmAlias}_volume`);
      }
      lines.push("    properties:");
      lines.push(`      name: ${this.escapeYaml(vmName)}`);
      lines.push(`      flavor: ${this.extractFlavorName(vm.flavor)}`);
      lines.push("      config_drive: true");
      lines.push("      user_data_format: RAW");
      if (isCustomImage) {
        lines.push(`      image: ${this.escapeYaml(vm.operatingSystem || "")}`);
      }

      const vmCheckpoints = definition.checkpoints.filter(
        (cp) => !cp.vmId || cp.vmId === vm.id,
      );
      if (vmCheckpoints.length > 0) {
        lines.push("      user_data:");
        lines.push("        str_replace:");
        lines.push(
          `          template: { get_file: ${this.buildCloudInitFileName(mod, vm)} }`,
        );
        lines.push("          params:");
        lines.push("            __SESSION_ID__: { get_param: session_id }");
        lines.push("            __LAAS_API_URL__: { get_param: laas_api_url }");
        vmCheckpoints.forEach((cp) => {
          lines.push(
            `            ${this.toCheckpointPlaceholder(cp.id)}: { get_attr: [wc_handle_${this.toCheckpointAlias(cp.id)}, curl_cli] }`,
          );
        });
      } else {
        lines.push(
          `      user_data: { get_file: ${this.buildCloudInitFileName(mod, vm)} }`,
        );
      }

      if (!isCustomImage) {
        lines.push("      block_device_mapping_v2:");
        lines.push("        - boot_index: 0");
        lines.push("          delete_on_termination: false");
        lines.push(`          volume_id: { get_resource: ${vmAlias}_volume }`);
      }
      lines.push("      networks:");
      vmPortAliases.forEach((vmPortAlias) => {
        lines.push(`        - port: { get_resource: ${vmPortAlias} }`);
      });
      lines.push("");

      // When enablePortForwarding=true:
      // - No per-VM floating IPs created in Heat
      // - Orchestration-service will create port forwarding rules via Neutron API
      //
      // When enablePortForwarding=false (fallback for older OpenStack):
      // - Create per-VM floating IPs for direct SSH access
      if (!enablePortForwarding) {
        // Fallback for older OpenStack: per-VM floating IPs
        lines.push(`  ${vmAlias}_floating_ip:`);
        lines.push("    type: OS::Neutron::FloatingIP");
        lines.push("    depends_on:");
        lines.push(`      - ${zoneAliases[0]}_router_interface`);
        lines.push("    properties:");
        lines.push("      floating_network: { get_param: provider_network }");
        lines.push("");

        lines.push(`  ${vmAlias}_floating_ip_assoc:`);
        lines.push("    type: OS::Neutron::FloatingIPAssociation");
        lines.push("    depends_on:");
        vmPortAliases.forEach((portAlias) => {
          lines.push(`      - ${portAlias}`);
        });
        lines.push(`      - ${vmAlias}_server`);
        lines.push("    properties:");
        lines.push(
          `      floatingip_id: { get_resource: ${vmAlias}_floating_ip }`,
        );
        lines.push(`      port_id: { get_resource: ${vmPortAliases[0]} }`);
        lines.push("");
      }
    });

    // Only create shared floating IP if port forwarding is enabled
    if (enablePortForwarding) {
      lines.push("  ssh_nat_floating_ip:");
      lines.push("    type: OS::Neutron::FloatingIP");
      lines.push("    properties:");
      lines.push("      floating_network: { get_param: provider_network }");
      lines.push("");
    }

    // Only WaitConditionHandle per checkpoint — no WaitCondition resource so the
    // stack never blocks. VMs signal asynchronously via the handle's curl_cli URL.
    definition.checkpoints.forEach((cp) => {
      const cpAlias = this.toCheckpointAlias(cp.id);
      lines.push(`  wc_handle_${cpAlias}:`);
      lines.push("    type: OS::Heat::WaitConditionHandle");
      lines.push("");
    });

    lines.push("outputs:");
    vms.forEach((vm, idx) => {
      const vmName = vm.nodeName || `vm-${idx + 1}`;
      const vmAlias = this.toResourceName(vmName);
      const vmNatPort = sshNatStartPort + idx;
      const vmTtydNatPort = ttydNatStartPort + idx;

      // Calculate zone aliases for this VM
      const selectedZoneIds = Array.from(
        new Set(
          (Array.isArray(vm.zoneIds) ? vm.zoneIds : [vm.zoneId]).filter(
            Boolean,
          ),
        ),
      );
      const vmZones = selectedZoneIds
        .map((zoneId) => zoneById.get(zoneId))
        .filter((zone): zone is NetworkZone => Boolean(zone));
      const resolvedVmZones = vmZones.length > 0 ? vmZones : [zones[0]];
      const zoneAliases = resolvedVmZones.map((zone) =>
        this.toResourceName(zone.name || "tenant-net"),
      );
      const vmPortAliasName = `${vmAlias}_${zoneAliases[0]}_port`;

      const customImageInfo = customImagesMap.get(vm.operatingSystem || "");
      const sshUsername = customImageInfo
        ? customImageInfo.username
        : vm.initialUsername?.trim() || "labuser";
      lines.push(`  ${vmAlias}_name:`);
      lines.push(`    description: Name of ${this.escapeYaml(vmName)}`);
      lines.push(`    value: { get_attr: [${vmAlias}_server, name] }`);
      lines.push(`  ${vmAlias}_private_ip:`);
      lines.push("    description: Private IP address");
      lines.push(`    value: { get_attr: [${vmAlias}_server, first_address] }`);
      lines.push(`  ${vmAlias}_ssh_username:`);
      lines.push(
        `    description: SSH username for ${this.escapeYaml(vmName)}`,
      );
      lines.push(`    value: ${this.escapeYaml(sshUsername)}`);

      if (enablePortForwarding) {
        lines.push(`  ${vmAlias}_port_id:`);
        lines.push(
          "    description: Neutron port ID for SSH NAT port forwarding",
        );
        lines.push(`    value: { get_resource: ${vmPortAliasName} }`);
        lines.push(`  ${vmAlias}_ssh_nat_port:`);
        lines.push(
          "    description: External SSH NAT port on shared floating IP",
        );
        lines.push(`    value: ${vmNatPort}`);
        lines.push(`  ${vmAlias}_ttyd_nat_port:`);
        lines.push(
          "    description: External ttyd NAT port on shared floating IP",
        );
        lines.push(`    value: ${vmTtydNatPort}`);
      } else {
        // Per-VM floating IPs for older OpenStack
        lines.push(`  ${vmAlias}_floating_ip:`);
        lines.push(
          "    description: Public floating IP address for SSH access",
        );
        lines.push(
          `    value: { get_attr: [${vmAlias}_floating_ip, floating_ip_address] }`,
        );
      }
      lines.push("");
    });

    if (enablePortForwarding) {
      lines.push("  ssh_nat_floating_ip_id:");
      lines.push(
        "    description: Shared floating IP ID used for SSH NAT port forwarding",
      );
      lines.push("    value: { get_resource: ssh_nat_floating_ip }");
      lines.push("  ssh_nat_host:");
      lines.push(
        "    description: Shared floating IP address used for SSH NAT",
      );
      lines.push(
        "    value: { get_attr: [ssh_nat_floating_ip, floating_ip_address] }",
      );
      lines.push("");
    }

    return lines.join("\n").trimEnd() + "\n";
  }

  // Render cloud-init user-data script for a VM.
  // Only checkpoints assigned to this VM (by vmId) are injected; unassigned checkpoints are skipped.
  private renderCloudInit(
    definition: Required<ModuleDefinition>,
    vm: VmConfig,
    customImageInfo?: { username: string; password?: string },
  ): string {
    const user = customImageInfo
      ? customImageInfo.username
      : vm.initialUsername || "labuser";
    const password = customImageInfo
      ? customImageInfo.password || "Lab@12345"
      : vm.initialPassword || "Lab@12345";
    const nodeName = vm.nodeName?.trim() || "node";
    const zoneId =
      (Array.isArray(vm.zoneIds) && vm.zoneIds[0]) || vm.zoneId || "zone";
    const selectedZone = definition.networkZones.find(
      (zone) => zone.id === zoneId,
    );
    const selectedZoneDns = selectedZone?.dnsServers;
    const dnsServers = (Array.isArray(selectedZoneDns) ? selectedZoneDns : [])
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5);
    const dns1 = dnsServers[0] || "8.8.8.8";
    const dns2 = dnsServers[1] || "1.1.1.1";
    const dns3 = dnsServers[2] || dns2;
    const dnsCsv =
      dnsServers.length > 0 ? dnsServers.join(",") : `${dns1},${dns2}`;
    const provisionCommand =
      vm.command?.trim() || 'echo "No instructor command configured"';

    const os = vm.operatingSystem?.trim() || "";
    const isFedora =
      os === "Fedora-Cloud-44" ||
      os.includes("Fedora-Cloud-44") ||
      os.toLowerCase().includes("fedora");
    const isCentOS =
      os.toLowerCase().includes("centos") ||
      os.toLowerCase().includes("rhel") ||
      os.toLowerCase().includes("stream");

    const lines: string[] = [];
    lines.push("#cloud-config");
    lines.push("");
    lines.push("bootcmd:");
    if (isFedora) {
      lines.push("  - sysctl -w net.ipv4.conf.all.rp_filter=0");
      lines.push("  - sysctl -w net.ipv4.conf.ens3.rp_filter=0");
      lines.push(
        '  - nmcli connection modify "cloud-init ens3" ethtool.feature-rx off ethtool.feature-tx off',
      );
      lines.push('  - nmcli connection up "cloud-init ens3"');
    } else {
      lines.push("  - ethtool -K eth0 rx off tx off");
      lines.push("  - sysctl -w net.ipv4.conf.all.rp_filter=0");
    }
    lines.push("");
    lines.push(`hostname: ${nodeName}`);
    lines.push("manage_etc_hosts: false");
    lines.push("");
    lines.push("users:");
    lines.push("  - default");
    lines.push(`  - name: ${this.escapeYaml(user)}`);
    lines.push(`    plain_text_passwd: ${this.escapeYaml(password)}`);
    lines.push("    lock_passwd: false");
    lines.push("    shell: /bin/bash");
    lines.push("    sudo: ALL=(ALL) NOPASSWD:ALL");
    lines.push("    groups: [sudo]");
    lines.push("");
    lines.push("ssh_pwauth: true");
    lines.push("");
    lines.push("chpasswd:");
    lines.push("  expire: false");
    lines.push("  users:");
    lines.push(`    - name: ${this.escapeYaml(user)}`);
    lines.push(`      password: ${this.escapeYaml(password)}`);
    lines.push("      type: TEXT");
    lines.push("");
    lines.push("disable_root: true");
    lines.push("");
    lines.push("network:");
    lines.push("  version: 2");
    lines.push("  ethernets:");
    lines.push("    eth0:");
    if (vm.networkType === "static" && vm.staticIp?.trim()) {
      lines.push("      dhcp4: false");
      lines.push("      addresses:");
      lines.push(`        - ${vm.staticIp.trim()}/24`);
      lines.push(`      gateway4: ${selectedZone?.gateway || "10.10.0.1"}`);
      lines.push("      nameservers:");
      lines.push("        addresses:");
      lines.push(`          - ${dns1}`);
      lines.push(`          - ${dns2}`);
      lines.push(`          - ${dns3}`);
    } else {
      lines.push("      dhcp4: true");
    }
    lines.push("");
    lines.push("write_files:");
    if (isFedora) {
      lines.push("  - path: /etc/dnf/dnf.conf");
      lines.push("    append: true");
      lines.push("    content: |");
      lines.push("      max_parallel_downloads=10");
      lines.push("      fastestmirror=True");
      lines.push("      deltarpm=True");
    }
    if (isCentOS) {
      lines.push("  - path: /etc/yum.repos.d/centos.repo");
      lines.push("    owner: root:root");
      lines.push('    permissions: "0644"');
      lines.push("    content: |");
      lines.push("      [baseos]");
      lines.push("      name=CentOS Stream $releasever - BaseOS");
      lines.push(
        "      baseurl=https://mirror.stream.centos.org/9-stream/BaseOS/$basearch/os/",
      );
      lines.push("      gpgcheck=0");
      lines.push("      enabled=1");
      lines.push("");
      lines.push("      [appstream]");
      lines.push("      name=CentOS Stream $releasever - AppStream");
      lines.push(
        "      baseurl=https://mirror.stream.centos.org/9-stream/AppStream/$basearch/os/",
      );
      lines.push("      gpgcheck=0");
      lines.push("      enabled=1");
      lines.push("");
      lines.push("      [crb]");
      lines.push("      name=CentOS Stream $releasever - CRB");
      lines.push(
        "      baseurl=https://mirror.stream.centos.org/9-stream/CRB/$basearch/os/",
      );
      lines.push("      gpgcheck=0");
      lines.push("      enabled=1");
      lines.push("");
      lines.push("      [extras-common]");
      lines.push(
        "      name=CentOS Stream $releasever - Extras packages",
      );
      lines.push(
        "      baseurl=https://mirror.stream.centos.org/SIGs/9-stream/extras/$basearch/extras-common/",
      );
      lines.push("      gpgcheck=0");
      lines.push("      enabled=1");
    }

    const vmCheckpoints = definition.checkpoints.filter(
      (cp) => !cp.vmId || cp.vmId === vm.id,
    );

    if (vmCheckpoints.length > 0) {
      lines.push("  - path: /etc/profile.d/laas-checkpoints.sh");
      lines.push("    owner: root:root");
      lines.push('    permissions: "0644"');
      lines.push("    content: |");
      lines.push("      #!/bin/bash");
      lines.push('      export LAAS_SESSION_ID="__SESSION_ID__"');
      lines.push('      export LAAS_API_URL="__LAAS_API_URL__"');
      vmCheckpoints.forEach((cp) => {
        lines.push(
          `      export ${this.toCheckpointEnvName(cp.id)}="${this.toCheckpointPlaceholder(cp.id)}"`,
        );
      });
      lines.push("");

      lines.push("  - path: /usr/local/bin/checkpoint-done");
      lines.push("    owner: root:root");
      lines.push('    permissions: "0755"');
      lines.push("    content: |");
      lines.push("      #!/bin/bash");
      lines.push("      # Usage: checkpoint-done <checkpoint-id>");
      lines.push(
        '      if [ -z "${LAAS_SESSION_ID:-}" ] || [ -z "${LAAS_API_URL:-}" ]; then',
      );
      lines.push(
        '        echo "checkpoint-done: LAAS_SESSION_ID or LAAS_API_URL not configured" >&2; exit 1',
      );
      lines.push("      fi");
      lines.push(
        '      curl -sf -X POST "${LAAS_API_URL}/api/v1/checkpoints/signal" \\',
      );
      lines.push('        -H "Content-Type: application/json" \\');
      lines.push(
        '        -d "{\\"sessionId\\":\\"${LAAS_SESSION_ID}\\",\\"checkpointCode\\":\\"${1}\\"}" \\',
      );
      lines.push('        && echo "Checkpoint $1 signalled OK" \\');
      lines.push('        || echo "Checkpoint $1 signal FAILED" >&2');
      lines.push("");

      vmCheckpoints.forEach((cp) => {
        lines.push(`  - path: /var/cp_${cp.id}.sh`);
        lines.push("    owner: root:root");
        lines.push('    permissions: "0750"');
        lines.push("    content: |");
        lines.push("      #!/bin/bash");
        lines.push("      set -euo pipefail");
        lines.push("      source /etc/profile.d/laas-checkpoints.sh");
        lines.push("");
        if (cp.checkScript?.trim()) {
          this.appendScriptBlock(lines, cp.checkScript.trim(), 6);
        } else {
          lines.push("      # No check script — signal immediately");
        }
        lines.push("");
        lines.push(`      /usr/local/bin/checkpoint-done '${cp.id}'`);
        lines.push("");
      });
    }

    lines.push("  - path: /opt/laas/instructor/provision.sh");
    lines.push("    owner: root:root");
    lines.push('    permissions: "0750"');
    lines.push("    content: |");
    lines.push("      #!/bin/bash");
    lines.push("      set -euo pipefail");
    lines.push("");
    this.appendScriptBlock(lines, provisionCommand, 6);
    lines.push("");
    lines.push("  - path: /etc/lab-dns-info");
    lines.push("    owner: root:root");
    lines.push('    permissions: "0644"');
    lines.push("    content: |");
    lines.push("      DNS_MODE=vm-static");
    lines.push("      DNS_SOURCE=vm-static-config");
    lines.push(`      DNS_VALUES=${dnsCsv}`);
    lines.push("");
    lines.push("  - path: /etc/systemd/system/ttyd.service");
    lines.push("    owner: root:root");
    lines.push('    permissions: "0644"');
    lines.push("    content: |");
    lines.push("      [Unit]");
    lines.push("      Description=ttyd web terminal");
    lines.push("      After=network.target network-online.target");
    lines.push("");
    lines.push("      [Service]");
    lines.push("      ExecStart=/usr/local/bin/ttyd -p 7681 -W login");
    lines.push("      Restart=always");
    lines.push("      RestartSec=3s");
    lines.push("");
    lines.push("      [Install]");
    lines.push("      WantedBy=multi-user.target");
    lines.push("");
    const ttydUrl =
      process.env.TTYD_BINARY_URL || "http://192.168.2.250/assets/ttyd.x86_64";
    lines.push("  - path: /usr/local/bin/setup-ttyd.sh");
    lines.push("    owner: root:root");
    lines.push('    permissions: "0755"');
    lines.push("    content: |");
    lines.push("      #!/bin/bash");
    lines.push("      if [ -s /usr/local/bin/ttyd ]; then");
    lines.push("        chmod +x /usr/local/bin/ttyd");
    lines.push("        systemctl daemon-reload");
    lines.push("        systemctl enable ttyd --now");
    lines.push("        exit 0");
    lines.push("      fi");
    lines.push("      if command -v ttyd >/dev/null 2>&1; then");
    lines.push("        cp $(which ttyd) /usr/local/bin/ttyd 2>/dev/null || true");
    lines.push("        chmod +x /usr/local/bin/ttyd 2>/dev/null || true");
    lines.push("        systemctl daemon-reload");
    lines.push("        systemctl enable ttyd --now");
    lines.push("        exit 0");
    lines.push("      fi");
    lines.push(`      PRIMARY="${ttydUrl}"`);
    lines.push(
      '      FALLBACK="https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64"',
    );
    lines.push("      for attempt in $(seq 1 20); do");
    lines.push("        if [ -s /usr/local/bin/ttyd ]; then break; fi");
    lines.push(
      '        curl -fsSL --connect-timeout 5 -o /usr/local/bin/ttyd "$PRIMARY" 2>/dev/null || \\',
    );
    lines.push(
      '        curl -fsSL --connect-timeout 10 -o /usr/local/bin/ttyd "$FALLBACK" 2>/dev/null || true',
    );
    lines.push("        if [ -s /usr/local/bin/ttyd ]; then break; fi");
    lines.push("        sleep 3");
    lines.push("      done");
    lines.push("      if [ -s /usr/local/bin/ttyd ]; then");
    lines.push("        chmod +x /usr/local/bin/ttyd");
    lines.push("        systemctl daemon-reload");
    lines.push("        systemctl enable ttyd --now");
    lines.push("      fi");
    lines.push("");
    lines.push("runcmd:");
    if (isCentOS) {
      lines.push("  - rm -f /etc/yum.repos.d/centos-addons.repo");
    }
    lines.push("  - setenforce 0 2>/dev/null || true");
    lines.push(
      "  - sed -i 's/^SELINUX=.*/SELINUX=permissive/' /etc/selinux/config 2>/dev/null || true",
    );
    lines.push(`  - usermod -s /bin/bash '${user}'`);
    lines.push(
      "  - bash -c 'nohup /usr/local/bin/setup-ttyd.sh >/var/log/setup-ttyd.log 2>&1 &'",
    );
    lines.push("  - chmod 0750 /opt/laas/instructor/provision.sh");
    if (vmCheckpoints.length > 0) {
      lines.push("  - chmod 0755 /usr/local/bin/checkpoint-done");
      lines.push(
        "  - \"bash -c 'source /etc/profile.d/laas-checkpoints.sh && bash /opt/laas/instructor/provision.sh' || true\"",
      );
      vmCheckpoints
        .filter((cp) => cp.checkScript?.trim())
        .forEach((cp) => {
          lines.push(`  - bash /var/cp_${cp.id}.sh || true`);
        });
    } else {
      lines.push("  - bash /opt/laas/instructor/provision.sh || true");
    }
    if (vm.ansibleRepoUrl) {
      lines.push("  - |");
      lines.push(
        `    su - ${user} -c 'git clone ${vm.ansibleRepoUrl} ~/lab-ansible || true'`,
      );
    }
    lines.push("");
    lines.push(`final_message: "Lab VM ready: ${nodeName} / zone ${zoneId}"`);

    return lines.join("\n").trimEnd() + "\n";
  }

  // Preserve script formatting while injecting it into YAML block scalars.
  private appendScriptBlock(
    lines: string[],
    script: string,
    indentSpaces: number,
  ) {
    const indent = " ".repeat(indentSpaces);
    const scriptLines = script.split(/\r?\n/);
    for (const line of scriptLines) {
      lines.push(`${indent}${line}`);
    }
  }

  private buildLabDefinitionFileName(labCode: string): string {
    return `lab-definition-${this.toResourceName(labCode)}.json`;
  }

  private buildHeatFileName(mod: { orderNo: number; name: string }): string {
    return `module-${mod.orderNo}-${this.toResourceName(mod.name)}.yml`;
  }

  private buildCloudInitFileName(
    mod: { orderNo: number; name: string },
    vm: VmConfig,
  ): string {
    const vmName = vm.nodeName || vm.id || "vm";
    return `cloud-init-m${mod.orderNo}-${this.toResourceName(mod.name)}-${this.toResourceName(vmName)}.yaml`;
  }

  private toResourceName(value: string): string {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "item"
    );
  }

  private extractFlavorName(flavor?: string): string {
    if (!flavor) {
      return "m1.small";
    }

    const match = flavor.match(/^([a-zA-Z0-9.\-_]+)/);
    return match?.[1] ?? "m1.small";
  }

  private resolveBootVolumeSizeGb(
    flavor?: string,
    explicitVolumeSizeGb?: number,
  ): number {
    if (
      typeof explicitVolumeSizeGb === "number" &&
      Number.isFinite(explicitVolumeSizeGb) &&
      explicitVolumeSizeGb > 0
    ) {
      return Math.max(1, Math.floor(explicitVolumeSizeGb));
    }

    const flavorName = this.extractFlavorName(flavor);
    const bootVolumeSizeByFlavor: Record<string, number> = {
      "lab.nano": 5,
      "lab.micro": 10,
      "lab.small": 15,
      "lab.medium": 20,
      "lab.large": 40,
      "lab.xlarge": 80,
      "lab.2xlarge": 160,
      "lab.db-small": 30,
      "lab.db-medium": 60,
      "lab.db-large": 120,
      "lab.compute": 20,
      "lab.memory": 20,
      "lab.win-small": 60,
      "lab.win-med": 100,
    };

    return bootVolumeSizeByFlavor[flavorName] ?? 20;
  }

  private toCheckpointAlias(cpId: string): string {
    return (
      cpId
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "cp"
    );
  }

  private toCheckpointEnvName(cpId: string): string {
    const upper = cpId
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return `CHECKPOINT_${upper}`;
  }

  private toCheckpointPlaceholder(cpId: string): string {
    return `__${this.toCheckpointEnvName(cpId)}__`;
  }

  private escapeYaml(value: string): string {
    return JSON.stringify(value);
  }
}
