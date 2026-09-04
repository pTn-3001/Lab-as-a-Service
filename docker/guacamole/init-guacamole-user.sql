-- =============================================
-- Guacamole MySQL: Create 'quickconnect' API user
-- =============================================
-- This user is used by the orchestration-service to:
--   1. Obtain Guacamole auth tokens via POST /api/tokens
--   2. Access dynamically created SSH connections
--
-- Password: 'quickconnect' (SHA-256 hashed with salt)
--
-- Run this AFTER the Guacamole schema has been initialized.
-- Guacamole auto-initializes tables on first boot with MySQL JDBC auth.
-- =============================================

-- Step 1: Create entity record for the user
INSERT IGNORE INTO guacamole_entity (name, type)
VALUES ('quickconnect', 'USER');

-- Step 2: Create user record with password hash
-- Guacamole stores passwords as: SHA-256( password + salt_hex )
-- We use a known salt and pre-computed hash for password 'quickconnect'
SET @salt = UNHEX(SHA2(UUID(), 256));

INSERT INTO guacamole_user (
  entity_id,
  password_hash,
  password_salt,
  password_date
)
SELECT
  e.entity_id,
  UNHEX(SHA2(CONCAT('quickconnect', HEX(@salt)), 256)),
  @salt,
  NOW()
FROM guacamole_entity e
WHERE e.name = 'quickconnect' AND e.type = 'USER'
  AND NOT EXISTS (
    SELECT 1 FROM guacamole_user u WHERE u.entity_id = e.entity_id
  );

-- Step 3: Grant system-level permissions
-- CREATE_CONNECTION: allows backend to create connections via API (if needed)
-- ADMINISTER: full access to all connections (simplifies permission model)
INSERT IGNORE INTO guacamole_system_permission (entity_id, permission)
SELECT e.entity_id, 'CREATE_CONNECTION'
FROM guacamole_entity e
WHERE e.name = 'quickconnect' AND e.type = 'USER';

INSERT IGNORE INTO guacamole_system_permission (entity_id, permission)
SELECT e.entity_id, 'ADMINISTER'
FROM guacamole_entity e
WHERE e.name = 'quickconnect' AND e.type = 'USER';

-- =============================================
-- Optional: Create 'admin' user for manual testing
-- Password: 'admin'
-- =============================================
INSERT IGNORE INTO guacamole_entity (name, type)
VALUES ('admin', 'USER');

SET @admin_salt = UNHEX(SHA2(UUID(), 256));

INSERT INTO guacamole_user (
  entity_id,
  password_hash,
  password_salt,
  password_date
)
SELECT
  e.entity_id,
  UNHEX(SHA2(CONCAT('admin', HEX(@admin_salt)), 256)),
  @admin_salt,
  NOW()
FROM guacamole_entity e
WHERE e.name = 'admin' AND e.type = 'USER'
  AND NOT EXISTS (
    SELECT 1 FROM guacamole_user u WHERE u.entity_id = e.entity_id
  );

INSERT IGNORE INTO guacamole_system_permission (entity_id, permission)
SELECT e.entity_id, 'ADMINISTER'
FROM guacamole_entity e
WHERE e.name = 'admin' AND e.type = 'USER';

INSERT IGNORE INTO guacamole_system_permission (entity_id, permission)
SELECT e.entity_id, 'CREATE_CONNECTION'
FROM guacamole_entity e
WHERE e.name = 'admin' AND e.type = 'USER';

INSERT IGNORE INTO guacamole_system_permission (entity_id, permission)
SELECT e.entity_id, 'CREATE_USER'
FROM guacamole_entity e
WHERE e.name = 'admin' AND e.type = 'USER';
