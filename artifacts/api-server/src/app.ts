import express, { type Express } from "express";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import router from "./routes";
import { logger } from "./lib/logger";
import { ensurePlatformContent } from "./lib/platform-content";
import { requireSameOriginForWrites } from "./middlewares/sameOriginWrite";
import { loadStaffSession } from "./middlewares/staff";

const app: Express = express();
let initialization: Promise<void> | null = null;

export function initializeApi(): Promise<void> {
  if (!initialization) {
    initialization = ensurePlatformContent().catch((error) => {
      initialization = null;
      throw error;
    });
  }
  return initialization;
}

app.set("trust proxy", 1);
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cookieParser());
function preserveRawBody(req: express.Request, _res: express.Response, buffer: Buffer) {
  (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
}

// The complete-document escape hatch retains its bounded allowance.
// Scoped section and product writes use the default smaller JSON budget.
app.put("/api/staff/content/platform", express.json({ limit: "1mb", verify: preserveRawBody }));
app.use(express.json({ verify: preserveRawBody }));
app.use(express.urlencoded({ extended: true }));
app.use(loadStaffSession);
app.use(requireSameOriginForWrites);

app.use("/api", router);

app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error && typeof error === "object" && "type" in error && error.type === "entity.too.large") {
    res.status(413).json({
      error: req.method === "PUT" && req.path === "/api/staff/content/platform"
        ? "This complete draft exceeds the 1 MB save limit. Save products or sections individually; uploaded photos do not need to be re-uploaded."
        : req.path.startsWith("/api/staff/content/platform/")
          ? "This section or product exceeds the request limit. Remove embedded content; uploaded photos do not need to be re-uploaded."
          : "Request body is too large.",
    });
    return;
  }
  next(error);
});

export default app;
