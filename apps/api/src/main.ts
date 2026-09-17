import { getConfig } from "@uei/config";
import { createApi } from "./application";

async function main() {
  const config = getConfig();
  const app = await createApi();
  await app.listen(config.PORT, config.HOST);
}
void main();
