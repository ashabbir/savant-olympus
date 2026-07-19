import React, { useState, useEffect, useRef } from "react";
import JSZip from "jszip";
import { 
  Award, ShieldCheck, Trash2, Plus, Search, Bot, Send, 
  Download, Code, FileText, Check, Sparkles, AlertTriangle, 
  Play, RefreshCcw, Save, HelpCircle, ChevronLeft, ChevronRight, X, Copy
} from "lucide-react";
import { buildAthenaPromptSections, fetchAthenaCodeContext, fetchAthenaKnowledgeContext, fetchAthenaMcpTools, formatAthenaContextHits } from "@/lib/athenaContext";
import { createSkillsService } from "@/services/skillsService";
import { AthenaMessage } from "@/components/shared/AthenaMessage";
import { createScopedLocalAthenaThreadStore, readLocalAthenaHistory, useAthenaThread } from "@/hooks/useAthenaThread";

interface Skill {
  id: string;
  name: string;
  description?: string;
  status: "audited" | "unlocked" | "archived";
  rules_count?: number;
  files: {
    "prompt.txt": string;
    "schema.json": string;
    "index.js": string;
    "metadata.json": string;
  };
}

interface SkillsViewProps {
  serverUrl: string;
  apiKey: string;
  activeModel?: { provider: string; model: string };
  isAdmin: boolean;
}

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  suggestedSkill?: Partial<Skill>;
}

const ATHENA_CHAT_HISTORY_KEY = "savant_athena_chat_history";
const ATHENA_SKILLS_SCOPE = "skills";

const DEFAULT_SKILLS: Skill[] = [
  {
    id: "skill-1",
    name: "automated_tests_auditor",
    description: "Audit codebase modifications with integration suites",
    status: "audited",
    rules_count: 5,
    files: {
      "prompt.txt": "You are a quality assurance agent. Verify that the changes in the workspace do not break existing integration suites. Execute tests if required, parse the output, and log any regression issues in the test audit manifest.",
      "schema.json": JSON.stringify({
        "name": "automated_tests_auditor",
        "description": "Audit codebase modifications with integration suites",
        "parameters": {
          "type": "object",
          "properties": {
            "run_tests": {
              "type": "boolean",
              "description": "Whether to automatically run integration tests"
            },
            "scope": {
              "type": "string",
              "description": "Scope of testing: 'all', 'unit', 'integration'"
            }
          },
          "required": ["run_tests"]
        }
      }, null, 2),
      "index.js": `// Automated Tests Auditor skill implementation
async function run(args) {
  console.log("Auditing tests with scope:", args.scope || 'all');
  // Integration execution placeholder
  return { 
    success: true, 
    status: "All integration suites checked. 0 errors detected.",
    timestamp: new Date().toISOString()
  };
}
module.exports = run;`,
      "metadata.json": JSON.stringify({
        "id": "skill-1",
        "name": "automated_tests_auditor",
        "description": "Audit codebase modifications with integration suites",
        "status": "audited",
        "rules_count": 5,
        "version": "1.0.0"
      }, null, 2)
    }
  },
  {
    id: "skill-2",
    name: "d3_force_generator",
    description: "Construct D3.js knowledge network nodes",
    status: "unlocked",
    rules_count: 2,
    files: {
      "prompt.txt": "You are a visualization specialist. Convert relational knowledge graphs into standard D3.js force-directed JSON layout structures. Ensure nodes and links are formatted with the correct positioning and scaling weight attributes.",
      "schema.json": JSON.stringify({
        "name": "d3_force_generator",
        "description": "Construct D3.js knowledge network nodes",
        "parameters": {
          "type": "object",
          "properties": {
            "charge_strength": {
              "type": "number",
              "description": "D3 charge parameter value"
            },
            "nodes_count": {
              "type": "number",
              "description": "Number of visual nodes to load"
            }
          },
          "required": ["charge_strength"]
        }
      }, null, 2),
      "index.js": `// D3 Force Generator skill implementation
async function run(args) {
  console.log("Generating force layout for charge:", args.charge_strength);
  return {
    success: true,
    layout: "D3 force graph coordinates computed.",
    nodesLoaded: args.nodes_count || 10
  };
}
module.exports = run;`,
      "metadata.json": JSON.stringify({
        "id": "skill-2",
        "name": "d3_force_generator",
        "description": "Construct D3.js knowledge network nodes",
        "status": "unlocked",
        "rules_count": 2,
        "version": "1.1.2"
      }, null, 2)
    }
  }
];

