import mongoose from "mongoose";

const WeeklyTipImageSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    mediaUrl: { type: String, required: true },
    mimeType: { type: String, required: true }
  },
  { timestamps: true }
);

const WeeklyTipSchema = new mongoose.Schema(
  {
    tipText: { type: String, default: "" },
    images: { type: [WeeklyTipImageSchema], default: [] },
    active: { type: Boolean, default: false, index: true }
  },
  { timestamps: true }
);

export const WeeklyTip = mongoose.model("WeeklyTip", WeeklyTipSchema);

