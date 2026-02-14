import cron from 'node-cron';
import { pool } from '../db/index.js';

/**
 * Log retention cron job
 * 
 * Runs daily at 2 AM to delete logs older than retention period
 * 
 * MVP: Placeholder (logs message only)
 * Phase 4: Implement actual deletion
 */
export function startLogRetentionJob() {
  // Run every day at 2 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('[Log Retention] Running log retention job...');

    try {
      const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '90');
      
      // MVP: Just count how many logs would be deleted
      const result = await pool.query(`
        SELECT COUNT(*) 
        FROM access_logs 
        WHERE timestamp < NOW() - INTERVAL '${retentionDays} days'
      `);

      const count = parseInt(result.rows[0].count);
      console.log(`[Log Retention] Would delete ${count} logs older than ${retentionDays} days`);

      // TODO Phase 4: Implement actual deletion
      // await pool.query(`
      //   DELETE FROM access_logs 
      //   WHERE timestamp < NOW() - INTERVAL '${retentionDays} days'
      // `);
      
    } catch (error) {
      console.error('[Log Retention] Failed to run log retention job:', error);
    }
  });

  console.log('[Log Retention] Log retention job scheduled (daily at 2 AM)');
}
