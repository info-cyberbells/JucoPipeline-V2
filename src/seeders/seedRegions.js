import mongoose from "mongoose";
import Region from "../models/region.model.js";
import dotenv from "dotenv";

dotenv.config();

export const seedRegions = async () => {
    const data = [
        { tier: "Tier 1", strengthLevel: 1, multiplier: 0.96 },
        { tier: "Tier 2", strengthLevel: 2, multiplier: 0.97 },
        { tier: "Tier 3", strengthLevel: 3, multiplier: 0.98 },
        { tier: "Tier 4", strengthLevel: 4, multiplier: 0.99 },
        { tier: "Tier 5", strengthLevel: 5, multiplier: 1.0 },
        { tier: "Tier 6", strengthLevel: 6, multiplier: 1.01 },
        { tier: "Tier 7", strengthLevel: 7, multiplier: 1.02 },
        { tier: "Tier 8", strengthLevel: 8, multiplier: 1.03 },
        { tier: "Tier 9", strengthLevel: 9, multiplier: 1.04 },
        { tier: "Tier 10", strengthLevel: 10, multiplier: 1.05 },
    ];

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    await Region.insertMany(data);
    console.log("✅ Region multipliers seeded");
};

seedRegions();