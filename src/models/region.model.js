import mongoose from "mongoose";

const regionSchema = new mongoose.Schema(
  {
    tier: {
      type: String,
      required: true,
      unique: true, // "Tier 1", "Tier 2" etc.
      trim: true,
    },

    strengthLevel: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },

    multiplier: {
      type: Number,
      required: true,
      min: 0.9,   // safety bounds
      max: 1.1,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Region", regionSchema);
