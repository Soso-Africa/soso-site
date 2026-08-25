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
app.use(express.json({
  verify(req, _res, buffer) {
    (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(loadStaffSession);
app.use(requireSameOriginForWrites);

app.use("/api", router);

export default app;
