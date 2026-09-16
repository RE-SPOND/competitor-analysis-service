// The vinext build emits a standards-based Request handler. Wrapping it in a
// Vercel Function keeps the app-router routes intact without a custom server.
import app from "../dist/server/index.js";

export default {
  fetch(request: Request) {
    return app(request);
  },
};
