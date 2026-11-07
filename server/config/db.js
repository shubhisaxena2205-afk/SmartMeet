
const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 15000,
            connectTimeoutMS: 15000,
            socketTimeoutMS: 45000,
            maxPoolSize: 5,
            minPoolSize: 0,
            maxIdleTimeMS: 30000,
            retryReads: true,
            retryWrites: true
        });

        console.log("MongoDB Connected");

        mongoose.connection.on("error", (error) => {
            console.error("MongoDB Runtime Error:", error.message);
        });

        mongoose.connection.on("disconnected", () => {
            console.log("MongoDB Disconnected");
        });

        mongoose.connection.on("reconnected", () => {
            console.log("MongoDB Reconnected");
        });

    } catch (error) {
        console.error("MongoDB Connection Failed:", error);
        process.exit(1);
    }
};

module.exports = connectDB;

