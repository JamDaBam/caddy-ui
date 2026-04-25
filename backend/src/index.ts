import { createServer } from "node:http";

import { createApp } from "./app.js";
import { CaddyService } from "./caddyService.js";
import { getConfig } from "./config.js";

const config = getConfig();
const service = new CaddyService(config);
const app = createApp(service);

createServer(app).listen(config.port, () => {
  console.log(`Caddy UI backend listening on port ${config.port}`);
});

