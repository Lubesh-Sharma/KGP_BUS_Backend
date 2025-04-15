import { pool } from '../config/db.js';
import { ApiError } from '../utilities/ApiError.js';
import { ApiResponse } from '../utilities/ApiResponse.js';
import { asyncHandler } from '../utilities/asyncHandler.js';
import { logger } from '../utilities/logger.js';

// Get driver's assigned bus with route information
export const getDriverBus = asyncHandler(async (req, res) => {
    // Log the full userData and user objects to debug
    logger.info('Driver controller - req.userData:', req.userData);
    
    // Get userId directly - we now know it's the correct property name
    const userId = req.userData?.userId;
    
    if (!userId) {
        logger.error('Cannot find userId in request', { userData: req.userData });
        throw new ApiError(400, "User ID not found. Please log in again.");
    }
    
    logger.info(`Fetching assigned bus for driver ID: ${userId}`);
    
    try {
        // Get the bus assigned to this driver
        const busResult = await pool.query(
            `SELECT b.*, bd.user_id 
             FROM buses b
             JOIN bus_drivers bd ON b.id = bd.bus_id
             WHERE bd.user_id = $1`,
            [userId]
        );
        
        if (busResult.rows.length === 0) {
            logger.info(`No bus assigned to driver ID: ${userId}`);
            return res.status(404).json(
                new ApiResponse(404, null, "No bus assigned to this driver")
            );
        }
        
        const bus = busResult.rows[0];
        
        // Get the route for this bus (all stops in order)
        const routeResult = await pool.query(
            `SELECT r.id, r.bus_id, r.stop_order, bs.id as stop_id, bs.name, bs.latitude, bs.longitude
             FROM routes r
             JOIN bus_stops bs ON r.bus_stop_id = bs.id
             WHERE r.bus_id = $1
             ORDER BY r.stop_order`,
            [bus.id]
        );
        
        // Get the number of stops cleared
        const stopsCleared = parseInt(bus.stops_cleared || 0);
        
        // Determine last cleared stop and next stop
        let lastClearedStop = null;
        let nextStop = null;
        
        if (routeResult.rows.length > 0) {
            const stops = routeResult.rows;
            
            // If stopsCleared is 0, the last cleared stop is the last one in the route (circular)
            // and the next stop is the first in the route
            if (stopsCleared === 0) {
                lastClearedStop = stops[stops.length - 1];
                nextStop = stops[0];
            } else {
                // Normalize stopsCleared to be within the route length (for circular routes)
                const normalizedStopsCleared = stopsCleared % stops.length;
                // Last cleared stop is the one at index (normalizedStopsCleared - 1)
                lastClearedStop = stops[normalizedStopsCleared - 1];
                // Next stop is the one at index normalizedStopsCleared
                nextStop = stops[normalizedStopsCleared % stops.length];
            }
        }
        
        const response = {
            bus,
            route: routeResult.rows,
            stopsCleared,
            lastClearedStop,
            nextStop
        };
        
        logger.info(`Found bus and route for driver ID: ${userId}`);
        return res.status(200).json(
            new ApiResponse(200, response, "Driver bus information fetched successfully")
        );
    } catch (error) {
        logger.error(`Error fetching bus for driver ID: ${userId}`, error);
        throw new ApiError(500, "Error fetching driver bus information");
    }
});

