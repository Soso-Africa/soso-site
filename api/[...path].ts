import app from "../artifacts/api-server/src/app";

// Vercel invokes this catch-all function for /api/* requests. The Replit
// production entrypoint remains separate and continues to own app.listen().
export default app;