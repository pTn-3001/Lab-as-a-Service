import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationStatus, ModuleStatus } from '../../generated/prisma-client';

export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  status: ValidationStatus;
  summary: string;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Validation service performs:
 * - module-level schema/content checks
 * - cross-module conflict checks (CIDR/VM naming)
 * - persistence of validation runs and status transitions
 */
@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  constructor(private prisma: PrismaService) {}

  // Validate one module and persist both status and validation run report.

  async validateModule(moduleId: string): Promise<ValidationResult> {
    const mod = await this.prisma.module.findFirst({
      where: { id: moduleId, deletedAt: null },
    });
    if (!mod) throw new NotFoundException(`Module "${moduleId}" not found`);

    const result = this.runModuleValidation(mod.definitionJson as any, moduleId);

    const newStatus = result.errors.length === 0 ? ValidationStatus.VALID : ValidationStatus.INVALID;

    // Persist result
    await Promise.all([
      this.prisma.module.update({
        where: { id: moduleId },
        data: {
          validationStatus: newStatus,
          status: newStatus === ValidationStatus.VALID ? ModuleStatus.VALID : ModuleStatus.INVALID,
          normalizedJson: result.errors.length === 0 ? mod.definitionJson : undefined,
        },
      }),
      this.prisma.validationRun.create({
        data: {
          moduleId,
          labTemplateId: mod.labTemplateId,
          status: newStatus,
          reportJson: result as any,
        },
      }),
    ]);

    this.logger.log(`Module ${moduleId} validated: ${newStatus}`);
    return { ...result, status: newStatus };
  }

  // Validate full lab by aggregating module checks + cross-module checks.

  async validateLab(labTemplateId: string): Promise<ValidationResult> {
    const lab = await this.prisma.labTemplate.findFirst({
      where: { id: labTemplateId, deletedAt: null },
    });
    if (!lab) throw new NotFoundException(`Lab template "${labTemplateId}" not found`);

    const modules = await this.prisma.module.findMany({
      where: { labTemplateId, deletedAt: null },
      orderBy: { orderNo: 'asc' },
    });

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // --- Step 1: validate each module individually ---
    const moduleResults = modules.map((m) =>
      this.runModuleValidation(m.definitionJson as any, m.id),
    );

    moduleResults.forEach((res, i) => {
      res.errors.forEach((e) => errors.push({ ...e, field: `modules[${i}].${e.field}` }));
      res.warnings.forEach((w) => warnings.push({ ...w, field: `modules[${i}].${w.field}` }));
    });

    // --- Step 2: cross-module checks ---
    this.crossModuleChecks(modules, errors, warnings);

    const newStatus = errors.length === 0 ? ValidationStatus.VALID : ValidationStatus.INVALID;

    // Update statuses in transaction
    await this.prisma.$transaction([
      this.prisma.labTemplate.update({
        where: { id: labTemplateId },
        data: {
          validationStatus: newStatus,
          lastValidatedAt: new Date(),
        },
      }),
      ...modules.map((m, i) =>
        this.prisma.module.update({
          where: { id: m.id },
          data: {
            validationStatus:
              moduleResults[i].errors.length === 0
                ? ValidationStatus.VALID
                : ValidationStatus.INVALID,
            status:
              moduleResults[i].errors.length === 0
                ? ModuleStatus.VALID
                : ModuleStatus.INVALID,
          },
        }),
      ),
      this.prisma.validationRun.create({
        data: {
          labTemplateId,
          status: newStatus,
          reportJson: { errors, warnings } as any,
        },
      }),
    ]);

    this.logger.log(`Lab ${labTemplateId} validated: ${newStatus}`);
    return {
      status: newStatus,
      summary: errors.length === 0 ? 'Lab is valid' : 'Lab contains invalid configuration',
      errors,
      warnings,
    };
  }

  // Validation run history queries.

  async getLabValidationRuns(labTemplateId: string) {
    return this.prisma.validationRun.findMany({
      where: { labTemplateId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getModuleValidationRuns(moduleId: string) {
    return this.prisma.validationRun.findMany({
      where: { moduleId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Core module validation rules over definitionJson.

  private runModuleValidation(definition: any, moduleId: string): Omit<ValidationResult, 'status'> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!definition) {
      errors.push({ field: 'definitionJson', code: 'MISSING_DEFINITION', message: 'Module definition is empty' });
      return { summary: 'Module contains invalid configuration', errors, warnings };
    }

    // Validate network zones
    const zones: any[] = definition?.network?.zones ?? [];
    zones.forEach((zone: any, zIdx: number) => {
      if (!zone.name) {
        errors.push({
          field: `definitionJson.network.zones[${zIdx}].name`,
          code: 'MISSING_ZONE_NAME',
          message: 'Network zone name is required',
        });
      }
      if (zone.cidr && !this.isValidCidr(zone.cidr)) {
        errors.push({
          field: `definitionJson.network.zones[${zIdx}].cidr`,
          code: 'INVALID_CIDR',
          message: `CIDR "${zone.cidr}" is invalid`,
        });
      }
      if (zone.gateway && !this.isValidIp(zone.gateway)) {
        errors.push({
          field: `definitionJson.network.zones[${zIdx}].gateway`,
          code: 'INVALID_GATEWAY',
          message: `Gateway "${zone.gateway}" is not a valid IP`,
        });
      }
    });

    // Validate VMs
    const vms: any[] = definition?.vms ?? [];
    const vmNames = new Set<string>();
    vms.forEach((vm: any, vmIdx: number) => {
      if (!vm.name) {
        errors.push({
          field: `definitionJson.vms[${vmIdx}].name`,
          code: 'MISSING_VM_NAME',
          message: 'VM name is required',
        });
      } else {
        if (vmNames.has(vm.name)) {
          errors.push({
            field: `definitionJson.vms[${vmIdx}].name`,
            code: 'DUPLICATE_VM_NAME',
            message: `VM name "${vm.name}" is duplicated within this module`,
          });
        }
        vmNames.add(vm.name);
      }

      if (!vm.osImage) {
        errors.push({
          field: `definitionJson.vms[${vmIdx}].osImage`,
          code: 'MISSING_OS_IMAGE',
          message: 'VM osImage is required',
        });
      }
      if (!vm.flavor) {
        errors.push({
          field: `definitionJson.vms[${vmIdx}].flavor`,
          code: 'MISSING_FLAVOR',
          message: 'VM flavor is required',
        });
      }

      // Check zoneName references valid zone
      if (vm.zoneName) {
        const zoneNames = zones.map((z: any) => z.name);
        if (!zoneNames.includes(vm.zoneName)) {
          errors.push({
            field: `definitionJson.vms[${vmIdx}].zoneName`,
            code: 'ZONE_NOT_FOUND',
            message: `VM references zone "${vm.zoneName}" which does not exist`,
          });
        }
      }

      if (vm.staticIp && !this.isValidIp(vm.staticIp)) {
        errors.push({
          field: `definitionJson.vms[${vmIdx}].staticIp`,
          code: 'INVALID_STATIC_IP',
          message: `Static IP "${vm.staticIp}" is invalid`,
        });
      }
    });

    // Validate scripts
    const scripts = definition?.scripts;
    if (scripts) {
      if (scripts.bootstrapMode === 'repo' && !scripts.repoUrl) {
        warnings.push({
          field: `definitionJson.scripts.repoUrl`,
          code: 'REPO_NOT_VERIFIED',
          message: 'Bootstrap mode is "repo" but repoUrl is not set',
        });
      }
    }

    return {
      summary: errors.length === 0 ? 'Module is valid' : 'Module contains invalid configuration',
      errors,
      warnings,
    };
  }

  private crossModuleChecks(modules: any[], errors: ValidationError[], warnings: ValidationWarning[]) {
    // warnings is currently reserved for future cross-module non-blocking checks.
    const allCidrs: { cidr: string; moduleIdx: number; zoneIdx: number }[] = [];
    const allVmNames: { name: string; moduleIdx: number }[] = [];

    modules.forEach((m, mIdx) => {
      const def = m.definitionJson as any;
      const zones: any[] = def?.network?.zones ?? [];
      zones.forEach((z: any, zIdx: number) => {
        if (z.cidr) {
          const conflict = allCidrs.find((c) => c.cidr === z.cidr);
          if (conflict) {
            errors.push({
              field: `modules[${mIdx}].definitionJson.network.zones[${zIdx}].cidr`,
              code: 'DUPLICATE_CIDR',
              message: `CIDR "${z.cidr}" conflicts with modules[${conflict.moduleIdx}]`,
            });
          }
          allCidrs.push({ cidr: z.cidr, moduleIdx: mIdx, zoneIdx: zIdx });
        }
      });

      const vms: any[] = def?.vms ?? [];
      vms.forEach((vm: any) => {
        if (vm.name) {
          const conflict = allVmNames.find((v) => v.name === vm.name);
          if (conflict) {
            errors.push({
              field: `modules[${mIdx}].definitionJson.vms`,
              code: 'DUPLICATE_VM_NAME_CROSS_MODULE',
              message: `VM name "${vm.name}" conflicts with modules[${conflict.moduleIdx}]`,
            });
          }
          allVmNames.push({ name: vm.name, moduleIdx: mIdx });
        }
      });
    });
  }

  // Primitive validators used by rule functions above.

  private isValidCidr(cidr: string): boolean {
    const parts = cidr.split('/');
    if (parts.length !== 2) return false;
    const prefix = parseInt(parts[1], 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;
    return this.isValidIp(parts[0]);
  }

  private isValidIp(ip: string): boolean {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
      ip.split('.').every((octet) => parseInt(octet, 10) <= 255);
  }
}
