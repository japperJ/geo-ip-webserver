import bcrypt from 'bcrypt';
import type { FastifyInstance } from 'fastify';

const BCRYPT_ROUNDS = 12;

export interface User {
  id: string;
  email: string;
  password_hash: string;
  global_role: 'super_admin' | 'user';
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface CreateUserInput {
  email: string;
  password: string;
  global_role?: 'super_admin' | 'user';
}

export interface UserListItem {
  id: string;
  email: string;
  global_role: 'super_admin' | 'user';
}

export interface LoginResult {
  user: Omit<User, 'password_hash'>;
  accessToken: string;
  refreshToken: string;
}

export interface UserSiteRole {
  user_id: string;
  site_id: string;
  role: 'admin' | 'viewer';
  granted_by: string | null;
  granted_at: Date;
}

export class AuthService {
  private jwtExpiration: string;

  constructor(private fastify: FastifyInstance) {
    // Use JWT_EXPIRATION from env or default to 15m
    this.jwtExpiration = process.env.JWT_EXPIRATION || '15m';
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async createUser(input: CreateUserInput): Promise<Omit<User, 'password_hash'>> {
    const { email, password, global_role = 'user' } = input;

    // Validate email format
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }

    // Validate password strength (min 8 chars)
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    const passwordHash = await this.hashPassword(password);

    const result = await this.fastify.pg.query<User>(
      `INSERT INTO users (email, password_hash, global_role)
       VALUES ($1, $2, $3)
       RETURNING id, email, global_role, created_at, updated_at, deleted_at`,
      [email, passwordHash, global_role]
    );

    return result.rows[0];
  }

  async login(email: string, password: string): Promise<LoginResult> {
    // Get user
    const result = await this.fastify.pg.query<User>(
      'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = result.rows[0];

    // Verify password
    const valid = await this.verifyPassword(password, user.password_hash);
    if (!valid) {
      throw new Error('Invalid email or password');
    }

    // Get user's site roles
    const sitesResult = await this.fastify.pg.query<UserSiteRole>(
      'SELECT site_id, role FROM user_site_roles WHERE user_id = $1',
      [user.id]
    );

    const sites: Record<string, string> = {};
    for (const row of sitesResult.rows) {
      sites[row.site_id] = row.role;
    }

    // Generate access token
    const accessToken = this.fastify.jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.global_role,
        sites,
      },
      { expiresIn: this.jwtExpiration }
    );

    // Create refresh token (7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const refreshResult = await this.fastify.pg.query<{ token: string }>(
      `INSERT INTO refresh_tokens (user_id, expires_at)
       VALUES ($1, $2)
       RETURNING token`,
      [user.id, expiresAt]
    );

    const { password_hash, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      accessToken,
      refreshToken: refreshResult.rows[0].token,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    // Validate refresh token
    const tokenResult = await this.fastify.pg.query<{
      user_id: string;
      expires_at: Date;
      revoked_at: Date | null;
    }>(
      `SELECT user_id, expires_at, revoked_at
       FROM refresh_tokens
       WHERE token = $1`,
      [refreshToken]
    );

    if (tokenResult.rows.length === 0) {
      throw new Error('Invalid refresh token');
    }

    const tokenData = tokenResult.rows[0];

    if (tokenData.revoked_at) {
      throw new Error('Refresh token has been revoked');
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      throw new Error('Refresh token has expired');
    }

    // Get updated user data
    const userResult = await this.fastify.pg.query<User>(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
      [tokenData.user_id]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = userResult.rows[0];

    // Get updated site roles
    const sitesResult = await this.fastify.pg.query<UserSiteRole>(
      'SELECT site_id, role FROM user_site_roles WHERE user_id = $1',
      [user.id]
    );

    const sites: Record<string, string> = {};
    for (const row of sitesResult.rows) {
      sites[row.site_id] = row.role;
    }

    // Generate new access token
    const accessToken = this.fastify.jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.global_role,
        sites,
      },
      { expiresIn: this.jwtExpiration }
    );

    return accessToken;
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await this.fastify.pg.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = $1',
      [token]
    );
  }

  async getUserById(userId: string): Promise<Omit<User, 'password_hash'> | null> {
    const result = await this.fastify.pg.query<User>(
      'SELECT id, email, global_role, created_at, updated_at, deleted_at FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );

    const user = result.rows[0];
    if (!user) return null;

    // Map global_role to role for frontend compatibility
    return {
      ...user,
      role: user.global_role,
    } as any;
  }

  async grantSiteRole(
    siteId: string,
    userId: string,
    role: 'admin' | 'viewer',
    grantedBy: string
  ): Promise<UserSiteRole> {
    const result = await this.fastify.pg.query<UserSiteRole>(
      `INSERT INTO user_site_roles (site_id, user_id, role, granted_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, site_id)
       DO UPDATE SET role = $3, granted_by = $4, granted_at = NOW()
       RETURNING *`,
      [siteId, userId, role, grantedBy]
    );

    return result.rows[0];
  }

  async revokeSiteRole(siteId: string, userId: string): Promise<void> {
    await this.fastify.pg.query(
      'DELETE FROM user_site_roles WHERE site_id = $1 AND user_id = $2',
      [siteId, userId]
    );
  }

  async getSiteRoles(siteId: string): Promise<UserSiteRole[]> {
    const result = await this.fastify.pg.query<UserSiteRole>(
      'SELECT * FROM user_site_roles WHERE site_id = $1',
      [siteId]
    );

    return result.rows;
  }

  async getUserSiteRole(userId: string, siteId: string): Promise<string | null> {
    const result = await this.fastify.pg.query<{ role: string }>(
      'SELECT role FROM user_site_roles WHERE user_id = $1 AND site_id = $2',
      [userId, siteId]
    );

    return result.rows[0]?.role || null;
  }

  async listUsers(query?: string): Promise<UserListItem[]> {
    const hasQuery = Boolean(query?.trim());

    const result = hasQuery
      ? await this.fastify.pg.query<UserListItem>(
          `SELECT id, email, global_role
           FROM users
           WHERE deleted_at IS NULL
             AND email ILIKE $1
           ORDER BY email ASC
           LIMIT 50`,
          [`%${query?.trim()}%`]
        )
      : await this.fastify.pg.query<UserListItem>(
          `SELECT id, email, global_role
           FROM users
           WHERE deleted_at IS NULL
           ORDER BY email ASC
           LIMIT 50`
        );

    return result.rows;
  }

  async updateUserGlobalRole(
    userId: string,
    globalRole: 'super_admin' | 'user'
  ): Promise<UserListItem | null> {
    const result = await this.fastify.pg.query<UserListItem>(
      `UPDATE users
       SET global_role = $2, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, email, global_role`,
      [userId, globalRole]
    );

    return result.rows[0] || null;
  }

  async softDeleteUser(userId: string): Promise<boolean> {
    const result = await this.fastify.pg.query(
      `UPDATE users
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    return result.rowCount > 0;
  }
}
