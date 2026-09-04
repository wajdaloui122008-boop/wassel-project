const express = require("express");
const adminRouter = require("./routes/admin");

module.exports = function mountAdmin(app) {
  if (!app || typeof app.use !== "function") throw new Error("Express app is required");
  app.use("/admin", adminRouter);
};
