import { gunzipSync } from "node:zlib";

/** Read a JSON request body that the client may have gzipped (see postJson in payload.ts). */
export async function readJson<T>(req: Request): Promise<T> {
  if (req.headers.get("x-body-encoding") === "gzip") {
    const buf = Buffer.from(await req.arrayBuffer());
    return JSON.parse(gunzipSync(buf).toString("utf8")) as T;
  }
  return (await req.json()) as T;
}
