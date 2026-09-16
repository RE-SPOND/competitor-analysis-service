import app from "../dist/server/index.js";

// API requests already arrive with their original /api/... pathname.
export default {
  fetch(request: Request) {
    return app(request);
  },
};