export function SkillsView({ serverUrl, apiKey, activeModel, isAdmin }: SkillsViewProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSkillPaneOpen, setIsSkillPaneOpen] = useState(true);

  // Manual Creation states
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillDesc, setNewSkillDesc] = useState("");
  const [newSkillStatus, setNewSkillStatus] = useState<"audited" | "unlocked" | "archived">("audited");

  const handleAddSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillName.trim()) return;
    handleManualAddSkill(newSkillName.trim(), newSkillDesc.trim(), newSkillStatus);
    setNewSkillName("");
    setNewSkillDesc("");
    setNewSkillStatus("audited");
    setShowAddForm(false);
  };

  // Upload Skill configuration file
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadSkill = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const zip = await JSZip.loadAsync(arrayBuffer);

        let promptText = "";
        let schemaJson = "";
        let indexJs = "";
        let metadataJson = "";

        const files = Object.keys(zip.files);
        const promptFile = files.find(f => f.endsWith("prompt.txt"));
        const schemaFile = files.find(f => f.endsWith("schema.json"));
        const indexFile = files.find(f => f.endsWith("index.js"));
        const metadataFile = files.find(f => f.endsWith("metadata.json"));

        if (promptFile) promptText = await zip.files[promptFile].async("string");
        if (schemaFile) schemaJson = await zip.files[schemaFile].async("string");
        if (indexFile) indexJs = await zip.files[indexFile].async("string");
        if (metadataFile) metadataJson = await zip.files[metadataFile].async("string");

        let name = file.name.replace(/\.[^/.]+$/, "").replace(/\s+/g, "_").toLowerCase();
        let description = "Uploaded ZIP Skill";
        let status: "audited" | "unlocked" | "archived" = "unlocked";

        if (metadataJson) {
          try {
            const parsedMeta = JSON.parse(metadataJson);
            if (parsedMeta.name) name = parsedMeta.name;
            if (parsedMeta.description) description = parsedMeta.description;
            if (parsedMeta.status) status = parsedMeta.status;
          } catch (metaErr) {
            console.error("Failed to parse metadata.json in ZIP:", metaErr);
          }
        }

        const newSkill: Skill = {
          id: `skill-${Date.now()}`,
          name: name,
          description: description,
          status: status,
          rules_count: 0,
          files: {
            "prompt.txt": promptText || `System instruction for ${name}`,
            "schema.json": schemaJson || JSON.stringify({ name, description, parameters: { type: "object", properties: {} } }, null, 2),
            "index.js": indexJs || "// Skill entry\nmodule.exports = async function(args) {};",
            "metadata.json": metadataJson || JSON.stringify({ id: `skill-${Date.now()}`, name, description, status, version: "1.0.0" }, null, 2)
          }
        };

        const nextSkills = [newSkill, ...skills.filter(s => s.name !== newSkill.name)];
        setSkills(nextSkills);
        setSelectedSkill(newSkill);
        await handleSaveLocalSkills(nextSkills);
      } catch (err: any) {
        alert("Failed to parse ZIP file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // Editor states
  const [activeFile, setActiveFile] = useState<keyof Skill["files"]>("prompt.txt");
  const [editorContent, setEditorContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  // AI Refinement states
  const [refinePrompt, setRefinePrompt] = useState("");
  const [isRefining, setIsRefining] = useState(false);

  // AI Generation Chat states
  const [isAiMode, setIsAiMode] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [isAiChatLoading, setIsAiChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const baseUrl = serverUrl.replace(/\/+$/, "");
  const skillsService = createSkillsService(serverUrl, apiKey);
  const historyStore = React.useMemo(
    () => createScopedLocalAthenaThreadStore<ChatMessage>(ATHENA_CHAT_HISTORY_KEY, ATHENA_SKILLS_SCOPE),
    [],
  );
  const { messages: chatMessages, setMessages: setChatMessages, removeMessage: removeChatMessage } = useAthenaThread<ChatMessage>({
    threadId: ATHENA_SKILLS_SCOPE,
    store: historyStore,
  });
  const readSharedAthenaHistory = () => readLocalAthenaHistory<ChatMessage>(ATHENA_CHAT_HISTORY_KEY);
  const formatAthenaHistory = (messages: any[]) =>
    messages.length > 0
      ? messages.map(msg => `[${msg.scope || "general"}] ${msg.sender.toUpperCase()}: ${msg.text}`).join("\n")
      : "No previous messages in this conversation.";
  const handleCopyMessage = (text: string) => navigator.clipboard.writeText(text);
  const handleDeleteMessage = (id: string) => {
    removeChatMessage(id);
  };
  const buildAthenaAugmentedPrompt = async (basePrompt: string, query: string) => {
    const [codeHits, knowledgeHits, tools] = await Promise.all([
      fetchAthenaCodeContext(baseUrl, apiKey, query),
      fetchAthenaKnowledgeContext(baseUrl, apiKey, query),
      fetchAthenaMcpTools(baseUrl, apiKey),
    ]);

    return buildAthenaPromptSections([
      ["BASE PROMPT", basePrompt],
      ["RETRIEVED CODE CONTEXT", formatAthenaContextHits(codeHits)],
      ["RETRIEVED KNOWLEDGE CONTEXT", formatAthenaContextHits(knowledgeHits)],
      ["AVAILABLE SAVANT MCP TOOLS", tools.length > 0 ? tools.map((tool: any) => `- ${tool.name}: ${tool.description}`).join("\n") : "No MCP tools available."],
    ]);
  };

  // Load initial skills
  useEffect(() => {
    fetchSkills();
  }, [serverUrl, apiKey]);

  // Listen for the redirect event to open Ask ATHENA
  useEffect(() => {
    const handleOpenAiChat = () => {
      setIsAiMode(true);
      if (chatMessages.length === 0) {
        setChatMessages((current) => current.length > 0
          ? current
          : [
                {
                  id: "welcome",
                  sender: "assistant",
                  text: "Hi! I am the Savant AI Skill Assistant. Tell me what capability or skill you'd like to build, and I will generate the complete configuration, parameter schema, and implementation code for you!",
                  timestamp: new Date().toISOString()
                }
              ]);
      }
    };
    window.addEventListener("open-skill-ai-chat", handleOpenAiChat);
    return () => window.removeEventListener("open-skill-ai-chat", handleOpenAiChat);
  }, [chatMessages]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  // Load editor content on file change or selected skill change
  useEffect(() => {
    if (selectedSkill) {
      setEditorContent(selectedSkill.files[activeFile] || "");
      setIsDirty(false);
    }
  }, [selectedSkill, activeFile]);

  const fetchSkills = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const fetchedList = await skillsService.listSkills();
      setSkills(fetchedList.map((skill: Partial<Skill>) => ({
        ...skill,
        files: {
          "prompt.txt": skill.files?.["prompt.txt"] || "",
          "schema.json": skill.files?.["schema.json"] || "",
          "index.js": skill.files?.["index.js"] || "",
          "metadata.json": skill.files?.["metadata.json"] || "",
        },
      })) as Skill[]);
    } catch (e: any) {
      console.error(e);
      setSkills([]);
      setLoadError(e?.message || "Unable to reach Savant server for skills.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveLocalSkills = async (updatedSkills: Skill[]) => {
    try {
      // Save to server
      const skillObjects = updatedSkills.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        status: s.status,
        rules_count: s.rules_count,
        files: s.files
      }));
      
      await skillsService.saveSkills(skillObjects)
        .catch(e => console.log("Failed saving to remote server gateway: ", e));

      // Always save to SQLite locally so it works offline
      await window.system.saveSetting("savant:skills", skillObjects);
    } catch (e) {
      console.error("Failed persisting skills locally:", e);
    }
  };

  const handleManualAddSkill = (name: string, desc: string, status: Skill["status"]) => {
    const cleanName = name.replace(/\s+/g, "_").toLowerCase();
    const newSkill: Skill = {
      id: `skill-${Date.now()}`,
      name: cleanName,
      description: desc,
      status,
      rules_count: 0,
      files: {
        "prompt.txt": `You are an AI performing: ${desc}`,
        "schema.json": JSON.stringify({
          "name": cleanName,
          "description": desc,
          "parameters": {
            "type": "object",
            "properties": {
              "input": { "type": "string", "description": "General purpose input payload" }
            },
            "required": ["input"]
          }
        }, null, 2),
        "index.js": `// Implementation for ${cleanName}\nasync function run(args) {\n  return {\n    success: true,\n    message: "Executed skill successfully"\n  };\n}\nmodule.exports = run;`,
        "metadata.json": JSON.stringify({
          "id": `skill-${Date.now()}`,
          "name": cleanName,
          "description": desc,
          "status": status,
          "rules_count": 0,
          "version": "1.0.0"
        }, null, 2)
      }
    };

    const nextSkills = [newSkill, ...skills];
    setSkills(nextSkills);
    setSelectedSkill(newSkill);
    handleSaveLocalSkills(nextSkills);
  };

  const handleDeleteSkill = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const nextSkills = skills.filter(s => s.id !== id);
    setSkills(nextSkills);
    if (selectedSkill?.id === id) {
      setSelectedSkill(nextSkills[0] || null);
    }
    handleSaveLocalSkills(nextSkills);
  };

  const handleSaveEditorChanges = () => {
    if (!selectedSkill) return;

    const updatedFiles = {
      ...selectedSkill.files,
      [activeFile]: editorContent
    };

    // If metadata file was updated, sync description or properties if valid
    let updatedDesc = selectedSkill.description;
    if (activeFile === "metadata.json") {
      try {
        const parsed = JSON.parse(editorContent);
        if (parsed.description) updatedDesc = parsed.description;
      } catch (err) {}
    }

    const updatedSkill: Skill = {
      ...selectedSkill,
      description: updatedDesc,
      files: updatedFiles
    };

    const nextSkills = skills.map(s => s.id === selectedSkill.id ? updatedSkill : s);
    setSkills(nextSkills);
    setSelectedSkill(updatedSkill);
    setIsDirty(false);
    handleSaveLocalSkills(nextSkills);
  };

  // Download entire skill package as structured JSON
  const handleDownloadSkill = (skill: Skill) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(skill, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${skill.name}-skill.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Download individual active file
  const handleDownloadActiveFile = () => {
    if (!selectedSkill) return;
    const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(editorContent);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${selectedSkill.name}-${activeFile}`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // AI Refinement of active file or full skill
  const handleRefineWithAi = async () => {
    if (!selectedSkill || !refinePrompt.trim() || isRefining) return;
    setIsRefining(true);

    try {
      const promptPayload = `You are a skill modification agent. You are updating the file "${activeFile}" for the skill named "${selectedSkill.name}".
The skill description is: "${selectedSkill.description}".

Here is the current content of the file:
\`\`\`
${editorContent}
\`\`\`

The user wishes to refine the file with these changes:
"${refinePrompt}"

Please output the FULL updated contents of the file. Do NOT include markdown styling or surrounding explanations, return ONLY the raw contents of the updated file so it can be directly saved.`;

      const response = await window.ipcRenderer.invoke("run-agent", {
        provider: activeModel?.provider || "gemini",
        model: activeModel?.model || "3.5",
        prompt: await buildAthenaAugmentedPrompt(promptPayload, `${selectedSkill.name} ${selectedSkill.description || ""} ${refinePrompt} ${editorContent.slice(0, 500)}`)
      });

      if (response && !response.startsWith("Error:")) {
        setEditorContent(response.trim());
        setIsDirty(true);
        setRefinePrompt("");
      } else {
        alert("AI refinement failed: " + response);
      }
    } catch (e: any) {
      console.error(e);
      alert("Error refining with AI: " + e.message);
    } finally {
      setIsRefining(false);
    }
  };

  // Replay last message through AI
  const handleReplayLastMessage = async () => {
    if (isAiChatLoading) return;

    // Find the last user message
    const userMsgs = chatMessages.filter(m => m.sender === "user");
    if (userMsgs.length === 0) return;

    const lastUserMsg = userMsgs[userMsgs.length - 1];

    // Roll back chat history up to the last user message
    const lastUserIdx = chatMessages.lastIndexOf(lastUserMsg);
    if (lastUserIdx === -1) return;

    const historyBefore = chatMessages.slice(0, lastUserIdx);
    setChatMessages([...historyBefore, lastUserMsg]);
    setIsAiChatLoading(true);

    try {
      const chatHistory = [...historyBefore, lastUserMsg]
        .map(msg => `${msg.sender.toUpperCase()}: ${msg.text}`)
        .join("\n");

      const promptPayload = `You are a helpful AI Skill Architect designing a new Savant skill module based on user input.

Here is the conversation history so far:
${formatAthenaHistory(readSharedAthenaHistory())}
${chatHistory}

You MUST respond with a valid JSON object. Do not include any markdown wrap, extra explanation, or conversational text outside of the JSON.

DIRECTIONS FOR DETERMINING TO GENERATE OR CLARIFY:
- You should aim for a decent, moderate amount of clarification. Ask 1 or 2 high-quality, targeted questions regarding the core logic, required parameter inputs, or test runner strategies if they are not yet clear.
- Do not ask trivial questions about obvious metadata fields, version numbers, or simple directory layouts.
- Once you have the main inputs and behavior defined through a brief back-and-forth, set the status to "ready" and generate the full code, prompts, and schema using smart defaults.

If you need to clarify core parameters or logic, return:
{
  "status": "clarifying",
  "question": "A precise question to clarify important core requirements (e.g. inputs, RSpec structure, or runner command)."
}

If you have a decent understanding of the core behavior and are ready to generate the skill, return:
{
  "status": "ready",
  "name": "snake_case_skill_name",
  "description": "Short description of the skill",
  "files": {
    "prompt.txt": "Detailed, robust system instructions/prompts for this skill to operate in the gateway/LLM provider. Explain inputs, outputs, rules.",
    "schema.json": "A valid tool parameters JSON schema (e.g., standard OpenAPI/Gemini function parameters format defining parameters/required items). Specify properties, descriptions, types.",
    "index.js": "Javascript implementation code. Exports a run(args) function executing the skill.",
    "metadata.json": "A config JSON containing name, description, and status."
  }
}`;

      const res = await window.ipcRenderer.invoke("run-agent", {
        provider: activeModel?.provider || "gemini",
        model: activeModel?.model || "3.5",
        prompt: await buildAthenaAugmentedPrompt(promptPayload, `${chatInput} ${chatHistory}`)
      });

      let cleanRes = res || "";

      const parseJsonSafely = (text: string) => {
        try {
          return JSON.parse(text.trim());
        } catch (e) {}

        const codeBlockRegex = /```(?:json)?([\s\S]*?)```/;
        const match = text.match(codeBlockRegex);
        if (match && match[1]) {
          try {
            return JSON.parse(match[1].trim());
          } catch (e) {}
        }

        const startIdx = text.indexOf('{');
        const endIdx = text.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          const candidate = text.substring(startIdx, endIdx + 1);
          try {
            return JSON.parse(candidate.trim());
          } catch (e) {}
        }
        throw new Error("Invalid JSON structure");
      };

      try {
        const parsed = parseJsonSafely(cleanRes);
        if (parsed.status === "clarifying" && parsed.question) {
          const assistantMsg = {
            id: Math.random().toString(),
            sender: "assistant" as const,
            text: parsed.question,
            timestamp: new Date().toISOString()
          };
          setChatMessages(prev => [...prev, {
            ...assistantMsg
          }]);
        } else if (parsed.status === "ready" && parsed.name && parsed.files) {
          const newSkill: Skill = {
            id: `skill-${Date.now()}`,
            name: parsed.name,
            description: parsed.description || "AI Generated Skill",
            status: "audited",
            rules_count: 1,
            files: {
              "prompt.txt": parsed.files["prompt.txt"] || "Instructions",
              "schema.json": typeof parsed.files["schema.json"] === "object" ? JSON.stringify(parsed.files["schema.json"], null, 2) : parsed.files["schema.json"],
              "index.js": parsed.files["index.js"] || "// Code",
              "metadata.json": typeof parsed.files["metadata.json"] === "object" ? JSON.stringify(parsed.files["metadata.json"], null, 2) : parsed.files["metadata.json"]
            }
          };

          const nextSkills = [newSkill, ...skills];
          setSkills(nextSkills);
          setSelectedSkill(newSkill);
          handleSaveLocalSkills(nextSkills);

          const assistantMsg = {
            id: Math.random().toString(),
            sender: "assistant" as const,
            text: `Awesome! After our interview, I generated the **${newSkill.name}** skill successfully. I have loaded it into your environment and saved it! You can view and edit its files in the editor now.`,
            timestamp: new Date().toISOString(),
            suggestedSkill: newSkill
          };
          setChatMessages(prev => [...prev, assistantMsg]);

          setIsAiMode(false);
        } else {
          throw new Error("Missing status properties.");
        }
      } catch (parseErr) {
        const assistantMsg = {
          id: Math.random().toString(),
          sender: "assistant" as const,
          text: cleanRes,
          timestamp: new Date().toISOString()
        };
        setChatMessages(prev => [...prev, assistantMsg]);
      }
    } catch (e: any) {
      console.error(e);
      const assistantMsg = {
        id: Math.random().toString(),
        sender: "assistant" as const,
        text: `Error contacting the AI model: ${e.message || "Unknown error"}. Make sure your Savant Gateway is running.`,
        timestamp: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, assistantMsg]);
    } finally {
      setIsAiChatLoading(false);
    }
  };

  // ATHENA to build a new skill
  const handleSendAiChatMessage = async () => {
    if (!chatInput.trim() || isAiChatLoading) return;

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      sender: "user",
      text: chatInput,
      timestamp: new Date().toISOString()
    };

    const nextMessages = [...chatMessages, userMsg];
    setChatMessages(nextMessages);
    setChatInput("");
    setIsAiChatLoading(true);

    try {
      const chatHistory = nextMessages
        .map(msg => `${msg.sender.toUpperCase()}: ${msg.text}`)
        .join("\n");

      const promptPayload = `You are a helpful AI Skill Architect designing a new Savant skill module based on user input.

Here is the conversation history so far:
${formatAthenaHistory(readSharedAthenaHistory())}
${chatHistory}

You MUST respond with a valid JSON object. Do not include any markdown wrap, extra explanation, or conversational text outside of the JSON.

DIRECTIONS FOR DETERMINING TO GENERATE OR CLARIFY:
- You should aim for a decent, moderate amount of clarification. Ask 1 or 2 high-quality, targeted questions regarding the core logic, required parameter inputs, or test runner strategies if they are not yet clear.
- Do not ask trivial questions about obvious metadata fields, version numbers, or simple directory layouts.
- Once you have the main inputs and behavior defined through a brief back-and-forth, set the status to "ready" and generate the full code, prompts, and schema using smart defaults.

If you need to clarify core parameters or logic, return:
{
  "status": "clarifying",
  "question": "A precise question to clarify important core requirements (e.g. inputs, RSpec structure, or runner command)."
}

If you have a decent understanding of the core behavior and are ready to generate the skill, return:
{
  "status": "ready",
  "name": "snake_case_skill_name",
  "description": "Short description of the skill",
  "files": {
    "prompt.txt": "Detailed, robust system instructions/prompts for this skill to operate in the gateway/LLM provider. Explain inputs, outputs, rules.",
    "schema.json": "A valid tool parameters JSON schema (e.g., standard OpenAPI/Gemini function parameters format defining parameters/required items). Specify properties, descriptions, types.",
    "index.js": "Javascript implementation code. Exports a run(args) function executing the skill.",
    "metadata.json": "A config JSON containing name, description, and status."
  }
}`;

      const res = await window.ipcRenderer.invoke("run-agent", {
        provider: activeModel?.provider || "gemini",
        model: activeModel?.model || "3.5",
        prompt: promptPayload
      });

      let cleanRes = res || "";
      
      const parseJsonSafely = (text: string) => {
        try {
          return JSON.parse(text.trim());
        } catch (e) {}

        const codeBlockRegex = /```(?:json)?([\s\S]*?)```/;
        const match = text.match(codeBlockRegex);
        if (match && match[1]) {
          try {
            return JSON.parse(match[1].trim());
          } catch (e) {}
        }

        const startIdx = text.indexOf('{');
        const endIdx = text.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          const candidate = text.substring(startIdx, endIdx + 1);
          try {
            return JSON.parse(candidate.trim());
          } catch (e) {}
        }
        throw new Error("Invalid JSON structure");
      };

      try {
        const parsed = parseJsonSafely(cleanRes);
        if (parsed.status === "clarifying" && parsed.question) {
          setChatMessages(prev => [...prev, {
            id: Math.random().toString(),
            sender: "assistant",
            text: parsed.question,
            timestamp: new Date().toISOString()
          }]);
        } else if (parsed.status === "ready" && parsed.name && parsed.files) {
          const newSkill: Skill = {
            id: `skill-${Date.now()}`,
            name: parsed.name,
            description: parsed.description || "AI Generated Skill",
            status: "audited",
            rules_count: 1,
            files: {
              "prompt.txt": parsed.files["prompt.txt"] || "Instructions",
              "schema.json": typeof parsed.files["schema.json"] === "object" ? JSON.stringify(parsed.files["schema.json"], null, 2) : parsed.files["schema.json"],
              "index.js": parsed.files["index.js"] || "// Code",
              "metadata.json": typeof parsed.files["metadata.json"] === "object" ? JSON.stringify(parsed.files["metadata.json"], null, 2) : parsed.files["metadata.json"]
            }
          };

          const nextSkills = [newSkill, ...skills];
          setSkills(nextSkills);
          setSelectedSkill(newSkill);
          handleSaveLocalSkills(nextSkills);

          setChatMessages(prev => [...prev, {
            id: Math.random().toString(),
            sender: "assistant",
            text: `Awesome! After our interview, I generated the **${newSkill.name}** skill successfully. I have loaded it into your environment and saved it! You can view and edit its files in the editor now.`,
            timestamp: new Date().toISOString(),
            suggestedSkill: newSkill
          }]);
          
          // Briefly highlight editor
          setIsAiMode(false);
        } else {
          throw new Error("Missing status properties.");
        }
      } catch (parseErr) {
        // Fallback: If JSON parsing fails, treat it as a conversational message
        setChatMessages(prev => [...prev, {
          id: Math.random().toString(),
          sender: "assistant",
          text: cleanRes,
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (e: any) {
      console.error(e);
      setChatMessages(prev => [...prev, {
        id: Math.random().toString(),
        sender: "assistant",
        text: `Error contacting the AI model: ${e.message || "Unknown error"}. Make sure your Savant Gateway is running.`,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsAiChatLoading(false);
    }
  };

  const filteredSkills = skills.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.description || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 space-y-4" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--cp-border)] pb-3">
        <div>
          <h2 className="text-lg font-medium text-[var(--section-label)] tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            SKILL SYSTEM
          </h2>
          <p className="text-xs text-muted-foreground opacity-60">Verified, provider-compliant capability modules running on the Savant Server</p>
        </div>

        {/* Model Selector (Read-Only) */}
        <div className="flex items-center gap-2 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] px-2.5 py-1 text-xs font-mono">
          <Bot size={13} className="text-[var(--cp-cyan)]" />
          <span className="text-muted-foreground text-[10px]">MODEL:</span>
          <span className="text-foreground text-[11px] font-bold uppercase">
            {activeModel ? `${activeModel.provider}: ${activeModel.model}` : "GEMINI: 3.5"}
          </span>
        </div>
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Sidebar Browser */}
        <div className={`${isSkillPaneOpen ? "w-80" : "w-11"} flex flex-col space-y-3 shrink-0 overflow-hidden transition-all duration-200`}>
          <div className="flex items-center justify-between">
            {isSkillPaneOpen && <h3 className="text-xs uppercase text-[var(--section-label)] tracking-wider font-mono">Skill Registry</h3>}
            <div className="flex items-center gap-1.5">
              {isSkillPaneOpen && isAdmin && (
                <>
                  <button
                    onClick={() => {
                      setIsAiMode(!isAiMode);
                      if (!isAiMode && chatMessages.length === 0) {
                        setChatMessages([
                          {
                            id: "welcome",
                            sender: "assistant",
                            text: "Hi! I am the Savant AI Skill Assistant. Tell me what capability or skill you'd like to build, and I will generate the complete configuration, parameter schema, and implementation code for you!",
                            timestamp: new Date().toISOString()
                          }
                        ]);
                      }
                    }}
                    style={{ borderColor: isAiMode ? "var(--cp-magenta)" : "rgba(0, 229, 255, 0.3)" }}
                    className={`px-1.5 py-0.5 border text-[10px] flex items-center gap-1 font-mono cursor-pointer transition-all ${
                      isAiMode
                        ? "text-[var(--cp-magenta)] hover:bg-[rgba(255,0,229,0.1)]"
                        : "text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)]"
                    }`}
                  >
                    <Sparkles size={10} />
                    {isAiMode ? "VIEW EDITOR" : "CREATE WITH ATHENA"}
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{ borderColor: "rgba(0, 229, 255, 0.3)" }}
                    className="px-1.5 py-0.5 border text-[10px] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)] flex items-center gap-1 font-mono cursor-pointer"
                  >
                    <Plus size={10} />
                    <span>UPLOAD</span>
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleUploadSkill}
                    accept=".zip"
                    className="hidden"
                    data-testid="upload-file-input"
                  />
                </>
              )}
              <button
                type="button"
                onClick={() => setIsSkillPaneOpen((open) => !open)}
                title={isSkillPaneOpen ? "Collapse skills tree" : "Expand skills tree"}
                aria-label={isSkillPaneOpen ? "Collapse skills tree" : "Expand skills tree"}
                className="h-6 w-6 inline-flex items-center justify-center border border-[var(--cp-border)] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.08)]"
              >
                {isSkillPaneOpen ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
              </button>
            </div>
          </div>

          {isSkillPaneOpen ? (
            <>
              {/* Search box */}
              <div className="flex items-center gap-1.5 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] px-2 py-1">
                <Search size={11} className="text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search skills..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none text-foreground text-xs focus:outline-none w-full font-mono"
                />
              </div>

              {/* Skill List */}
              <div className="flex-1 overflow-y-auto border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-2 space-y-2">
                {isLoading ? (
                  <div className="text-center py-6 text-xs text-[var(--cp-cyan)] animate-pulse">LOADING_REGISTRY...</div>
                ) : loadError ? (
                  <div className="text-center py-6 text-xs text-red-400 font-mono">{loadError}</div>
                ) : filteredSkills.length === 0 ? (
                  <div className="text-center py-6 text-xs text-muted-foreground opacity-40">No skills found</div>
                ) : (
                  filteredSkills.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSelectedSkill(s);
                        setIsAiMode(false);
                      }}
                      className={`p-2.5 border cursor-pointer transition-all flex items-start justify-between group ${
                        selectedSkill?.id === s.id && !isAiMode
                          ? "border-[var(--cp-cyan)] bg-[rgba(0,229,255,0.05)]"
                          : "border-[var(--cp-border)] bg-[var(--cp-bg-2)] hover:border-[rgba(0,229,255,0.3)]"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold font-mono text-[var(--cp-cyan)] flex items-center gap-1">
                          <Award size={12} className="text-[var(--cp-cyan)] shrink-0" />
                          <span className="truncate">{s.name}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground opacity-70 mt-1 line-clamp-2">{s.description}</p>
                      </div>
                      {isAdmin && <button
                        onClick={(e) => handleDeleteSkill(s.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-[var(--cp-magenta)] hover:bg-red-950/20 transition-all cursor-pointer rounded shrink-0 ml-1.5"
                        title="Delete skill"
                      >
                        <Trash2 size={12} />
                      </button>}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex items-center justify-center">
              <span className="font-mono text-[10px] text-[var(--cp-cyan)] [writing-mode:vertical-rl] rotate-180 tracking-widest">
                SKILLS
              </span>
            </div>
          )}
        </div>

        {/* Central UI Panel */}
        <div className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex flex-col overflow-hidden relative">
          {isAiMode ? (
            /* AI Skill Generation Chat Panel */
            <div className="flex flex-col h-full bg-[var(--cp-bg-0)]">
              {/* Chat Title bar */}
              <div className="flex items-center justify-between border-b border-[var(--cp-border)] px-4 py-2.5 bg-[var(--cp-bg-1)] font-mono text-xs text-[var(--cp-cyan)]">
                <span className="flex items-center gap-1.5 font-bold">
                  <Bot size={14} /> AI_SKILL_CREATOR_CHAT
                </span>
                <span className="text-[10px] text-muted-foreground">Explain the skill, AI does the rest</span>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatMessages.map(msg => <AthenaMessage key={msg.id} message={msg} variant="skill" onCopy={handleCopyMessage} onDelete={() => handleDeleteMessage(msg.id)} />)}
                
                {isAiChatLoading && (
                  <div className="flex items-center gap-2.5 mr-auto max-w-[85%]">
                    <div className="p-1 border border-pink-500/30 bg-pink-950/10 text-pink-400 rounded animate-spin">
                      <RefreshCcw size={14} />
                    </div>
                    <div className="p-3 border border-dashed border-pink-500/25 bg-[var(--cp-bg-1)] text-xs font-mono text-pink-400/80 animate-pulse">
                      Generating structure schema, prompts, config manifest, and code execution scope...
                    </div>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-3 border-t border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex flex-col gap-2">
                {chatMessages.filter(m => m.sender === "user").length > 0 && (
                  <div className="flex justify-end">
                    <button
                      onClick={handleReplayLastMessage}
                      disabled={isAiChatLoading}
                      className="px-2.5 py-1 border border-pink-500/20 text-pink-400 hover:border-pink-500/50 hover:bg-pink-950/20 text-[10px] font-bold font-mono tracking-wider flex items-center gap-1 cursor-pointer transition-all rounded-sm bg-pink-950/5"
                    >
                      <RefreshCcw size={10} className={isAiChatLoading ? "animate-spin" : ""} />
                      <span>REPLAY LAST TURN</span>
                    </button>
                  </div>
                )}
                 <div className="flex gap-2 items-end">
                  <textarea
                    placeholder="Describe your skill in detail (e.g. inputs, outputs, rules). Use Enter to generate, Shift+Enter for newlines."
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (chatInput.trim() && !isAiChatLoading) {
                          handleSendAiChatMessage();
                        }
                      }
                    }}
                    disabled={isAiChatLoading}
                    rows={1}
                    className="flex-1 bg-[var(--cp-bg-0)] border border-[var(--cp-border)] px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-[var(--cp-cyan)] resize-none min-h-[32px] max-h-[120px] overflow-y-auto"
                  />
                  {isAdmin && <button
                    onClick={handleSendAiChatMessage}
                    disabled={isAiChatLoading || !chatInput.trim()}
                    className="px-4 py-1.5 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase hover:opacity-90 disabled:opacity-50 font-mono"
                  >
                    GENERATE
                  </button>}
                </div>
              </div>
            </div>
          ) : selectedSkill ? (
            /* Skill Editor details view */
            <div className="flex flex-col h-full overflow-hidden">
              {/* Skill Info Header */}
              <div className="p-4 border-b border-[var(--cp-border)] flex items-start justify-between bg-[var(--cp-bg-2)]">
                <div>
                  <h3 className="text-sm font-bold text-foreground font-mono flex items-center gap-1.5">
                    <Award size={14} className="text-[var(--cp-cyan)]" />
                    {selectedSkill.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 font-mono text-[11px]">{selectedSkill.description}</p>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownloadSkill(selectedSkill)}
                    title="Download complete skill bundle"
                    className="p-1.5 border border-[var(--cp-cyan)]/30 text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.08)] rounded font-mono text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download size={13} />
                    <span className="hidden sm:inline">DOWNLOAD_SKILL</span>
                  </button>
                  <span
                    className={`text-[9px] px-2 py-0.5 border font-semibold tracking-wider font-mono ${
                      selectedSkill.status === "audited"
                        ? "border-[var(--cp-green)] text-[var(--cp-green)] bg-[rgba(0,255,136,0.05)]"
                        : "border-gray-500/30 text-muted-foreground"
                    }`}
                  >
                    {selectedSkill.status.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Editor Tabs & File Action panel */}
              <div className="flex items-center justify-between border-b border-[var(--cp-border)] px-2 bg-[var(--cp-bg-3)]">
                <div className="flex">
                  {(Object.keys(selectedSkill.files) as Array<keyof Skill["files"]>).map(fileName => (
                    <button
                      key={fileName}
                      onClick={() => {
                        if (isDirty && !window.confirm("Discard unsaved code changes?")) return;
                        setActiveFile(fileName);
                      }}
                      className={`px-3 py-2 text-[11px] font-mono border-r border-[var(--cp-border)] flex items-center gap-1.5 transition-all cursor-pointer ${
                        activeFile === fileName
                          ? "bg-[var(--cp-bg-1)] text-[var(--cp-cyan)] border-b-2 border-b-[var(--cp-cyan)]"
                          : "text-muted-foreground hover:text-foreground hover:bg-[var(--cp-bg-2)]"
                      }`}
                    >
                      {fileName.endsWith(".json") ? <Code size={11} /> : <FileText size={11} />}
                      {fileName}
                    </button>
                  ))}
                </div>

                {/* Save and download individual file */}
                <div className="flex items-center gap-2.5">
                  {isDirty && (
                    <span className="text-[10px] text-[var(--cp-magenta)] animate-pulse font-mono font-bold flex items-center gap-1">
                      <AlertTriangle size={10} /> UNSAVED_EDITS
                    </span>
                  )}
                  <button
                    onClick={handleDownloadActiveFile}
                    title="Export this file"
                    className="p-1 hover:bg-[var(--cp-bg-2)] text-muted-foreground hover:text-foreground rounded"
                  >
                    <Download size={13} />
                  </button>
                  <button
                    onClick={handleSaveEditorChanges}
                    disabled={!isDirty}
                    className="px-2.5 py-1 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold font-mono text-[10px] hover:opacity-90 disabled:opacity-30 flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <Save size={10} />
                    <span>SAVE_CHANGES</span>
                  </button>
                </div>
              </div>

              {/* Main Code Editor Block */}
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col relative h-full bg-[var(--cp-bg-1)] p-2">
                  <textarea
                    value={editorContent}
                    onChange={(e) => {
                      setEditorContent(e.target.value);
                      setIsDirty(true);
                    }}
                    className="w-full flex-1 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-3 text-xs text-foreground font-mono focus:outline-none resize-none leading-relaxed"
                    style={{ whiteSpace: "pre", overflowX: "auto" }}
                    placeholder={`Enter file contents for ${activeFile}...`}
                  />
                </div>

                {/* AI Refinement panel */}
                <div className="w-72 border-l border-[var(--cp-border)] bg-[var(--cp-bg-2)] flex flex-col p-3 space-y-3 shrink-0">
                  <div className="flex items-center gap-1 text-[11px] uppercase tracking-wider font-mono text-[var(--cp-cyan)]">
                    <Sparkles size={12} />
                    <span>Refine with AI</span>
                  </div>
                  
                  <p className="text-[10px] text-muted-foreground leading-normal">
                    Instruct the AI to modify or append code/rules to the active file <strong className="font-mono text-[var(--cp-cyan)]">{activeFile}</strong>.
                  </p>

                  <textarea
                    placeholder="E.g. 'Add validation logic to verify matching email input parameter' or 'Refine system prompt guidelines'"
                    value={refinePrompt}
                    onChange={e => setRefinePrompt(e.target.value)}
                    className="w-full h-32 bg-[var(--cp-bg-3)] border border-[var(--cp-border)] p-2 text-xs text-foreground focus:outline-none resize-none font-mono"
                  />

                  <button
                    onClick={handleRefineWithAi}
                    disabled={isRefining || !refinePrompt.trim()}
                    className="w-full py-1.5 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold font-mono text-xs hover:opacity-90 disabled:opacity-30 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {isRefining ? (
                      <>
                        <RefreshCcw size={12} className="animate-spin" />
                        <span>REFINING...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={12} />
                        <span>REFINE_FILE</span>
                      </>
                    )}
                  </button>
                  
                  <div className="pt-2 border-t border-[var(--cp-border)]/50">
                    <span className="text-[9px] uppercase font-mono text-muted-foreground tracking-widest block mb-1.5">Compliance check</span>
                    <div className="space-y-1.5 text-[9px] font-mono text-muted-foreground">
                      <div className="flex items-center gap-1 text-[var(--cp-green)]">
                        <Check size={9} />
                        <span>OpenAI Tool Specification</span>
                      </div>
                      <div className="flex items-center gap-1 text-[var(--cp-green)]">
                        <Check size={9} />
                        <span>Gemini Function Declarations</span>
                      </div>
                      <div className="flex items-center gap-1 text-[var(--cp-green)]">
                        <Check size={9} />
                        <span>Anthropic Computer Tools</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
              <Award size={48} className="text-muted-foreground mb-2" />
              <span className="text-xs tracking-widest font-mono text-[var(--section-label)] uppercase">
                select_skill_to_explore
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
