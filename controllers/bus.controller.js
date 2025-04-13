import { pool } from '../config/db.js';
import { ApiError } from '../utilities/ApiError.js';
import { ApiResponse } from '../utilities/ApiResponse.js';
import { asyncHandler } from '../utilities/asyncHandler.js';
import { logger } from '../utilities/logger.js';

// Get all buses
export const getAllBuses = asyncHandler(async (req, res) => {
    logger.info('Fetching all buses');
    
    try {
        const result = await pool.query('SELECT * FROM buses ORDER BY name');
        logger.info(`Found ${result.rows.length} buses`);
        
        return res
            .status(200)
            .json(new ApiResponse(200, result.rows, "Buses fetched successfully"));
    } catch (error) {
        logger.error('Error fetching buses', error);
        throw new ApiError(500, "Error fetching buses from database");
    }
});

// Get bus location
export const getBusLocation = asyncHandler(async (req, res) => {
    const busId = req.params.id;
    logger.info(`Fetching location for bus ID: ${busId}`);
    
    try {
        // Get the most recent location
        const result = await pool.query(
            'SELECT * FROM locations WHERE bus_id = $1 ORDER BY timestamp DESC LIMIT 1',
            [busId]
        );
        
        if (result.rows.length === 0) {
            logger.info(`No location found for bus ID: ${busId}`);
            return res
                .status(500)
                .json(new ApiResponse(404, null, "Bus location not found"));
        }
        
        logger.info(`Location found for bus ID: ${busId}`);
        return res
            .status(200)
            .json(new ApiResponse(200, result.rows[0], "Bus location fetched successfully"));
    } catch (error) {
        logger.error(`Error fetching location for bus ID: ${busId}`, error);
        throw new ApiError(500, "Error fetching bus location from database");
    }
});

// Get bus route information
export const getBusRoute = asyncHandler(async (req, res) => {
    const busId = req.params.id;
    logger.info(`Fetching route for bus ID: ${busId}`);
    
    try {
        // Get all stops for this bus
        const stopResult = await pool.query(
            `SELECT r.stop_order, bs.id, bs.name, bs.latitude, bs.longitude 
             FROM routes r 
             JOIN bus_stops bs ON r.bus_stop_id = bs.id 
             WHERE r.bus_id = $1 
             ORDER BY r.stop_order`,
            [busId]
        );
        
        if (stopResult.rows.length === 0) {
            logger.info(`No route found for bus ID: ${busId}`);
            return res
                .status(404)
                .json(new ApiResponse(404, null, "Bus route not found"));
        }
        
        // Get the most recent location
        const locationResult = await pool.query(
            'SELECT * FROM locations WHERE bus_id = $1 ORDER BY timestamp DESC LIMIT 1',
            [busId]
        );
        
        let currentStop = null;
        let nextStop = null;
        
        if (locationResult.rows.length > 0) {
            const location = locationResult.rows[0];
            const stops = stopResult.rows;
            
            // Determine current and next stop
            // In a real application, you would use more sophisticated logic with geolocation
            // This is a simplified example
            
            // For demo purposes, let's simulate that we're between stops based on bus location
            // Find closest stop to be the "current" stop
            let minDistance = Infinity;
            let closestStopIndex = 0;
            
            for (let i = 0; i < stops.length; i++) {
                const stop = stops[i];
                const distance = calculateDistance(
                    parseFloat(location.latitude), 
                    parseFloat(location.longitude),
                    parseFloat(stop.latitude),
                    parseFloat(stop.longitude)
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closestStopIndex = i;
                }
            }
            
            currentStop = stops[closestStopIndex];
            
            // Next stop is the one after the closest
            // If we're at the last stop, wrap around to the first one (circular route)
            nextStop = stops[(closestStopIndex + 1) % stops.length];
        } else {
            // If no location data, just provide first stop as next stop
            nextStop = stopResult.rows[0];
        }
        
        const routeData = {
            stops: stopResult.rows,
            currentStop,
            nextStop
        };
        
        logger.info(`Route found for bus ID: ${busId} with ${stopResult.rows.length} stops`);
        return res
            .status(200)
            .json(new ApiResponse(200, routeData, "Bus route fetched successfully"));
    } catch (error) {
        logger.error(`Error fetching route for bus ID: ${busId}`, error);
        throw new ApiError(500, "Error fetching bus route from database");
    }
});

// Get bus information including driver
export const getBusInfo = asyncHandler(async (req, res) => {
    const busId = req.params.id;
    logger.info(`Fetching info for bus ID: ${busId}`);
    
    try {
        // Get bus details with driver information
        const result = await pool.query(
            `SELECT b.id, b.name, u.username as driver_name, 
                    bd.user_id as driver_id
             FROM buses b
             LEFT JOIN bus_drivers bd ON b.id = bd.bus_id
             LEFT JOIN users u ON bd.user_id = u.id
             WHERE b.id = $1`,
            [busId]
        );
        
        if (result.rows.length === 0) {
            logger.info(`No info found for bus ID: ${busId}`);
            return res
                .status(404)
                .json(new ApiResponse(404, null, "Bus info not found"));
        }
        
        // Get current location and route info to calculate ETA
        const locationResult = await pool.query(
            'SELECT * FROM locations WHERE bus_id = $1 ORDER BY timestamp DESC LIMIT 1',
            [busId]
        );
        
        const routeResult = await pool.query(
            `SELECT r.stop_order, bs.id, bs.name, bs.latitude, bs.longitude 
             FROM routes r 
             JOIN bus_stops bs ON r.bus_stop_id = bs.id 
             WHERE r.bus_id = $1 
             ORDER BY r.stop_order`,
            [busId]
        );
        
        let estimatedArrival = null;
        
        if (locationResult.rows.length > 0 && routeResult.rows.length > 0) {
            const location = locationResult.rows[0];
            const stops = routeResult.rows;
            
            // Find next stop
            let minDistance = Infinity;
            let closestStopIndex = 0;
            
            for (let i = 0; i < stops.length; i++) {
                const stop = stops[i];
                const distance = calculateDistance(
                    parseFloat(location.latitude), 
                    parseFloat(location.longitude),
                    parseFloat(stop.latitude),
                    parseFloat(stop.longitude)
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closestStopIndex = i;
                }
            }
            
            // Next stop is the one after the closest
            const nextStopIndex = (closestStopIndex + 1) % stops.length;
            const nextStop = stops[nextStopIndex];
            
            // Calculate estimated arrival time (simplified)
            // Assume average speed of 20 km/h (5.56 m/s)
            const averageSpeed = 5.56; // meters per second
            
            const distanceToNextStop = calculateDistance(
                parseFloat(location.latitude), 
                parseFloat(location.longitude),
                parseFloat(nextStop.latitude),
                parseFloat(nextStop.longitude)
            );
            
            // Convert distance (in meters) to time (in minutes)
            estimatedArrival = Math.round(distanceToNextStop / averageSpeed / 60);
        }
        
        const busInfo = {
            ...result.rows[0],
            driverName: result.rows[0].driver_name,
            estimatedArrival
        };
        
        logger.info(`Info found for bus ID: ${busId}`);
        return res
            .status(200)
            .json(new ApiResponse(200, busInfo, "Bus info fetched successfully"));
    } catch (error) {
        logger.error(`Error fetching info for bus ID: ${busId}`, error);
        throw new ApiError(500, "Error fetching bus info from database");
    }
});

// Helper function to calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
}
