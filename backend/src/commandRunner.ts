import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export class CommandExecutionError extends Error {
  stdout: string;
  stderr: string;

  constructor(message: string, stdout: string, stderr: string) {
    super(message);
    this.name = "CommandExecutionError";
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

function tokenize(command: string): string[] {
  return command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((token) => token.replace(/^"|"$/g, "")) ?? [];
}

export function summarizeCommandOutput(stdout: string, stderr: string): string {
  const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
  return combined.slice(0, 4000);
}

export async function runCommand(template: string, configPath?: string): Promise<CommandResult> {
  const command = configPath ? template.replaceAll("{config}", configPath) : template;
  const parts = tokenize(command);
  if (parts.length === 0) {
    throw new Error("Command is empty");
  }

  const [file, ...args] = parts;
  try {
    const result = await execFileAsync(file, args, { encoding: "utf8" });
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? ""
    };
  } catch (error) {
    const stdout = typeof error === "object" && error && "stdout" in error ? String(error.stdout ?? "") : "";
    const stderr = typeof error === "object" && error && "stderr" in error ? String(error.stderr ?? "") : "";
    const message = error instanceof Error ? error.message : "Command execution failed";
    throw new CommandExecutionError(message, stdout, stderr);
  }
}
