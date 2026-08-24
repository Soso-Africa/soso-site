import { Router, type IRouter } from "express";
import { redirectsTable, db } from "@workspace/db";
import { eq } from "drizzle-orm";

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

<<<<<<< HEAD
  try {
    const [redirect] = await db
      .select({
        fromPath: redirectsTable.fromPath,
        toPath: redirectsTable.toPath,
        statusCode: redirectsTable.statusCode,
      })
      .from(redirectsTable)
      .where(eq(redirectsTable.fromPath, requestedPath))
      .limit(1);

    if (!redirect) {
      res.json({ redirect: null });
      return;
    }

    res.json({ redirect });
  } catch (error) {
    // Redirects are an optional convenience layer. A schema or permission
    // issue must never make a public storefront route unavailable.
    req.log?.warn({ err: error }, "Redirect lookup unavailable");
    res.json({ redirect: null });
  }
=======
  const [redirect] = await db
    .select({
      fromPath: redirectsTable.fromPath,
      toPath: redirectsTable.toPath,
      statusCode: redirectsTable.statusCode,
    })
    .from(redirectsTable)
    .where(eq(redirectsTable.fromPath, requestedPath))
    .limit(1);

  if (!redirect) {
    res.json({ redirect: null });
    return;
  }

  res.json({ redirect });
>>>>>>> github/main
});

export default router;