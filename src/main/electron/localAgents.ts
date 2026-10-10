import { spawn, spawnSync } from "node:child_process";
import os from "node:os";

export interface LocalAgent {
  id: string;
  label: string;
  defaultModel: string;
}

const EXTRA_PATH_DIRS = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/local/sbin",
  `${os.homedir()}/.local/bin`,
  `${os.homedir()}/.cargo/bin`,
  `${os.homedir()}/.bun/bin`,
  "/opt/homebrew/opt/node@20/bin",
  "/opt/homebrew/opt/node@22/bin",
];

const AGENTS = {
  codex: { label: "Codex", command: "codex", args: (prompt: string) => ["exec", "--sandbox", "workspace-write", "--skip-git-repo-check", prompt] },
  claude: { label: "Claude", command: "claude", args: (prompt: string) => ["-p", "--dangerously-skip-permissions", prompt] },
  copilot: { label: "Copilot", command: "copilot", args: (prompt: string) => ["--allow-all", "--prompt", prompt] },
  gemini: { label: "Gemini", command: "gemini", args: (prompt: string) => ["--dangerously-skip-permissions", "--print", prompt] },
  agy: { label: "AGY", command: "agy", args: (prompt: string) => ["--dangerously-skip-permissions", "-p", prompt] },
  hermes: { label: "Hermes", command: "hermes", args: (prompt: string) => ["--yolo", "--oneshot", prompt] },
  ollama: { label: "Ollama", command: "ollama", args: (prompt: string, model: string) => ["run", model, prompt] },
} as const;

type AgentId = keyof typeof AGENTS;

export function localAgentEnvironment(): NodeJS.ProcessEnv {
  const paths = (process.env.PATH || "").split(":").filter(Boolean);
  for (const directory of EXTRA_PATH_DIRS) {
    if (!paths.includes(directory)) paths.push(directory);
  }
  return { ...process.env, PATH: paths.join(":") };
}

function isAvailable(command: string): boolean {
  return spawnSync("which", [command], {
    env: localAgentEnvironment(),
    stdio: "ignore",
  }).status === 0;
}

function ollamaDefaultModel(): string {
  const result = spawnSync("ollama", ["list"], {
    env: localAgentEnvironment(),
    encoding: "utf8",
    timeout: 5_000,
  });
  if (result.status !== 0) return "";
  return result.stdout.split(/\r?\n/).slice(1).map((line) => line.trim().split(/\s+/)[0]).find(Boolean) || "";
}

export function listLocalAgents(): LocalAgent[] {
  return (Object.entries(AGENTS) as Array<[AgentId, (typeof AGENTS)[AgentId]]>)
    .filter(([, agent]) => isAvailable(agent.command))
    .flatMap(([id, agent]) => {
      const defaultModel = id === "ollama" ? ollamaDefaultModel() : "default";
      return id === "ollama" && !defaultModel ? [] : [{ id, label: agent.label, defaultModel }];
    });
}

export async function runLocalAgent(
  agentId: string,
  prompt: string,
): Promise<{ response: string; provider: string; model: string }> {
  const agent = AGENTS[agentId as AgentId];
  if (!agent) throw new Error("Unsupported local agent.");
  if (!isAvailable(agent.command)) throw new Error(`${agent.label} is no longer installed or available on PATH.`);

  const local = listLocalAgents().find((item) => item.id === agentId);
  if (!local) throw new Error(`${agent.label} has no usable default configuration.`);
  const args = agentId === "ollama"
    ? AGENTS.ollama.args(prompt, local.defaultModel)
    : (agent as Exclude<(typeof AGENTS)[AgentId], typeof AGENTS.ollama>).args(prompt);

  return new Promise((resolve, reject) => {
    const child = spawn(agent.command, args, { cwd: os.homedir(), env: localAgentEnvironment() });
    let output = "";
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error(`${agent.label} did not complete within 10 minutes.`));
    }, 10 * 60 * 1000);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else if (!output.trim()) reject(new Error(`${agent.label} returned no response.`));
      else resolve({ response: output.trim(), provider: agentId, model: local.defaultModel });
    };
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.on("error", finish);
    child.on("close", (code) => {
      finish(code === 0 ? undefined : new Error(
        `${agent.label} exited with status ${code ?? "unknown"}: ${output.trim().slice(0, 500)}`,
      ));
    });
  });
}
