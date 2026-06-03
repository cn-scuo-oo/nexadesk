import type { AgentProfile, ImAgentChannel, SkillHubListing, SkillProfile, WorkspaceArtifact } from "@nexadesk/shared";

export function buildSkillHub(skills: SkillProfile[]): SkillHubListing[] {
  const builtIn = skills.map(
    (skill) =>
      ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        category: inferSkillCategory(skill),
        source: skill.source,
        installed: true,
        enabled: skill.enabled,
        riskLevel: inferSkillRisk(skill),
        tags: buildSkillTags(skill)
      }) satisfies SkillHubListing
  );

  const marketplaceSeeds: SkillHubListing[] = [
    {
      id: "skillhub-wechat-ops",
      name: "IM 运维助手",
      description: "将群消息转为 Agent 任务，支持审批、摘要和执行回执。",
      category: "integration",
      source: "extension",
      installed: false,
      enabled: false,
      riskLevel: "medium",
      tags: ["im", "agent-hub", "approval"]
    },
    {
      id: "skillhub-workspace-artifacts",
      name: "Workspace Artifacts",
      description: "把代码 diff、命令输出和报告沉淀成可审阅工件。",
      category: "engineering",
      source: "extension",
      installed: false,
      enabled: false,
      riskLevel: "low",
      tags: ["workspace", "diff", "artifact"]
    }
  ];

  return [...builtIn, ...marketplaceSeeds];
}

export function createDefaultImChannels(agents: AgentProfile[]): ImAgentChannel[] {
  const defaultAgentId = agents.find((agent) => agent.category === "cowork")?.id ?? agents[0]?.id;
  return [
    {
      id: "feishu-agent-hub",
      name: "飞书 Agent Hub",
      kind: "feishu",
      enabled: false,
      agentId: defaultAgentId,
      webhookConfigured: false,
      status: "needs_setup"
    },
    {
      id: "dingtalk-agent-hub",
      name: "钉钉 Agent Hub",
      kind: "dingtalk",
      enabled: false,
      agentId: defaultAgentId,
      webhookConfigured: false,
      status: "needs_setup"
    }
  ];
}

export function buildWorkspaceArtifacts(
  messages: Array<{ id: string; sessionId: string; content: string; createdAt: string }>
): WorkspaceArtifact[] {
  return messages
    .filter((message) => /```diff|\b(diff|patch|artifact|报告|工件)\b/i.test(message.content))
    .slice(-20)
    .map((message) => ({
      id: `artifact-${message.id}`,
      sessionId: message.sessionId,
      title: inferArtifactTitle(message.content),
      kind: inferArtifactKind(message.content),
      summary: message.content.replace(/```[\s\S]*?```/g, "[code block]").slice(0, 240),
      createdAt: message.createdAt,
      status: "ready"
    }));
}

function inferSkillCategory(skill: SkillProfile): SkillHubListing["category"] {
  const text = `${skill.id} ${skill.name} ${skill.description}`.toLowerCase();
  if (/word|excel|ppt|office|报告|文档|表格/.test(text)) return "office";
  if (/code|terminal|filesystem|search|workspace|代码|命令/.test(text)) return "engineering";
  if (/web|research|搜索|网页/.test(text)) return "research";
  if (/mcp|im|email|integration|集成|邮件/.test(text)) return "integration";
  return "productivity";
}

function inferSkillRisk(skill: SkillProfile): SkillHubListing["riskLevel"] {
  const text = `${skill.instructions} ${skill.description}`.toLowerCase();
  if (/delete|write|exec|command|shell|删除|写入|命令/.test(text)) return "high";
  if (/file|network|web|mcp|文件|网络/.test(text)) return "medium";
  return "low";
}

function buildSkillTags(skill: SkillProfile): string[] {
  return Array.from(
    new Set(
      [skill.source, inferSkillCategory(skill), skill.enabled ? "enabled" : "disabled"]
        .concat(skill.id.split(/[-_]/g))
        .filter(Boolean)
    )
  );
}

function inferArtifactTitle(content: string) {
  if (/```diff/i.test(content)) return "代码变更 Diff";
  if (/报告|report/i.test(content)) return "报告工件";
  return "工作区工件";
}

function inferArtifactKind(content: string): WorkspaceArtifact["kind"] {
  if (/```diff/i.test(content)) return "diff";
  if (/报告|report/i.test(content)) return "report";
  if (/命令|command|terminal/i.test(content)) return "command";
  return "file";
}
