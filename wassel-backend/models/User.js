const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["client", "livreur", "taxi", "admin"], required: true },
  country: { type: String, default: "TN", maxlength: 2 },
  phone: { type: String, default: "", maxlength: 30 },
  isOnline: { type: Boolean, default: false },
  isAvailable: { type: Boolean, default: false },
  location: {
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
    updatedAt: { type: Date },
  },
  createdAt: { type: Date, default: Date.now },
});

userSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    delete ret.password;
  },
});

module.exports = mongoose.model("User", userSchema);
