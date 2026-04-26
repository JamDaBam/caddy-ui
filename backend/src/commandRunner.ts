import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Raw stdout/stderr pair returned from validation and reload command providers. */
export interface CommandResult {
  stdout: string;
  stderr: string;
}

/** Wraps child-process failures while preserving captured output for user-facing summaries. */
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

/** Intentionally simple tokenizer for configured commands; supports quoted args but not full shell syntax. */
function tokenize(command: string): string[] {
  return command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((token) => token.replace(/^"|"$/g, "")) ?? [];
}

/** Caps returned output so API error payloads stay readable and bounded. */
export function summarizeCommandOutput(stdout: string, stderr: string): string {
  const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
  return combined.slice(0, 4000);
}

/** Executes configured commands directly without a shell to avoid shell-specific escaping semantics. */
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
