import * as d3 from "d3";

export interface Node extends d3.SimulationNodeDatum {
  id: string;
  node_id: string;
  title: string;
  node_type: string;
  content: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, any>;
  z?: number;
  vz?: number;
  px?: number;
  py?: number;
  pScale?: number;
  depth?: number;
  connections?: number;
}

export interface Edge extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
  edge_type?: string;
  edge_id?: string;
  weight?: number;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
}

export interface AthenaExportEntry {
  sender: "user" | "assistant";
  timestamp: string;
  html: string;
}

export interface KnowledgeChatContextSnapshot {
  version: number;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  focalsByType: Record<string, string[]>;
  exploreDepth: number;
  isExploreActive: boolean;
  searchQuery: string;
  searchTags: string[];
  filterSearch: string;
  typeFilter: string | null;
  openType: string | null;
  is3DMode: boolean;
  showInsights?: boolean;
}

export interface AthenaThread {
  target_id: string;
  title?: string | null;
  context?: KnowledgeChatContextSnapshot | null;
  kind?: string;
  messages: ChatMessage[];
  updated_at: string;
}

export interface KnowledgeGraphIndex {
  nodesById: Map<string, any>;
  adjacency: Record<string, string[]>;
  edgesByNode: Map<string, any[]>;
  nodesByType: Map<string, any[]>;
}

export interface KnowledgeViewProps {
  serverUrl: string;
  apiKey: string;
  isAdmin?: boolean;
}

export interface GraphFilterState {
  searchQuery: string;
  searchTags: string[];
  filterSearch: string;
  typeFilter: string | null;
  openType: string | null;
  exploreDepth: number;
  isExploreActive: boolean;
  is3DMode: boolean;
}
