import type { AppSettings, AppSnapshot } from "@nexadesk/shared";
import { buildSkillHub, buildWorkspaceArtifacts, createDefaultImChannels } from "../wesight-capabilities.js";

export function applySettingsToSnapshot(snapshot: AppSnapshot, settings: AppSettings): void {
  snapshot.providers = settings.providers;
  snapshot.agents = settings.assistant.agents;
  snapshot.skills = settings.assistant.skills;
  syncSessionAgents(snapshot);
  refreshDerivedSnapshot(snapshot);
}

export function refreshDerivedSnapshot(snapshot: AppSnapshot): void {
  snapshot.skillHub = buildSkillHub(snapshot.skills);
  snapshot.imChannels = createDefaultImChannels(snapshot.agents);
  snapshot.artifacts = buildWorkspaceArtifacts(snapshot.messages);
}

export function syncSessionAgents(snapshot: AppSnapshot): void {
  const enabledAgentIds = snapshot.agents.filter((agent) => agent.enabled).map((agent) => agent.id);
  for (const session of snapshot.sessions) {
    session.agentIds = enabledAgentIds;
    if (!enabledAgentIds.includes(session.activeAgentId)) {
      session.activeAgentId = enabledAgentIds[0] ?? session.activeAgentId;
    }
  }
  sortSessions(snapshot);
}

export function sortSessions(snapshot: AppSnapshot): void {
  snapshot.sessions.sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1;
    }
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}
