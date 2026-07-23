export interface Thinking {
  id: string;
  agent: string;
  thought: string;
  timestamp: number;
  type?: "thought" | "mcp_call" | "mcp_response" | "shell" | "worker_start" | "worker_end" | "data_transfer" | "redecision" | "timeout" | "loop_check" | "error";
}
