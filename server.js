import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bodyParser from 'body-parser';
import session from 'express-session';
import dotenv from 'dotenv';
import { connectDB } from "./config/db.js";

// Routes
import authenticationRouter from "./routers/authentication.router.js";
import redirectRouter from "./routers/redirect.router.js";
import adminRouter from "./routers/admin.router.js";
import busStopRouter from "./routers/user.router.js";
import busRouter from "./routers/bus.router.js";
import driverRouter from "./routers/driver.router.js";
import abusrouteRouter from './routers/abusroute.router.js';
import busStopsViewRouter from './routers/busStopsView.router.js';
import profileRouter from "./routers/profile.router.js";

dotenv.config();
const app = express();

// Connect to PostgreSQL
connectDB();

app.use(bodyParser.json({ limit: '5mb' }));
app.get("/", (req, res) => res.send({ message: "KGP Bus Service API" }));

const frontendURL = process.env.FRONTEND_URL_LOCAL;

app.use(
  cors({
    origin: [frontendURL], // Allow both production and local frontend
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], // Add OPTIONS for preflight
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Range', 'X-Content-Range']
  })
);

// Handle preflight OPTIONS requests
// app.options('*', cors());

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    secure: false,
    sameSite: 'lax'
  }
}));

// Register routes
app.use('/', authenticationRouter);
app.use('/', redirectRouter);
app.use('/admin', adminRouter);
app.use('/bus_stops', busStopRouter);
app.use('/buses', busRouter);
app.use('/driver', driverRouter);
app.use('/abusroute', abusrouteRouter);
app.use('/busStopsView', busStopsViewRouter);
app.use('/profile', profileRouter);

// Start server
const PORT = process.env.PORT;
app.listen(PORT, () => {
  //console.log(`Server running on port ${PORT}`);
  //console.log(`Frontend URL: ${frontendURL}`);
});

export default app;