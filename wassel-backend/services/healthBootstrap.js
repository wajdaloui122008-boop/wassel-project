const express = require("express");

if (!express.application.__veltoHealthPatched) {
  express.application.__veltoHealthPatched = true;
  const originalListen = express.application.listen;
  express.application.listen = function veltoListenWithHealth(...args) {
    if (!this.__veltoHealthMounted) {
      this.__veltoHealthMounted = true;
      this.get("/health", (_req, res) => res.status(200).json({ ok: true, service: "wassel-backend", timestamp: new Date().toISOString() }));
    }
    return originalListen.apply(this, args);
  };
}
