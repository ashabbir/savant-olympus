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
import { ModalBackdrop } from "@/components/shared/ModalBackdrop";
import { createScopedLocalAthenaThreadStore, readLocalAthenaHistory, useAthenaThread } from "@/hooks/useAthenaThread";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface Skill {
  id: string;
  name: string;
  description?: string;
  status: "audited" | "unlocked" | "archived" | "active" | "inactive";
  rules_count?: number;
  files: Record<string, string>;
}

interface SkillProposal {
  name: string;
  description: string;
  files: Record<string, string>;
  rationale?: string;
}

type SkillExportProvider = "codex" | "claude" | "copilot" | "agy" | "hermes";
type SkillExportProfile = { label: string; directory: string; format: string };

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

const languageForSkillFile = (path: string) => {
  const extension = path.split(".").pop()?.toLowerCase();
  return ({
    md: "markdown", json: "json", js: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx",
    py: "python", sh: "bash", bash: "bash", yml: "yaml", yaml: "yaml", html: "markup", css: "css",
    sql: "sql", toml: "toml", xml: "markup",
  } as Record<string, string>)[extension || ""] || "text";
};

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
  const [activeFile, setActiveFile] = useState("SKILL.md");
  const [editorContent, setEditorContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  // AI Refinement states
  const [refinePrompt, setRefinePrompt] = useState("");
  const [isRefining, setIsRefining] = useState(false);

  // AI Generation Chat states
  const [isAiMode, setIsAiMode] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [isAiChatLoading, setIsAiChatLoading] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [skillProposal, setSkillProposal] = useState<SkillProposal | null>(null);
  const [proposalPreviewFile, setProposalPreviewFile] = useState("SKILL.md");
  const [isCreatingSkill, setIsCreatingSkill] = useState(false);
  const [createError, setCreateError] = useState("");
  const [downloadSkill, setDownloadSkill] = useState<Skill | null>(null);
  const [exportProvider, setExportProvider] = useState<SkillExportProvider>("codex");
  const [exportProfiles, setExportProfiles] = useState<Record<string, SkillExportProfile>>({});
  const [exportDestination, setExportDestination] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
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
    if (chatEndRef.current?.scrollIntoView) {
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
        name: skill.name || (skill as any).title || skill.id,
        status: skill.status || "active",
        files: skill.files || {},
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
      const skillObjects = updatedSkills.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        status: s.status,
        rules_count: s.rules_count,
        files: s.files
      }));
      
      await window.system.saveSetting("savant:skills", skillObjects);
    } catch (e) {
      console.error("Failed persisting skills locally:", e);
    }
  };

  const handleSkillSelect = async (skill: Skill) => {
    setSelectedSkill(skill);
    setIsAiMode(false);
    if (Object.keys(skill.files).length > 0) return;
    try {
      const paths = await skillsService.listSkillFiles(skill.id);
      const entries = await Promise.all(paths.map(async path => [path, await skillsService.getSkillFile(skill.id, path)] as const));
      const hydrated = { ...skill, files: Object.fromEntries(entries) };
      setSkills(current => current.map(item => item.id === skill.id ? hydrated : item));
      setSelectedSkill(hydrated);
      setActiveFile(paths.includes("SKILL.md") ? "SKILL.md" : paths[0] || "SKILL.md");
    } catch (error: any) {
      setLoadError(error?.message || "Unable to load skill files.");
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

  const handleDeleteSkill = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await skillsService.deleteSkill(id);
    } catch (error: any) {
      alert(error?.message || "Failed to delete skill from the server.");
      return;
    }
    const nextSkills = skills.filter(s => s.id !== id);
    setSkills(nextSkills);
    if (selectedSkill?.id === id) {
      setSelectedSkill(nextSkills[0] || null);
    }
    handleSaveLocalSkills(nextSkills);
  };

  const handleSaveEditorChanges = async () => {
    if (!selectedSkill) return;

    try {
      await skillsService.updateSkillFile(selectedSkill.id, activeFile, editorContent);
    } catch (error: any) {
      alert(error?.message || "Failed to save the file on the server.");
      return;
    }

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

  const handleDownloadSkill = async (skill: Skill) => {
    const profiles = await window.system.getSkillExportProfiles();
    setExportProfiles(profiles);
    setExportProvider("codex");
    setExportDestination(profiles.codex?.directory || "");
    setExportStatus("");
    setDownloadSkill(skill);
  };

  const handleDownloadZip = async (skill: Skill) => {
    const zip = new JSZip();
    Object.entries(skill.files).forEach(([path, content]) => zip.file(path, content));
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const objectUrl = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.href = objectUrl;
    downloadAnchor.download = `${skill.name}.zip`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const handleExportProviderChange = (provider: SkillExportProvider) => {
    setExportProvider(provider);
    setExportDestination(exportProfiles[provider]?.directory || "");
    setExportStatus("");
  };

  const handleChooseExportDirectory = async () => {
    const selected = await window.electronAPI?.pickDirectory(exportDestination);
    if (selected) setExportDestination(selected);
  };

  const handleInstallProviderSkill = async () => {
    if (!downloadSkill || !exportDestination || isExporting) return;
    setIsExporting(true);
    setExportStatus("");
    try {
      const result = await window.system.exportSkillPackage({
        provider: exportProvider,
        name: downloadSkill.name,
        destinationRoot: exportDestination,
        files: Object.entries(downloadSkill.files).map(([path, content]) => ({ path, content })),
      });
      setExportStatus(`Installed at ${result.path}`);
    } catch (error: any) {
      setExportStatus(error?.message || "Unable to install the skill package.");
    } finally {
      setIsExporting(false);
    }
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

  const proposalFromResponse = (parsed: any): SkillProposal => {
    const entries = Array.isArray(parsed.files)
      ? parsed.files
      : Object.entries(parsed.files || {}).map(([path, content]) => ({ path, content }));
    const files = Object.fromEntries(entries
      .filter((file: any) => typeof file?.path === "string" && file?.content != null)
      .map((file: any) => {
        let content = typeof file.content === "string" ? file.content : JSON.stringify(file.content, null, 2);
        if (file.path.toLowerCase().endsWith(".json")) {
          try { content = JSON.stringify(JSON.parse(content), null, 2); } catch {}
        }
        return [file.path, content];
      }));
    if (!parsed.name || !files["SKILL.md"]) throw new Error("Athena must provide a name and SKILL.md.");
    return {
      name: String(parsed.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64),
      description: parsed.description || "Athena generated skill",
      rationale: parsed.rationale,
      files,
    };
  };

  const handleCreateProposal = async () => {
    if (!skillProposal || isCreatingSkill) return;
    setIsCreatingSkill(true);
    setCreateError("");
    try {
      const created = await skillsService.createSkill({
        name: skillProposal.name,
        description: skillProposal.description,
        files: Object.entries(skillProposal.files).map(([path, content]) => ({ path, content })),
      });
      const newSkill: Skill = {
        id: created.id || skillProposal.name,
        name: created.title || skillProposal.name,
        description: created.description || skillProposal.description,
        status: "active",
        rules_count: 0,
        files: skillProposal.files,
      };
      setSkills(current => [newSkill, ...current.filter(skill => skill.id !== newSkill.id)]);
      setSelectedSkill(newSkill);
      setActiveFile("SKILL.md");
      setSkillProposal(null);
      setIsAiMode(false);
      setChatMessages(current => [...current, {
        id: Math.random().toString(),
        sender: "assistant",
        text: `Created **${newSkill.name}** on the Savant Server with ${Object.keys(newSkill.files).length} files.`,
        timestamp: new Date().toISOString(),
        suggestedSkill: newSkill,
      }]);
    } catch (error: any) {
      setCreateError(error?.message || "The server could not create this skill.");
    } finally {
      setIsCreatingSkill(false);
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
  "question": "One precise question that is truly necessary before proceeding.",
  "suggestion": "Your recommended answer or design direction, with a short reason.",
  "assumptions": ["Any safe defaults you can already infer"]
}

If you have a decent understanding of the core behavior and are ready to generate the skill, return:
{
  "status": "ready",
  "name": "hyphen-case-skill-name",
  "description": "Short description of the skill",
  "rationale": "Why this file structure is sufficient and intentionally concise.",
  "files": [
    { "path": "SKILL.md", "content": "Required concise instructions with YAML frontmatter containing only name and description." },
    { "path": "scripts/example.py", "content": "Optional deterministic implementation only when repeated or fragile execution requires it." }
  ]
}

STEERING RULES:
- Ask only when the answer materially changes the workflow, inputs, integrations, or safety constraints.
- Whenever you ask, recommend a concrete default so the user can accept or redirect it.
- If the request is actionable, do not ask; encode reasonable assumptions in the generated skill.
- Decide which files are useful. SKILL.md is required; add scripts/, references/, or assets only when justified. Do not create README, changelog, installation, or process documentation.
- Keep SKILL.md concise and move detailed domain material into references/ for progressive disclosure.
- Use lowercase hyphen-case names under 64 characters and never emit metadata.json because the server owns it.`;

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
            text: `${parsed.question}${parsed.suggestion ? `\n\n**Athena suggests:** ${parsed.suggestion}` : ""}${Array.isArray(parsed.assumptions) && parsed.assumptions.length ? `\n\n**Working assumptions:** ${parsed.assumptions.join("; ")}` : ""}`,
            timestamp: new Date().toISOString()
          };
          setChatMessages(prev => [...prev, {
            ...assistantMsg
          }]);
        } else if (parsed.status === "ready" && parsed.name && parsed.files) {
          const proposal = proposalFromResponse(parsed);
          setSkillProposal(proposal);
          setProposalPreviewFile(proposal.files["SKILL.md"] ? "SKILL.md" : Object.keys(proposal.files)[0]);
          setCreateError("");

          const assistantMsg = {
            id: Math.random().toString(),
            sender: "assistant" as const,
            text: `I recommend the **${proposal.name}** structure below. Review the files, then create it on the server or tell me what to change.`,
            timestamp: new Date().toISOString(),
          };
          setChatMessages(prev => [...prev, assistantMsg]);
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
  const handleSendAiChatMessage = async (finalize = false) => {
    if (isAiChatLoading || (!finalize && !chatInput.trim())) return;
    if (finalize && chatMessages.every(message => message.sender !== "user") && !chatInput.trim()) return;

    const pendingText = chatInput.trim();
    const userMsg: ChatMessage | null = pendingText ? {
      id: Math.random().toString(),
      sender: "user",
      text: pendingText,
      timestamp: new Date().toISOString()
    } : null;

    const nextMessages = userMsg ? [...chatMessages, userMsg] : chatMessages;
    setChatMessages(nextMessages);
    setChatInput("");
    setIsAiChatLoading(true);
    setIsFinalizing(finalize);

    try {
      const chatHistory = nextMessages
        .map(msg => `${msg.sender.toUpperCase()}: ${msg.text}`)
        .join("\n");

      const promptPayload = `You are a collaborative AI Skill Architect designing a new Savant skill through conversation.

Here is the conversation history so far:
${formatAthenaHistory(readSharedAthenaHistory())}
${chatHistory}

You MUST respond with a valid JSON object. Do not include any markdown wrap, extra explanation, or conversational text outside of the JSON.

DIRECTIONS:
- This request is in ${finalize ? "FINALIZE" : "CONVERSATION"} mode.
- In CONVERSATION mode, continue the design discussion. Never generate files or return status "ready". Ask at most one necessary question, suggest a concrete direction, and help steer the user toward a complete design.
- In FINALIZE mode, stop asking questions. Resolve remaining ambiguity with the recommendations and assumptions already discussed, then return status "ready" with the complete file plan and contents.
- Do not ask trivial questions about metadata, versions, or directory layout.

In CONVERSATION mode return:
{
  "status": "conversational",
  "response": "A concise acknowledgement or useful design observation.",
  "question": "One precise question, or an empty string if no question is needed yet.",
  "suggestion": "Your recommended answer or design direction, with a short reason.",
  "assumptions": ["Any safe defaults you can already infer"]
}

In FINALIZE mode return:
{
  "status": "ready",
  "name": "hyphen-case-skill-name",
  "description": "Short description of the skill",
  "rationale": "Why this file structure is sufficient and intentionally concise.",
  "files": [
    { "path": "SKILL.md", "content": "Required concise instructions with YAML frontmatter containing only name and description." },
    { "path": "scripts/example.py", "content": "Optional deterministic implementation only when repeated or fragile execution requires it." }
  ]
}

STEERING RULES:
- Ask only when the answer materially changes the workflow, inputs, integrations, or safety constraints.
- Whenever you ask, recommend a concrete default so the user can accept or redirect it.
- If the request is actionable, do not ask; encode reasonable assumptions in the generated skill.
- Decide which files are useful. SKILL.md is required; add scripts/, references/, or assets only when justified. Do not create README, changelog, installation, or process documentation.
- Keep SKILL.md concise and move detailed domain material into references/ for progressive disclosure.
- Use lowercase hyphen-case names under 64 characters and never emit metadata.json because the server owns it.`;

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
        if ((parsed.status === "conversational" || parsed.status === "clarifying") && (parsed.response || parsed.question)) {
          setChatMessages(prev => [...prev, {
            id: Math.random().toString(),
            sender: "assistant",
            text: `${parsed.response || ""}${parsed.question ? `${parsed.response ? "\n\n" : ""}${parsed.question}` : ""}${parsed.suggestion ? `\n\n**Athena suggests:** ${parsed.suggestion}` : ""}${Array.isArray(parsed.assumptions) && parsed.assumptions.length ? `\n\n**Working assumptions:** ${parsed.assumptions.join("; ")}` : ""}`,
            timestamp: new Date().toISOString()
          }]);
        } else if (parsed.status === "ready" && parsed.name && parsed.files) {
          const proposal = proposalFromResponse(parsed);
          setSkillProposal(proposal);
          setProposalPreviewFile(proposal.files["SKILL.md"] ? "SKILL.md" : Object.keys(proposal.files)[0]);
          setCreateError("");

          setChatMessages(prev => [...prev, {
            id: Math.random().toString(),
            sender: "assistant",
            text: `I recommend the **${proposal.name}** structure below. Review the files, then create it on the server or tell me what to change.`,
            timestamp: new Date().toISOString(),
          }]);
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
      setIsFinalizing(false);
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
                      onClick={() => handleSkillSelect(s)}
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
                      {isFinalizing ? "Finalizing the skill structure and writing every file..." : "Athena is reviewing your message and shaping the skill..."}
                    </div>
                  </div>
                )}

                {skillProposal && (
                  <div className="ml-auto w-full max-w-2xl border border-[var(--cp-cyan)]/40 bg-[var(--cp-bg-1)] p-3 space-y-3 font-mono">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-[var(--cp-cyan)]">PROPOSED_SKILL / {skillProposal.name}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">{skillProposal.description}</div>
                      </div>
                      <span className="text-[9px] text-[var(--cp-green)] border border-[var(--cp-green)]/30 px-1.5 py-0.5">REVIEW</span>
                    </div>
                    {skillProposal.rationale && <p className="text-[10px] text-muted-foreground">{skillProposal.rationale}</p>}
                    <div className="grid grid-cols-[minmax(150px,0.34fr)_minmax(0,1fr)] border border-[var(--cp-border)] min-h-52 max-h-80 overflow-hidden">
                      <div className="overflow-y-auto border-r border-[var(--cp-border)] bg-[var(--cp-bg-2)]">
                        {Object.entries(skillProposal.files).map(([path, content]) => (
                          <button
                            type="button"
                            key={path}
                            onClick={() => setProposalPreviewFile(path)}
                            className={`w-full flex items-center justify-between gap-2 px-2 py-2 text-left text-[10px] border-b border-[var(--cp-border)] ${proposalPreviewFile === path ? "text-[var(--cp-cyan)] bg-[rgba(0,229,255,0.06)]" : "text-foreground hover:bg-[var(--cp-bg-3)]"}`}
                          >
                            <span className="truncate">{path}</span>
                            <span className="text-[9px] text-muted-foreground shrink-0">{content.length.toLocaleString()}</span>
                          </button>
                        ))}
                      </div>
                      <div className="overflow-auto bg-[#1e1e1e]">
                        <div className="sticky top-0 z-10 flex justify-between px-3 py-1.5 bg-[#181818] border-b border-white/10 text-[9px] text-muted-foreground">
                          <span>{proposalPreviewFile}</span>
                          <span>{languageForSkillFile(proposalPreviewFile).toUpperCase()}</span>
                        </div>
                        <SyntaxHighlighter
                          language={languageForSkillFile(proposalPreviewFile)}
                          style={vscDarkPlus}
                          customStyle={{ margin: 0, padding: "12px", background: "transparent", fontSize: "10px", lineHeight: 1.55 }}
                          wrapLongLines
                        >
                          {skillProposal.files[proposalPreviewFile] || ""}
                        </SyntaxHighlighter>
                      </div>
                    </div>
                    {createError && <div className="text-[10px] text-red-400">{createError}</div>}
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setSkillProposal(null)} className="px-2.5 py-1 border border-[var(--cp-border)] text-[10px] text-muted-foreground hover:text-foreground">DISCARD</button>
                      <button type="button" onClick={handleCreateProposal} disabled={isCreatingSkill} className="px-3 py-1 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] text-[10px] font-bold disabled:opacity-50">
                        {isCreatingSkill ? "CREATING..." : "CREATE ON SERVER"}
                      </button>
                    </div>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-4 border-t border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex flex-col gap-3 shadow-[0_-12px_28px_rgba(0,0,0,0.18)]">
                <div className="flex items-center justify-between font-mono">
                  <span className="text-[10px] uppercase tracking-widest text-[var(--cp-cyan)]">Continue the design conversation</span>
                  <span className="text-[9px] text-muted-foreground">Enter sends · Shift+Enter adds a line</span>
                </div>
                <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-0)] focus-within:border-[var(--cp-cyan)] transition-colors">
                  <textarea
                    placeholder="Describe the workflow, give an example, answer Athena, or redirect her recommendation..."
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
                    rows={4}
                    className="w-full bg-transparent px-3 py-3 text-xs font-mono text-foreground focus:outline-none resize-y min-h-[112px] max-h-[240px] overflow-y-auto leading-relaxed"
                  />
                </div>
                {isAdmin && <div className="flex items-center justify-between gap-3">
                  <p className="text-[9px] text-muted-foreground font-mono">Finalize uses the complete conversation and Athena's recommended defaults.</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSendAiChatMessage(false)}
                      disabled={isAiChatLoading || !chatInput.trim()}
                      className="px-4 py-2 border border-[var(--cp-cyan)] text-[var(--cp-cyan)] font-bold text-[10px] uppercase hover:bg-[rgba(0,229,255,0.08)] disabled:opacity-40 font-mono flex items-center gap-1.5"
                    >
                      <Send size={11} /> SEND MESSAGE
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendAiChatMessage(true)}
                      disabled={isAiChatLoading || (chatMessages.every(message => message.sender !== "user") && !chatInput.trim())}
                      className="px-4 py-2 bg-[var(--cp-magenta)] text-white font-bold text-[10px] uppercase hover:opacity-90 disabled:opacity-40 font-mono flex items-center gap-1.5"
                    >
                      <Sparkles size={11} /> FINALIZE &amp; GENERATE
                    </button>
                  </div>
                </div>}
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
                    title="Download folder-preserving SKILL.md package"
                    className="p-1.5 border border-[var(--cp-cyan)]/30 text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.08)] rounded font-mono text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download size={13} />
                    <span className="hidden sm:inline">DOWNLOAD_SKILL_ZIP</span>
                  </button>
                  <span
                    className={`text-[9px] px-2 py-0.5 border font-semibold tracking-wider font-mono ${
                      selectedSkill.status === "audited" || selectedSkill.status === "active"
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
                  {Object.keys(selectedSkill.files).map(fileName => (
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
                        <span>Codex Agent Skills</span>
                      </div>
                      <div className="flex items-center gap-1 text-[var(--cp-green)]">
                        <Check size={9} />
                        <span>Claude Code Skills</span>
                      </div>
                      <div className="flex items-center gap-1 text-[var(--cp-green)]">
                        <Check size={9} />
                        <span>GitHub Copilot Skills</span>
                      </div>
                      <div className="flex items-center gap-1 text-[var(--cp-green)]">
                        <Check size={9} />
                        <span>AGY Workspace Skills</span>
                      </div>
                      <div className="flex items-center gap-1 text-[var(--cp-green)]">
                        <Check size={9} />
                        <span>Hermes Agent Skills</span>
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
      <ModalBackdrop
        isOpen={Boolean(downloadSkill)}
        onClose={() => setDownloadSkill(null)}
        title="Install skill for an agent"
        maxWidth="max-w-2xl"
      >
        {downloadSkill && <div className="space-y-4">
          <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-3">
            <div className="text-xs font-bold text-foreground">{downloadSkill.name}</div>
            <div className="text-[10px] text-muted-foreground mt-1">Choose the agent that will discover this skill. Olympus keeps the complete folder tree and adapts the install location.</div>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--cp-cyan)] mb-2">1 / Agent provider</label>
            <div className="grid grid-cols-5 gap-2">
              {(["codex", "claude", "copilot", "agy", "hermes"] as SkillExportProvider[]).map(provider => (
                <button
                  type="button"
                  key={provider}
                  onClick={() => handleExportProviderChange(provider)}
                  className={`px-2 py-2 border text-[10px] font-bold uppercase ${exportProvider === provider ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)] bg-[rgba(0,229,255,0.06)]" : "border-[var(--cp-border)] text-muted-foreground hover:text-foreground"}`}
                >
                  {exportProfiles[provider]?.label || provider}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--cp-cyan)] mb-2">2 / Install directory</label>
            <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-0)] p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[9px] text-muted-foreground uppercase">Recommended for {exportProfiles[exportProvider]?.format}</div>
                  <div className="text-[11px] text-foreground truncate mt-1">{exportDestination}</div>
                </div>
                <button type="button" onClick={handleChooseExportDirectory} className="px-3 py-1.5 border border-[var(--cp-border)] text-[10px] text-[var(--cp-cyan)] hover:bg-[var(--cp-bg-2)] shrink-0">CHOOSE DIRECTORY</button>
              </div>
              <div className="text-[9px] text-muted-foreground">Olympus will create <span className="text-foreground">{downloadSkill.name}/</span> inside this directory.</div>
            </div>
          </div>
          {exportStatus && <div className={`text-[10px] border px-3 py-2 ${exportStatus.startsWith("Installed") ? "border-[var(--cp-green)]/30 text-[var(--cp-green)]" : "border-red-500/30 text-red-400"}`}>{exportStatus}</div>}
          <div className="flex items-center justify-between border-t border-[var(--cp-border)] pt-3">
            <button type="button" onClick={() => handleDownloadZip(downloadSkill)} className="px-3 py-2 border border-[var(--cp-border)] text-[10px] text-muted-foreground hover:text-foreground">DOWNLOAD PORTABLE ZIP</button>
            <button type="button" onClick={handleInstallProviderSkill} disabled={isExporting || !exportDestination} className="px-4 py-2 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] text-[10px] font-bold disabled:opacity-40">
              {isExporting ? "INSTALLING..." : `INSTALL FOR ${exportProvider.toUpperCase()}`}
            </button>
          </div>
        </div>}
      </ModalBackdrop>
    </div>
  );
}
