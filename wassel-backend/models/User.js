const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true }, // stored as a bcrypt hash, never plain text
  role: { type: String, enum: ["client", "livreur", "taxi"], required: true },
  country: { type: String, default: "TN" },
  phone: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

userSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    delete ret.password; // never send the hash back to the client
  },
});

module.exports = mongoose.model("User", userSchema);