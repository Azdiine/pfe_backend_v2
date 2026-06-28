require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const prisma = require('./config/prisma');
const errorMiddleware = require('./middlewares/error.middleware');

// Import routes
const authRoutes = require('./features/auth/auth.routes');
const profileRoutes = require('./features/profile/profile.routes');
const recommendRoutes = require('./features/recommend/recommend.routes');

const app = express();
const PORT = process.env.PORT || 5000;

// --- Middlewares ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/recommend', recommendRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'SmartNutri API is running', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.url} not found` });
});

// Error handler (must be last)
app.use(errorMiddleware);

// --- Start server ---
const start = async () => {
  await prisma.$connect();
  console.log('✅ Connected to PostgreSQL via Prisma');
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📦 Environment: ${process.env.NODE_ENV}`);
  });
};

start();
