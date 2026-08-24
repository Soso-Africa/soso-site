// Vercel packages this compiled ESM module after the root vercel:build command
// creates it. Keeping the function entrypoint in JavaScript avoids Vercel
// applying its separate TypeScript module-resolution rules to the API source.
import app from "../artifacts/api-server/dist/app.mjs";

export default app;