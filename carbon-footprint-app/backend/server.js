// Import required packages
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// Initialize Express app
const app = express();
const port = 3000;

// --- CONFIGURATION ---
const JWT_SECRET = 'your-super-secret-key-that-should-be-long-and-random'; // Use a long, random string here
const OTP_EXPIRY_MINUTES = 10;

// Middleware
app.use(cors());
app.use(express.json());

// --- MongoDB Connection ---
const mongoUrl = 'mongodb://127.0.0.1:27017';
const dbName = 'carbon-footprint-db';
let db;

async function connectDB() {
    try {
        const client = new MongoClient(mongoUrl);
        await client.connect();
        db = client.db(dbName);
        console.log(`✅ Successfully connected to local MongoDB: ${dbName}`);
        await seedDatabase();
    } catch (err) {
        console.error('❌ Could not connect to MongoDB', err);
        process.exit(1);
    }
}

// --- Nodemailer Email Transporter ---
// IMPORTANT: Replace with your own email credentials
const transporter = nodemailer.createTransport({
    service: 'gmail', // Or another email service
    auth: {
        user: 'sakshichaudhary6498@gmail.com', // 👈 YOUR GMAIL
        pass: 'ozzj bqjg zwof ppmn',   // 👈 YOUR 16-DIGIT APP PASSWORD
    },
});

// --- Helper Functions ---
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
}

// --- Middleware to verify JWT ---
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) return res.sendStatus(401); // If no token, unauthorized

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // If token is invalid, forbidden
        req.userId = user.id; // Add user ID to the request object
        next();
    });
}


// --- AUTH API ROUTES ---

// 1. User Signup/Login: Generate and send OTP
app.post('/auth/login', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    try {
        const users = db.collection('users');
        let user = await users.findOne({ email });

        // If user doesn't exist, create a new one
        if (!user) {
            const newUser = { email, createdAt: new Date() };
            const result = await users.insertOne(newUser);
            user = await users.findOne({ _id: result.insertedId });
        }

        const otp = generateOtp();
        const otpExpiry = new Date(new Date().getTime() + OTP_EXPIRY_MINUTES * 60000);

        // Store OTP and expiry in the user's document
        await users.updateOne({ _id: user._id }, { $set: { otp, otpExpiry } });

        // Send the OTP email
        await transporter.sendMail({
            from: '"Carbon Tracker" <sakshichaudhary6498@gmail.com>',
            to: email,
            subject: 'Your Login Code for Carbon Tracker',
            html: `<p>Your One-Time Password is: <b>${otp}</b></p><p>It will expire in ${OTP_EXPIRY_MINUTES} minutes.</p>`,
        });

        res.status(200).json({ message: 'OTP sent to your email.' });
    } catch (err) {
        console.error('Error in /auth/login:', err);
        res.status(500).json({ error: 'Failed to send OTP.' });
    }
});


// 2. Verify OTP and Generate JWT
app.post('/auth/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required.' });

    try {
        const users = db.collection('users');
        const user = await users.findOne({ email });

        if (!user) return res.status(404).json({ error: 'User not found.' });
        if (user.otp !== otp) return res.status(400).json({ error: 'Invalid OTP.' });
        if (new Date() > new Date(user.otpExpiry)) return res.status(400).json({ error: 'OTP has expired.' });

        // OTP is valid, clear it from the database
        await users.updateOne({ _id: user._id }, { $unset: { otp: "", otpExpiry: "" } });

        // Generate a JWT
        const token = jwt.sign({ id: user._id.toString() }, JWT_SECRET, { expiresIn: '7d' });

        res.status(200).json({ message: 'Login successful!', token });
    } catch (err) {
        console.error('Error in /auth/verify-otp:', err);
        res.status(500).json({ error: 'Failed to verify OTP.' });
    }
});

app.get('/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await db.collection('users').findOne(
            { _id: new ObjectId(req.userId) },
            { projection: { email: 1, _id: 0 } } // Only return the email field
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }
        res.status(200).json(user);
    } catch (err) {
        console.error('Error fetching user profile:', err);
        res.status(500).json({ error: 'Failed to fetch user profile.' });
    }
});
// --- SECURED ACTIVITY API ROUTES ---

