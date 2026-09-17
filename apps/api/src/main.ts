import { getConfig } from "@uei/config";
import { createApi } from "./application";

// The last line of defense: without this, an error outside a request handler (e.g. in a
// fire-and-forget promise) is silently swallowed and never appears in any log.
process.on("unhandledRejection", (reason) => console.error("Unhandled rejection:", reason));
process.on("uncaughtException", (error) => console.error("Uncaught exception:", error));

async function main() {
  const config = getConfig();
  const app = await createApi();
  await app.listen(config.PORT, config.HOST);
}
void main();
