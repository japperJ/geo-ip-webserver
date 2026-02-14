# Database Migrations

This directory contains SQL migrations managed by `node-pg-migrate`.

## Commands

### Create a new migration
```bash
npm run migrate:create -- migration-name
```

### Run all pending migrations
```bash
npm run migrate:up
```

### Rollback last migration
```bash
npm run migrate:down
```

### Check migration status
```bash
npm run migrate:up -- --dry-run
```

## Migration Naming Convention

- Use descriptive names: `create-users-table`, `add-email-index`
- Use kebab-case
- Be specific about what changes

## Migration Best Practices

1. **Always include DOWN migration** - Comment it out at the bottom of the file
2. **Test rollbacks** - Ensure DOWN migration works correctly
3. **Atomic changes** - One logical change per migration
4. **Add comments** - Explain WHY, not just WHAT
5. **Add indexes** - Include all necessary indexes in the migration
6. **Use constraints** - Enforce data integrity at database level

## Current Migrations

1. **sites-table** - Creates sites table with PostGIS geofencing columns
2. **access-logs-table** - Creates partitioned access_logs table
3. **geospatial-functions** - Creates ST_Covers and radius checking functions
