-- Migration: auth-tables
-- Created at: 2026-02-14
-- Phase 3: Multi-Site & RBAC - User Management & Authentication

-- ============================================================================
-- UP MIGRATION
-- ============================================================================

-- ============================================================================
-- USERS TABLE - Core user authentication
-- ============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    global_role VARCHAR(50) NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    
    CONSTRAINT users_email_valid CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT users_global_role_valid CHECK (global_role IN ('super_admin', 'user'))
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_global_role ON users(global_role);
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;

COMMENT ON TABLE users IS 'User accounts with authentication credentials';
COMMENT ON COLUMN users.email IS 'Unique email address for login';
COMMENT ON COLUMN users.password_hash IS 'Bcrypt hashed password (12 rounds)';
COMMENT ON COLUMN users.global_role IS 'Global role: super_admin (all sites) or user (assigned sites only)';

-- ============================================================================
-- USER_SITE_ROLES TABLE - Site-specific role assignments (RBAC)
-- ============================================================================
CREATE TABLE user_site_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    
    PRIMARY KEY (user_id, site_id),
    CONSTRAINT user_site_roles_role_valid CHECK (role IN ('admin', 'viewer'))
);

CREATE INDEX idx_user_site_roles_user ON user_site_roles(user_id);
CREATE INDEX idx_user_site_roles_site ON user_site_roles(site_id);
CREATE INDEX idx_user_site_roles_granted_by ON user_site_roles(granted_by);

COMMENT ON TABLE user_site_roles IS 'Site-specific role assignments for RBAC';
COMMENT ON COLUMN user_site_roles.role IS 'Site role: admin (can edit) or viewer (read-only)';
COMMENT ON COLUMN user_site_roles.granted_by IS 'User who granted this role (super_admin or site admin)';

-- ============================================================================
-- REFRESH_TOKENS TABLE - JWT refresh tokens
-- ============================================================================
CREATE TABLE refresh_tokens (
    token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ DEFAULT NULL,
    
    CONSTRAINT refresh_tokens_expires_future CHECK (expires_at > created_at)
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_revoked ON refresh_tokens(revoked_at) WHERE revoked_at IS NULL;

COMMENT ON TABLE refresh_tokens IS 'JWT refresh tokens for session management';
COMMENT ON COLUMN refresh_tokens.expires_at IS 'Token expiry (default: 7 days from creation)';
COMMENT ON COLUMN refresh_tokens.revoked_at IS 'Timestamp when token was revoked (for logout)';

-- ============================================================================
-- UPDATED_AT TRIGGER for users table
-- ============================================================================
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- CREATE FIRST SUPER ADMIN (if no users exist)
-- This will be updated via seed script - just ensure table is ready
-- ============================================================================

-- ============================================================================
-- DOWN MIGRATION
-- ============================================================================

-- DROP TRIGGER IF EXISTS update_users_updated_at ON users;
-- DROP TABLE IF EXISTS refresh_tokens;
-- DROP TABLE IF EXISTS user_site_roles;
-- DROP TABLE IF EXISTS users;
