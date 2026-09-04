import { ConfigService } from '@nestjs/config';

export interface ServiceRoute {
  baseUrl: string;
  /** Transform the incoming gateway path to the upstream service path */
  transformPath(gatewayPath: string): string;
}

/** No path change — auth-service and user-service share the same /api prefix */
function pass(baseUrl: string): ServiceRoute {
  return { baseUrl, transformPath: (p) => p };
}

/**
 * Lab-service uses /api/v1 prefix.
 * /api/lab-templates/123  →  /api/v1/lab-templates/123
 */
function v1(baseUrl: string): ServiceRoute {
  return {
    baseUrl,
    transformPath: (p) => '/api/v1' + p.slice('/api'.length),
  };
}

/**
 * Orchestration resources sit under /api/v1/openstack/{segment}.
 * /api/stacks/foo  →  /api/v1/openstack/stacks/foo
 * /api/flavors     →  /api/v1/openstack/flavors
 */
function orch(baseUrl: string): ServiceRoute {
  return {
    baseUrl,
    transformPath: (p) => '/api/v1/openstack' + p.slice('/api'.length),
  };
}

export function buildRouteMap(cfg: ConfigService): Record<string, ServiceRoute> {
  const AUTH    = cfg.get<string>('AUTH_SERVICE_URL')!;
  const USER    = cfg.get<string>('USER_SERVICE_URL')!;
  const LAB     = cfg.get<string>('LAB_SERVICE_URL')!;
  const ORCH    = cfg.get<string>('ORCHESTRATION_SERVICE_URL')!;
  const GRADING = cfg.get<string>('GRADING_SERVICE_URL') || 'http://localhost:3005';
  const BILLING = cfg.get<string>('BILLING_SERVICE_URL') || 'http://localhost:3006';

  return {
    // ── Auth service (/api prefix, paths pass through unchanged) ──────────
    auth: pass(AUTH),
    billing: {
      baseUrl: BILLING,
      transformPath: (p) => '/api/v1' + p.slice('/api'.length),
    },

    // ── User service (/api prefix, paths pass through unchanged) ──────────
    users: pass(USER),

    // ── Lab service (/api/v1 prefix) ──────────────────────────────────────
    // /api/{segment}/* → LAB_SERVICE_URL/api/v1/{segment}/*
    'lab-templates':         v1(LAB),
    modules:                 v1(LAB),
    sessions:                v1(LAB),
    checkpoints:             v1(LAB),
    images:                  orch(ORCH),
    'image-builder':         v1(LAB),
    'provisioning-profiles': v1(LAB),
    'lab-access':            v1(LAB),
    'repository-images': {
      baseUrl: LAB,
      // /api/repository-images/* → LAB/api/v1/images/*
      transformPath: (p) =>
        '/api/v1' + p.slice('/api'.length).replace(/^\/repository-images/, '/images'),
    },

    // ── LMS resources (user-service: groups; lab-service: lessons, class-labs) ─
    groups:       pass(USER),
    lessons:      v1(LAB),
    'class-labs': v1(LAB),

    // ── Grading service (/api prefix, paths pass through unchanged) ───────
    grades:       pass(GRADING),

    // ── Orchestration service (/api/v1/openstack prefix) ─────────────────
    // /api/openstack/* → ORCH_URL/api/v1/openstack/*  (segment already named openstack)
    openstack: {
      baseUrl: ORCH,
      transformPath: (p) => '/api/v1' + p.slice('/api'.length),
    },
    // /api/{segment}/* → ORCH_URL/api/v1/openstack/{segment}/*
    stacks:          orch(ORCH),
    flavors:         orch(ORCH),
    hypervisors:     orch(ORCH),
    'volume-limits': orch(ORCH),
    guacamole:       orch(ORCH),
    servers:         orch(ORCH),
  };
}
