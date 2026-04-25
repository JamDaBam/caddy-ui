import { describe, expect, it } from "vitest";

import { getConfig } from "../src/config.js";

describe("getConfig", () => {
  it("keeps backward-compatible defaults", () => {
    const config = getConfig({});

    expect(config.storageMode).toBe("local-file");
    expect(config.reloadMode).toBe("disabled");
    expect(config.caddyfilePath).toBe("/etc/caddy/Caddyfile");
    expect(config.reloadCommand).toBe("systemctl reload caddy");
  });

  it("maps legacy ENABLE_RELOAD to command mode", () => {
    const config = getConfig({ ENABLE_RELOAD: "true" });

    expect(config.reloadMode).toBe("command");
  });

  it("accepts explicit remote-capable modes", () => {
    const config = getConfig({
      CADDY_STORAGE_MODE: "shared-file",
      CADDY_RELOAD_MODE: "admin-api",
      CADDY_ADMIN_API_URL: "http://remote-caddy:2019/load"
    });

    expect(config.storageMode).toBe("shared-file");
    expect(config.reloadMode).toBe("admin-api");
    expect(config.adminApiUrl).toBe("http://remote-caddy:2019/load");
  });
});
