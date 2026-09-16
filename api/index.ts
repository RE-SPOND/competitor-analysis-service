// The vinext build emits a standards-based Request handler. Wrapping it in a
// Vercel Function keeps the app-router routes intact without a custom server.
import app from "../dist/server/index.js";

export default {
  fetch(request: Request) {
    // Vercel rewrites the home page to this function. Restore its original
    // pathname before handing it to the vinext router.
    const url = new URL(request.url);
    url.pathname = "/";
    return app(new Request(url, request));
  },
};