// GET all activities for the logged-in user
app.get('/activities', authenticateToken, async (req, res) => { // Added authenticateToken middleware
    try {
        const activities = await db.collection('activities')
            .find({ userId: new ObjectId(req.userId) }) // Filter by userId
            .sort({ createdAt: -1 })
            .toArray();
        res.status(200).json(activities);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve activities' });
    }
});

// POST a new activity for the logged-in user
app.post('/activities', authenticateToken, async (req, res) => { // Added authenticateToken middleware
    try {
        const { activity_type, amount } = req.body;
        // ... (rest of the logic is the same)
        const emissionFactorDoc = await db.collection('emissionFactors').findOne({ name: activity_type });
        if (!emissionFactorDoc) return res.status(404).json({ error: 'Emission factor not found.' });

        const emission = parseFloat(amount) * emissionFactorDoc.factor;

        const newActivity = {
            userId: new ObjectId(req.userId), // Associate activity with the user
            activity_type,
            amount: parseFloat(amount),
            unit: emissionFactorDoc.unit.split('/')[1],
            emission: parseFloat(emission.toFixed(2)),
            createdAt: new Date(),
        };

        const result = await db.collection('activities').insertOne(newActivity);
        const savedActivity = await db.collection('activities').findOne({ _id: result.insertedId });
        res.status(201).json(savedActivity);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to log activity.' });
    }
});

// --- AI/Helper API Routes ---

// GET AI-powered recommendation
app.get('/api/recommendation', authenticateToken, async (req, res) => {
    try {
        const activities = await db.collection('activities')
            .find({ userId: new ObjectId(req.userId) })
            .sort({ emission: -1 }) // Find the highest emission activity
            .limit(1)
            .toArray();

        if (activities.length === 0) {
            return res.json({ tip: "Log your first activity to get a personalized tip!" });
        }

        const topActivity = activities[0].activity_type;

        const tips = {
            car_petrol: "Try carpooling or using public transport once a week to reduce your travel emissions.",
            flight_short: "For your next short trip, consider traveling by train or bus instead of flying.",
            electricity: "Unplug electronics when not in use and switch to energy-efficient LED bulbs.",
            beef: "Try swapping beef for chicken or plant-based proteins for a couple of meals this week.",
            chicken: "Opt for a meat-free Monday to reduce your dietary carbon footprint.",
            default: "Review your daily habits! Small changes like turning off lights can make a big difference."
        };

        const recommendation = tips[topActivity] || tips.default;
        res.json({ tip: recommendation });

    } catch (error) {
        console.error("Error fetching recommendation:", error);
        res.status(500).json({ error: "Could not fetch recommendation." });
    }
});

// POST to chatbot
app.post('/api/chatbot', authenticateToken, (req, res) => {
    const { message } = req.body;
    const lowerCaseMessage = message.toLowerCase();

    let reply = "I'm not sure how to answer that. Try asking about reducing waste, saving energy, or sustainable travel.";

    if (lowerCaseMessage.includes('waste')) {
        reply = "To reduce waste, focus on the 3 R's: Reduce, Reuse, and Recycle. Avoid single-use plastics and compost food scraps if you can.";
    } else if (lowerCaseMessage.includes('energy')) {
        reply = "Saving energy at home is easy! Lower your thermostat in the winter, use smart power strips, and ensure your home is well-insulated.";
    } else if (lowerCaseMessage.includes('travel')) {
        reply = "For sustainable travel, choose direct flights when possible, pack light, and use public transportation at your destination.";
    } else if (lowerCaseMessage.includes('hello') || lowerCaseMessage.includes('hi')) {
        reply = "Hello! How can I help you be more sustainable today?";
    }

    res.json({ reply });
});


// --- Database Seeding (No changes here) ---
async function seedDatabase() {
    // ... (keep the existing seedDatabase function as is)
}

// --- Start the Server ---
async function startServer() {
    await connectDB();
    app.listen(port, () => {
        console.log(`🚀 Server is running on http://localhost:${port}`);
    });
}

startServer();