import { pool } from './db.js';
import { logger } from '../utilities/logger.js';

/**
 * Cleans up location data older than 24 hours
 * @returns {Promise<number>} Number of deleted rows
 */
export const cleanupOldLocationData = async () => {
    try {
        // First count how many records will be deleted
        const countResult = await pool.query(
            `SELECT COUNT(*) FROM locations WHERE timestamp < NOW() - INTERVAL '1 day'`
        );
        
        const recordsToDelete = parseInt(countResult.rows[0]?.count || '0');
        
        // Then perform the actual deletion
        await pool.query(
            `DELETE FROM locations WHERE timestamp < NOW() - INTERVAL '1 day'`
        );
        
        logger.info(`Cleaned up ${recordsToDelete} old location records`);
        return recordsToDelete;
    } catch (error) {
        logger.error('Error cleaning up old location data:', error);
        return 0;
    }
};

/**
 * Initializes the cleanup scheduler
 */
export const initLocationCleanup = () => {
    // Run immediately on startup
    cleanupOldLocationData();

    // Then schedule to run every hour
    const ONE_HOUR = 60 * 60 * 1000;
    setInterval(cleanupOldLocationData, ONE_HOUR);

    logger.info('Location data cleanup scheduler initialized');
};
