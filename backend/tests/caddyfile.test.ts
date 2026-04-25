import { describe, expect, it } from "vitest";

import { parseCaddyfile, rebuildCaddyfile } from "../src/caddyfile.js";

describe("parseCaddyfile", () => {
  it("parses simple site blocks", () => {
    const input = "example.com {\n\treverse_proxy localhost:8080\n}\n";
    const parsed = parseCaddyfile(input);

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].label).toBe("example.com");
    expect(parsed.entries[0].raw).toContain("reverse_proxy");
  });

  it("preserves raw segments around sites", () => {
    const input = "{\n\temail admin@example.com\n}\n\nexample.com {\n\theader X-Test 1\n}\n";
    const parsed = parseCaddyfile(input);
    const output = rebuildCaddyfile(parsed.segments);

    expect(output).toContain("email admin@example.com");
    expect(output).toContain("example.com");
  });

  it("preserves complex directive bodies", () => {
    const input = "example.com {\n\thandle /api/* {\n\t\treverse_proxy localhost:9000\n\t}\n}\n";
    const parsed = parseCaddyfile(input);

    expect(parsed.entries[0].raw).toContain("handle /api/*");
    expect(rebuildCaddyfile(parsed.segments)).toContain("reverse_proxy localhost:9000");
  });
});

