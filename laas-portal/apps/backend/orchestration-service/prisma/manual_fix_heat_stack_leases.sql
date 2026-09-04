DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'StackLeaseStatus'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "StackLeaseStatus" AS ENUM ('ACTIVE', 'RELEASING', 'RELEASED', 'RELEASE_FAILED');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "heat_stack_leases" (
  "id" UUID NOT NULL,
  "platform_user_id" TEXT NOT NULL,
  "keystone_project_id" TEXT NOT NULL,
  "stack_name" TEXT NOT NULL,
  "stack_id" TEXT NOT NULL,
  "floating_ip_reserve_count" INTEGER NOT NULL DEFAULT 2,
  "lease_minutes" INTEGER NOT NULL,
  "status" "StackLeaseStatus" NOT NULL DEFAULT 'ACTIVE',
  "release_attempts" INTEGER NOT NULL DEFAULT 0,
  "release_error_message" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "released_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "heat_stack_leases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "heat_stack_leases_stack_id_key" ON "heat_stack_leases"("stack_id");
CREATE INDEX IF NOT EXISTS "heat_stack_leases_platform_user_id_idx" ON "heat_stack_leases"("platform_user_id");
CREATE INDEX IF NOT EXISTS "heat_stack_leases_status_expires_at_idx" ON "heat_stack_leases"("status", "expires_at");
CREATE INDEX IF NOT EXISTS "heat_stack_leases_keystone_project_id_idx" ON "heat_stack_leases"("keystone_project_id");
