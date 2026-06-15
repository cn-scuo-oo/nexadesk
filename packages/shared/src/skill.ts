import type { PermissionRisk } from "./permission.js";

export interface SkillProfile {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  source: "built_in" | "custom" | "extension";
  instructions: string;
}

export type SkillHubCategory = "productivity" | "engineering" | "office" | "research" | "integration";

export interface SkillHubListing {
  id: string;
  name: string;
  description: string;
  category: SkillHubCategory;
  source: SkillProfile["source"];
  installed: boolean;
  enabled: boolean;
  riskLevel: PermissionRisk;
  tags: string[];
}