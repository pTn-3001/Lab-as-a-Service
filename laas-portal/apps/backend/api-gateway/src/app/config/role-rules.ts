export interface RoleRule {
  prefix: string;
  roles: Array<'ADMIN' | 'INSTRUCTOR' | 'STUDENT'>;
}

/**
 * First matching prefix wins — more specific rules must appear before broader ones.
 * Auth routes have no role rule here because they are handled by PUBLIC_PATHS
 * (public) or only require a valid token (no role restriction).
 */
export const ROLE_RULES: RoleRule[] = [
  // ── User service ──────────────────────────────────────────────────────
  // All authenticated roles can access /api/users; fine-grained RBAC is
  // enforced inside user-service itself.
  { prefix: '/api/users', roles: ['ADMIN', 'INSTRUCTOR', 'STUDENT'] },

  // ── LMS: Groups / Lessons / Class-labs ───────────────────────────────
  // groups: RBAC enforced inside user-service (admin=all, instructor=own)
  { prefix: '/api/groups',     roles: ['ADMIN', 'INSTRUCTOR', 'STUDENT'] },
  // lessons and class-labs: admin+instructor manage; students read
  { prefix: '/api/lessons',    roles: ['ADMIN', 'INSTRUCTOR', 'STUDENT'] },
  { prefix: '/api/class-labs', roles: ['ADMIN', 'INSTRUCTOR', 'STUDENT'] },

  // ── Grading service ──────────────────────────────────────────────────
  { prefix: '/api/grades', roles: ['ADMIN', 'INSTRUCTOR', 'STUDENT'] },

  // ── Lab service ───────────────────────────────────────────────────────
  { prefix: '/api/lab-templates',          roles: ['ADMIN', 'INSTRUCTOR', 'STUDENT'] },
  { prefix: '/api/modules',                roles: ['ADMIN', 'INSTRUCTOR', 'STUDENT'] },
  { prefix: '/api/sessions',               roles: ['ADMIN', 'INSTRUCTOR', 'STUDENT'] },
  { prefix: '/api/checkpoints',            roles: ['ADMIN', 'INSTRUCTOR', 'STUDENT'] },
  { prefix: '/api/images',                 roles: ['ADMIN', 'INSTRUCTOR', 'STUDENT'] },
  { prefix: '/api/repository-images',      roles: ['ADMIN', 'INSTRUCTOR', 'STUDENT'] },
  { prefix: '/api/lab-access',             roles: ['ADMIN', 'INSTRUCTOR', 'STUDENT'] },
  // Image builder and provisioning are instructor+ only
  { prefix: '/api/image-builder',          roles: ['ADMIN', 'INSTRUCTOR'] },
  { prefix: '/api/provisioning-profiles',  roles: ['ADMIN', 'INSTRUCTOR'] },

  // ── Orchestration service ─────────────────────────────────────────────
  // Admin-only: raw hypervisor/volume stats
  { prefix: '/api/openstack/hypervisors',   roles: ['ADMIN'] },
  { prefix: '/api/openstack/volume-limits', roles: ['ADMIN'] },
  { prefix: '/api/hypervisors',             roles: ['ADMIN'] },
  { prefix: '/api/volume-limits',           roles: ['ADMIN'] },
  // Other openstack management: admin and instructor
  { prefix: '/api/openstack', roles: ['ADMIN', 'INSTRUCTOR'] },
  // Stack/flavor/guacamole resources: all authenticated (used during lab sessions)
  { prefix: '/api/stacks',    roles: ['ADMIN', 'INSTRUCTOR', 'STUDENT'] },
  { prefix: '/api/flavors',   roles: ['ADMIN', 'INSTRUCTOR', 'STUDENT'] },
  { prefix: '/api/guacamole', roles: ['ADMIN', 'INSTRUCTOR', 'STUDENT'] },
  { prefix: '/api/servers',   roles: ['ADMIN', 'INSTRUCTOR'] },
];

export function matchRoleRule(path: string): RoleRule | undefined {
  return ROLE_RULES.find((r) => path.startsWith(r.prefix));
}
