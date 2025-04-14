import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';

dotenv.config();

const DB_CONFIG = {
    dbname: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT
};

const pool = new Pool({
    user: DB_CONFIG.user,
    host: DB_CONFIG.host,
    database: DB_CONFIG.dbname,
    password: DB_CONFIG.password,
    port: parseInt(DB_CONFIG.port), // Convert from string to number
    ssl: {
      rejectUnauthorized: false // Supabase requires this
    }
  });
  

// Set search path to kgp_bus_track
pool.on('connect', async (client) => {
    await client.query('SET search_path TO kgp_bus_track');
});

// Function to initialize tables
const initializeTables = async () => {
    try {
        // Create schema if it doesn't exist
        await pool.query(`CREATE SCHEMA IF NOT EXISTS kgp_bus_track`);

        // Create users table (using username instead of name to match your code)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                password VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                role VARCHAR(100) NOT NULL DEFAULT 'user',
                CHECK(role in ('user', 'admin', 'driver')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create bus stops table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bus_stops (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                latitude DECIMAL(10, 6) NOT NULL,
                longitude DECIMAL(10, 6) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create buses table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS buses (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                stops_cleared INT DEFAULT 0,
                totalRep integer DEFAULT 0,
                currentRep integer DEFAULT 1
            )
        `);

        // Create routes table with id column
        await pool.query(`
            CREATE TABLE IF NOT EXISTS routes (
                id SERIAL PRIMARY KEY,
                bus_id INTEGER REFERENCES buses(id),
                bus_stop_id INTEGER REFERENCES bus_stops(id),
                stop_order INTEGER NOT NULL,
                UNIQUE(bus_id, bus_stop_id, stop_order),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                time_from_start DECIMAL(10, 2) NOT NULL DEFAULT 0
            )
        `);

        // Create or update bus_start_time table with proper primary key
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bus_start_time (
                id SERIAL PRIMARY KEY,
                bus_id INTEGER REFERENCES buses(id) ON DELETE CASCADE,
                start_time TIME NOT NULL DEFAULT CURRENT_TIME,
                rep_no INTEGER NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(bus_id, rep_no)
            )
        `);

        // Create bus drivers table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bus_drivers (
                user_id INTEGER REFERENCES users(id),
                bus_id INTEGER REFERENCES buses(id),
                UNIQUE (user_id, bus_id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create user locations table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_locations (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                latitude DECIMAL(10, 6) NOT NULL,
                longitude DECIMAL(10, 6) NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create bus locations table with retention policy
        await pool.query(`
            CREATE TABLE IF NOT EXISTS locations (
                id SERIAL PRIMARY KEY,
                bus_id INTEGER REFERENCES buses(id),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                latitude DECIMAL(10, 6) NOT NULL,
                longitude DECIMAL(10, 6) NOT NULL
            )
        `);

        // Create index on timestamp for better performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_locations_timestamp 
            ON locations(timestamp)
        `);

        //console.log('Database tables initialized');
    } catch (err) {
        console.error('Error initializing tables:', err.message);
    }
};

// Function to test database connection
const connectDB = async () => {
    try {
        const client = await pool.connect();
        //console.log('PostgreSQL connected');
        client.release();

        await initializeTables();

        // Create admin user if it doesn't exist
        const { createAdminUser } = await import('./createAdminUser.js');
        await createAdminUser();

        // Initialize location cleanup scheduler
        const { initLocationCleanup } = await import('./locationCleanup.js');
        initLocationCleanup();

        console.log('Database connection established and tables initialized');
    } catch (err) {
        console.error('PostgreSQL connection error:', err.message);
        process.exit(1);
    }
};

// Export using ES module syntax
export { pool, connectDB };