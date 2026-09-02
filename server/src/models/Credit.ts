import mongoose from "mongoose";

const CreditSchema = new mongoose.Schema(
  {
    numeroCredito: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      set: (value: string) => (value ?? "").replace(/\D/g, "")
    },
    nombre: { type: String, required: true, trim: true },
    clabe: { type: String, required: true, trim: true },
    referencia: { type: String, required: true, trim: true },
    activo: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const Credit = mongoose.model("Credit", CreditSchema);
