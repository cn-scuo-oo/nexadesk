import type { ModelProvider } from "./provider.js";
import type { AgentProfile, AgentEngineSettings } from "./agent.js";
import type { SkillProfile } from "./skill.js";
import type { McpServerSettings } from "./mcp.js";
import type { AppSettings } from "./settings.js";
import type { AppSnapshot } from "./snapshot.js";
export declare function createDefaultProviders(): ModelProvider[];
export declare function createDefaultAgents(): AgentProfile[];
export declare function createDefaultAgentEngines(): AgentEngineSettings[];
export declare function createDefaultSkills(): SkillProfile[];
export declare function createDefaultMcpServers(): McpServerSettings[];
export declare function createDefaultSettings(providers?: ModelProvider[], now?: string): AppSettings;
export declare function createDemoSnapshot(now?: string): AppSnapshot;
//# sourceMappingURL=defaults.d.ts.map