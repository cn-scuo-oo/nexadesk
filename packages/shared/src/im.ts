export type ImChannelKind = "feishu" | "dingtalk" | "telegram" | "wecom" | "slack";

export interface ImAgentChannel {
  id: string;
  name: string;
  kind: ImChannelKind;
  enabled: boolean;
  agentId?: string;
  webhookConfigured: boolean;
  lastEventAt?: string;
  status: "ready" | "needs_setup" | "disabled";
}