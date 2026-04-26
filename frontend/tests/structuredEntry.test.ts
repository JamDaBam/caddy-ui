import { describe, expect, it } from "vitest";

import { buildStructuredRaw, parseStructuredEntry } from "../src/structuredEntry";

describe("structuredEntry", () => {
  it("parses the supported entry shape into structured fields", () => {
    const result = parseStructuredEntry(
      "example.com, www.example.com",
      [
        "tls {",
        "  issuer acme {",
        "    dir https://acme-v02.api.letsencrypt.org/directory",
        "    email admin@example.com",
        "    trusted_roots /etc/ssl/root.pem",
        "  }",
        "}",
        "",
        "reverse_proxy https://localhost:8443 {",
        "  transport http {",
        "    tls_insecure_skip_verify",
        "  }",
        "}"
      ].join("\n")
    );

    expect(result).toEqual({
      supported: true,
      fields: {
        hostnames: ["example.com", "www.example.com"],
        acmeDirectoryUrl: "https://acme-v02.api.letsencrypt.org/directory",
        tlsEmail: "admin@example.com",
        trustedRootCaPath: "/etc/ssl/root.pem",
        reverseProxyTarget: "https://localhost:8443",
        tlsInsecureSkipVerify: true
      },
      errors: []
    });
  });

  it("builds canonical raw directives for the supported entry shape", () => {
    const result = buildStructuredRaw({
      hostnames: ["example.com", "www.example.com"],
      acmeDirectoryUrl: "https://acme-v02.api.letsencrypt.org/directory",
      tlsEmail: "admin@example.com",
      trustedRootCaPath: "/etc/ssl/root.pem",
      reverseProxyTarget: "https://localhost:8443",
      tlsInsecureSkipVerify: true
    });

    expect(result).toEqual({
      valid: true,
      label: "example.com, www.example.com",
      raw: [
        "tls {",
        "  issuer acme {",
        "    dir https://acme-v02.api.letsencrypt.org/directory",
        "    email admin@example.com",
        "    trusted_roots /etc/ssl/root.pem",
        "  }",
        "}",
        "",
        "reverse_proxy https://localhost:8443 {",
        "  transport http {",
        "    tls_insecure_skip_verify",
        "  }",
        "}"
      ].join("\n"),
      errors: []
    });
  });

  it("reports validation errors when required fields for generation are missing", () => {
    const result = buildStructuredRaw({
      hostnames: [],
      acmeDirectoryUrl: "",
      tlsEmail: "",
      trustedRootCaPath: "",
      reverseProxyTarget: "",
      tlsInsecureSkipVerify: false
    });

    expect(result.valid).toBe(false);
    expect(result.raw).toBe("");
    expect(result.errors).toEqual([
      "At least one hostname is required.",
      "ACME directory URL is required.",
      "Reverse proxy target is required."
    ]);
  });

  it("returns unsupported when unrelated directives are present", () => {
    const result = parseStructuredEntry(
      "example.com",
      [
        "tls {",
        "  issuer acme {",
        "    dir https://acme-v02.api.letsencrypt.org/directory",
        "  }",
        "}",
        "",
        "respond \"hello\""
      ].join("\n")
    );

    expect(result).toEqual({
      supported: false,
      fields: null,
      errors: ["This entry contains directives outside the supported guided pattern."]
    });
  });

  it("parses and generates optional tls_insecure_skip_verify correctly", () => {
    const parseResult = parseStructuredEntry(
      "example.com",
      [
        "tls {",
        "  issuer acme {",
        "    dir https://acme-v02.api.letsencrypt.org/directory",
        "  }",
        "}",
        "",
        "reverse_proxy https://localhost:8443 {",
        "  transport http {",
        "    tls_insecure_skip_verify",
        "  }",
        "}"
      ].join("\n")
    );

    expect(parseResult.supported).toBe(true);
    expect(parseResult.fields?.tlsInsecureSkipVerify).toBe(true);

    const buildResult = buildStructuredRaw({
      hostnames: ["example.com"],
      acmeDirectoryUrl: "https://acme-v02.api.letsencrypt.org/directory",
      tlsEmail: "",
      trustedRootCaPath: "",
      reverseProxyTarget: "https://localhost:8443",
      tlsInsecureSkipVerify: true
    });

    expect(buildResult.raw).toContain("tls_insecure_skip_verify");
  });
});
