import app from "../artifacts/api-server/dist/app.mjs";

function restoreApiPath(req, res) {
  const requestUrl = new URL(req.url ?? "/", "https://soso.invalid");
  const encodedPath = requestUrl.searchParams.get("__soso_path") ?? "";
  requestUrl.searchParams.delete("__soso_path");

  const segments = encodedPath
    .split("/")
    .filter(Boolean);

  if (segments.some((segment) => segment === "." || segment === "..")) {
    res.statusCode = 400;
    res.end("Invalid API path");
    return false;
  }

  const path = segments.map((segment) => encodeURIComponent(segment)).join("/");
  req.url = `/api${path ? `/${path}` : ""}${requestUrl.search}`;
  return true;
}

export default function handler(req, res) {
  if (!restoreApiPath(req, res)) return;
  return app(req, res);
}