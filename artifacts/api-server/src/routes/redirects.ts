import { Router, type IRouter } from "express";
import { redirectsTable, db } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

const router: IRouter = Router();

router.get("/redirects", async (req, res): Promise<void> => {
  const requestedPath = req.query["path"];
  if (
    typeof requestedPath !== "string"
    || !requestedPath.startsWith("/")
    || requestedPath.startsWith("//")
    || requestedPath.length > 512
  ) {
    res.status(400).json({ error: "A valid internal path is required" });
    return;
  }

  const [redirect] = await db
      .select({
        fromPath: redirectsTable.fromPath,
        toPath: redirectsTable.toPath,
        statusCode: redirectsTable.statusCode,
      })
      .from(redirectsTable)
      .where(and(eq(redirectsTable.fromPath, requestedPath), eq(redirectsTable.isPublished, true)))
      .limit(1);

  if (!redirect) {
    res.json({ redirect: null });
    return;
  }

  res.json({ redirect });
});

/**
 * Vercel routes only known legacy URL families here. Keeping the destination
 * lookup in the published redirect table gives staff one governed source of
 * truth while allowing the browser to receive a real permanent redirect.
 */
router.get("/legacy-redirect", async (req, res): Promise<void> => {
  const rawPath = req.query["path"];
  if (
    typeof rawPath !== "string"
    || rawPath.length === 0
    || rawPath.length > 511
    || !/^[A-Za-z0-9/_-]+$/.test(rawPath)
  ) {
    res.status(400).send("Invalid legacy path");
    return;
  }

  const requestedPath = `/${rawPath.replace(/^\/+/, "")}`;
  const alternatePath = requestedPath.endsWith("/")
    ? requestedPath.slice(0, -1)
    : `${requestedPath}/`;
  const candidates = [requestedPath, alternatePath];
  const matches = await db
    .select({
      fromPath: redirectsTable.fromPath,
      toPath: redirectsTable.toPath,
      statusCode: redirectsTable.statusCode,
    })
    .from(redirectsTable)
    .where(and(inArray(redirectsTable.fromPath, candidates), eq(redirectsTable.isPublished, true)))
    .limit(2);
  const redirect = matches.find((match) => match.fromPath === requestedPath) ?? matches[0];

  if (!redirect) {
    res.status(404).send("Legacy redirect not found");
    return;
  }

  res.redirect(redirect.statusCode, redirect.toPath);
});

export default router;