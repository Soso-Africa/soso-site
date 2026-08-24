import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import test from "node:test";

type Handler = (req: IncomingMessage, res: ServerResponse) => unknown;

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      resolve(address.port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function request(
  port: number,
  path: string,
  headers: Record<string, string> = {},
) {
  return fetch(`http://127.0.0.1:${port}${path}`, { headers });
}

test("serverless adapter forwards the mounted Clerk path and proxy headers", async () => {
  const received: {
    url?: string;
    headers?: Record<string, string | string[] | undefined>;
  } = {};
  const upstream = createServer((req, res) => {
    received.url = req.url;
    received.headers = req.headers;
    res.writeHead(200, { "content-type": "application/javascript" });
    res.end("clerk-proxy-ok");
  });
  const port = await listen(upstream);

  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    CLERK_FAPI_URL: process.env.CLERK_FAPI_URL,
  };
  process.env.NODE_ENV = "production";
  process.env.CLERK_SECRET_KEY = "test-secret";
  process.env.CLERK_FAPI_URL = `http://127.0.0.1:${port}`;

  try {
    const { default: handler } = (await import("../../../api/handler.js")) as {
      default: Handler;
    };
    const adapter = createServer(handler);
    const adapterPort = await listen(adapter);
    const result = await request(
      adapterPort,
      "/api/handler.js?__soso_path=__clerk%2Ffrontend%2Fapi&foo=bar",
      {
        host: "preview.vercel.app",
        "x-forwarded-host": "preview.vercel.app, edge.internal",
        "x-forwarded-proto": "https",
      },
    );

    assert.equal(result.status, 200);
    assert.equal(await result.text(), "clerk-proxy-ok");
    assert.equal(received.url, "/frontend/api?foo=bar");
    assert.equal(received.headers?.["clerk-secret-key"], "test-secret");
    assert.equal(
      received.headers?.["clerk-proxy-url"],
      "https://preview.vercel.app/api/__clerk",
    );
    await close(adapter);
  } finally {
    process.env.NODE_ENV = previous.NODE_ENV;
    process.env.CLERK_SECRET_KEY = previous.CLERK_SECRET_KEY;
    process.env.CLERK_FAPI_URL = previous.CLERK_FAPI_URL;
    await close(upstream);
  }
});

test("development previews bypass the Clerk proxy even when a secret is present", async () => {
  let upstreamRequests = 0;
  const upstream = createServer(() => {
    upstreamRequests += 1;
  });
  const port = await listen(upstream);

  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    CLERK_FAPI_URL: process.env.CLERK_FAPI_URL,
  };
  process.env.NODE_ENV = "development";
  process.env.CLERK_SECRET_KEY = "test-secret";
  process.env.CLERK_FAPI_URL = `http://127.0.0.1:${port}`;

  try {
    const { default: handler } =
      (await import("../../../api/handler.js?development")) as {
        default: Handler;
      };
    const adapter = createServer(handler);
    const adapterPort = await listen(adapter);
    const result = await request(
      adapterPort,
      "/api/handler.js?__soso_path=__clerk%2Ffrontend%2Fapi",
      { host: "preview.replit.dev" },
    );

    assert.equal(result.status, 404);
    assert.equal(upstreamRequests, 0);
    await close(adapter);
  } finally {
    process.env.NODE_ENV = previous.NODE_ENV;
    process.env.CLERK_SECRET_KEY = previous.CLERK_SECRET_KEY;
    process.env.CLERK_FAPI_URL = previous.CLERK_FAPI_URL;
    await close(upstream);
  }
});
