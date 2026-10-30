-- Preserve existing owner IDs and session cookies during the account upgrade.
RENAME TABLE visitor_session TO studio_owner;
CREATE TABLE account (
  owner_id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  display_name VARCHAR(40) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(owner_id) REFERENCES studio_owner(id)
);
CREATE TABLE auth_session (
  token_hash CHAR(64) PRIMARY KEY,
  owner_id VARCHAR(36) NOT NULL,
  pending_guest_id VARCHAR(36),
  expires_at TIMESTAMP NOT NULL,
  FOREIGN KEY(owner_id) REFERENCES studio_owner(id),
  FOREIGN KEY(pending_guest_id) REFERENCES studio_owner(id)
);
INSERT INTO auth_session(token_hash,owner_id,expires_at)
SELECT token_hash,id,expires_at FROM studio_owner;
ALTER TABLE studio_owner DROP COLUMN token_hash, DROP COLUMN expires_at,
  ADD COLUMN retired BOOLEAN NOT NULL DEFAULT FALSE;
