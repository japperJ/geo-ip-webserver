import cron from 'node-cron';
import { pool } from '../db/index.js';
import { s3Service } from '../services/S3Service.js';

/**
 * GDPR-compliant log retention cron job
 * 
 * Runs daily at 2 AM to delete logs and artifacts older than 90 days
 * 
 * Phase 4: Full implementation with S3 cleanup
 */
export function startLogRetentionJob() {
  // Run every day at 2 AM
  cron.schedule('0 2 * * *', async () => {
    const startTime = Date.now();
    console.log('[Log Retention] Running GDPR log retention job...');

    const client = await pool.connect();

    try {
      const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '90');
      
      await client.query('BEGIN');

      // Get all logs with screenshots that will be deleted
      const screenshotResult = await client.query(`
        SELECT screenshot_url 
        FROM access_logs 
        WHERE timestamp < NOW() - INTERVAL '${retentionDays} days'
          AND screenshot_url IS NOT NULL
      `);

      // Delete screenshots from S3
      let artifactsDeleted = 0;
      for (const row of screenshotResult.rows) {
        try {
          const key = s3Service.extractKeyFromUrl(row.screenshot_url);
          if (key) {
            await s3Service.deleteFile(key);
            artifactsDeleted++;
          }
        } catch (err) {
          console.error(`[Log Retention] Failed to delete S3 artifact: ${row.screenshot_url}`, err);
        }
      }

      // Delete old logs
      const deleteResult = await client.query(`
        DELETE FROM access_logs 
        WHERE timestamp < NOW() - INTERVAL '${retentionDays} days'
      `);

      const recordsDeleted = deleteResult.rowCount || 0;

      // Log the retention run
      await client.query(`
        INSERT INTO data_retention_logs (run_date, records_deleted, artifacts_deleted, duration_ms, status)
        VALUES (CURRENT_DATE, $1, $2, $3, 'success')
        ON CONFLICT (run_date) DO UPDATE
        SET records_deleted = $1, artifacts_deleted = $2, duration_ms = $3, status = 'success'
      `, [recordsDeleted, artifactsDeleted, Date.now() - startTime]);

      await client.query('COMMIT');

      console.log(`[Log Retention] ✅ Deleted ${recordsDeleted} logs and ${artifactsDeleted} artifacts older than ${retentionDays} days`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[Log Retention] ❌ Failed to run log retention job:', error);

      // Log the failure
      try {
        await client.query(`
          INSERT INTO data_retention_logs (run_date, records_deleted, artifacts_deleted, duration_ms, status, error_message)
          VALUES (CURRENT_DATE, 0, 0, $1, 'failed', $2)
          ON CONFLICT (run_date) DO UPDATE
          SET status = 'failed', error_message = $2, duration_ms = $1
        `, [Date.now() - startTime, (error as Error).message]);
      } catch (logError) {
        console.error('[Log Retention] Failed to log retention error:', logError);
      }
    } finally {
      client.release();
    }
  });

  console.log('[Log Retention] GDPR log retention job scheduled (daily at 2 AM, 90-day retention)');
}
