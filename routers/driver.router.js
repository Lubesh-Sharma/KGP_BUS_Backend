import { Router } from 'express';
import { 
  getDriverBus,
  updateLocation,
  clearStop
} from '../controllers/driver.controller.js';
import { driverApiAuth } from '../middleware/driverAuth.middleware.js';
import { logger } from '../utilities/logger.js';

const router = Router();

// Add driver authentication middleware
router.use(driverApiAuth);

// Log when router is initialized
logger.info('Driver router initialized');

// Get driver's assigned bus
router.get('/my-bus', getDriverBus);

// Update bus location
router.post('/update-location', updateLocation);

// Mark a bus stop as cleared
router.post('/clear-stop', clearStop);

export default router;