// Update bus location
export const updateLocation = asyncHandler(async (req, res) => {
    // Get userId directly
    const userId = req.userData?.userId;
    
    if (!userId) {
        logger.error('Cannot find userId in request', { userData: req.userData });
        throw new ApiError(400, "User ID not found. Please log in again.");
    }
    
    const { busId, latitude, longitude } = req.body;
    
    if (!busId || !latitude || !longitude) {
        throw new ApiError(400, "Bus ID, latitude and longitude are required");
    }
    
    logger.info(`Updating location for bus ID: ${busId} by driver ID: ${userId}`);
    
    try {
        // Verify this driver is assigned to this bus
        const verifyResult = await pool.query(
            `SELECT * FROM bus_drivers WHERE user_id = $1 AND bus_id = $2`,
            [userId, busId]
        );
        
        if (verifyResult.rows.length === 0) {
            logger.warn(`Driver ID ${userId} attempted to update location for unassigned bus ID: ${busId}`);
            throw new ApiError(403, "You are not assigned to this bus");
        }
        
        // Insert new location
        const result = await pool.query(
            `INSERT INTO locations (bus_id, latitude, longitude)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [busId, latitude, longitude]
        );
        
        logger.info(`Location updated for bus ID: ${busId}`);
        return res.status(200).json(
            new ApiResponse(200, result.rows[0], "Bus location updated successfully")
        );
    } catch (error) {
        logger.error(`Error updating location for bus ID: ${busId}`, error);
        throw new ApiError(500, "Error updating bus location");
    }
});

// Mark a bus stop as cleared (increment stops_cleared counter)
export const clearStop = asyncHandler(async (req, res) => {
    // Get userId directly
    const userId = req.userData?.userId;
    
    if (!userId) {
        logger.error('Cannot find userId in request', { userData: req.userData });
        throw new ApiError(400, "User ID not found. Please log in again.");
    }
    
    const { busId, stopId } = req.body;
    
    if (!busId || !stopId) {
        throw new ApiError(400, "Bus ID and stop ID are required");
    }
    
    logger.info(`Marking stop ID: ${stopId} as cleared for bus ID: ${busId} by driver ID: ${userId}`);
    
    try {
        // Verify this driver is assigned to this bus
        const verifyResult = await pool.query(
            `SELECT * FROM bus_drivers WHERE user_id = $1 AND bus_id = $2`,
            [userId, busId]
        );
        
        if (verifyResult.rows.length === 0) {
            logger.warn(`Driver ID ${userId} attempted to clear stop for unassigned bus ID: ${busId}`);
            throw new ApiError(403, "You are not assigned to this bus");
        }
        
        // Verify this stop is in the bus's route
        const routeResult = await pool.query(
            `SELECT * FROM routes WHERE bus_id = $1 AND bus_stop_id = $2`,
            [busId, stopId]
        );
        
        if (routeResult.rows.length === 0) {
            logger.warn(`Stop ID ${stopId} is not in the route for bus ID: ${busId}`);
            throw new ApiError(404, "This stop is not in the route for this bus");
        }
        
        // Get total number of stops in the route
        const totalStopsResult = await pool.query(
            `SELECT COUNT(*) as total_stops FROM routes WHERE bus_id = $1`,
            [busId]
        );
        
        const totalStops = parseInt(totalStopsResult.rows[0].total_stops);
        
        // Get current stop information
        const currentStopResult = await pool.query(
            `SELECT stop_order FROM routes WHERE bus_id = $1 AND bus_stop_id = $2`,
            [busId, stopId]
        );
        
        const currentStopOrder = parseInt(currentStopResult.rows[0].stop_order);
        
        let result;
        
        // Check if this is the last stop in the route
        if (currentStopOrder === totalStops) {
            // Last stop in the route - increment currentRep and reset stops_cleared to 1
            result = await pool.query(
                `UPDATE buses 
                 SET stops_cleared = 0, currentRep = currentRep + 1 
                 WHERE id = $1 
                 RETURNING *`,
                [busId]
            );
            logger.info(`Last stop reached for bus ID: ${busId}. Incrementing currentRep and resetting stops_cleared.`);
        } else {
            // Not the last stop - just increment stops_cleared as before
            result = await pool.query(
                `UPDATE buses SET stops_cleared = stops_cleared + 1 WHERE id = $1 RETURNING *`,
                [busId]
            );
        }
        
        return res.status(200).json(
            new ApiResponse(
                200, 
                result.rows[0], 
                currentStopOrder === totalStops ? 
                    "Last bus stop cleared, new repetition started" : 
                    "Bus stop marked as cleared"
            )
        );
    } catch (error) {
        logger.error(`Error clearing stop for bus ID: ${busId}`, error);
        throw new ApiError(500, "Error marking bus stop as cleared");
    }
});
