import { access, readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const configFlagIndex = args.indexOf("--config");

if (configFlagIndex === -1 || !args[configFlagIndex + 1]) {
  console.error("missing --config path");
  process.exit(1);
}

const configPath = args[configFlagIndex + 1];
const candidate = await readFile(configPath, "utf8");
const trustedRoots = Array.from(candidate.matchAll(/^\s*trusted_roots\s+("?)([^"\n]+)\1\s*$/gm), (match) => match[2]);

for (const trustedRootPath of trustedRoots) {
  try {
    await access(trustedRootPath);
  } catch {
    console.error(
      `Error: loading http app module: provision http: getting tls app: loading tls app module: provision tls: provisioning automation policy 0: loading TLS automation management module: position 0: loading module 'acme': provision tls.issuance.acme: loading trusted root CA's PEM file: ${trustedRootPath}: open ${trustedRootPath}: no such file or directory`
    );
    process.exit(1);
  }
}

console.log(`validated ${configPath}`);
