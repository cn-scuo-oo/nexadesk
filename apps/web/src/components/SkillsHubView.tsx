// @ts-nocheck
import { Search, Workflow } from "lucide-react";
import { useRef, useState } from "react";
import type { SkillHubListing, SkillProfile } from "@nexadesk/shared";
import { EmptyState } from "./EmptyState";

export interface SkillsHubViewProps {
  skills: SkillProfile[];
  skillHub?: SkillHubListing[];
  onImportPluginDirectory: () => void;
  onImportSkillPackage: (raw: string, fileName: string) => void;
  onOpenSettings: () => void;
  onToggleSkill: (skillId: string, enabled: boolean) => void;
}

export function SkillsHubView({
  skills,
  skillHub,
  onImportPluginDirectory,
  onImportSkillPackage,
  onOpenSettings,
  onToggleSkill
}: SkillsHubViewProps) {
  const [activeTab, setActiveTab] = useState<"installed" | "market">("installed");
  const [activeCategory, setActiveCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const skillPackageInputRef = useRef<HTMLInputElement | null>(null);
  const categories = ["全部", "推荐", "编程开发", "办公文档", "研究写作", "自动化", "集成"];
  const enabledSkills = skills.filter((skill) => skill.enabled);

  // Use backend skillHub data for marketplace when available, fall back to skills
  const hubListings: SkillHubListing[] = skillHub && skillHub.length > 0
    ? skillHub
    : skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        category: skillHubCategoryFromSkill(skill),
        source: skill.source,
        installed: true,
        enabled: skill.enabled,
        riskLevel: "low" as const,
        tags: []
      }));

  const visibleListings = hubListings.filter((listing) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery =
      !normalizedQuery ||
      listing.name.toLowerCase().includes(normalizedQuery) ||
      listing.description.toLowerCase().includes(normalizedQuery);
    const categoryLabel = skillHubCategoryLabel(listing.category);
    const matchesCategory = activeCategory === "全部" || categoryLabel === activeCategory;
    const matchesTab = activeTab === "market" || listing.installed;
    return matchesQuery && matchesCategory && matchesTab;
  });

  return (
    <section className="workspace module-workspace">
      <div className="skills-hub-shell">
        <section className="skills-hero-panel">
          <div>
            <p className="eyebrow">Skill System</p>
            <h3>给智能体装上可复用能力</h3>
            <span>
              {enabledSkills.length} 个技能已启用 · {skills.length} 个技能可配置
            </span>
          </div>
          <div className="skills-hero-actions">
            <button className="primary-button" onClick={() => skillPackageInputRef.current?.click()} type="button">
              导入技能包
            </button>
            <button className="secondary-button" onClick={onImportPluginDirectory} type="button">
              接入本地目录
            </button>
            <button className="secondary-button" onClick={onOpenSettings} type="button">
              添加自定义技能
            </button>
            <input
              ref={skillPackageInputRef}
              accept="application/json,.json"
              hidden
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                file.text().then((text) => onImportSkillPackage(text, file.name));
                event.currentTarget.value = "";
              }}
            />
          </div>
        </section>

        <div className="skills-tabs" aria-label="技能视图">
          <button
            className={activeTab === "installed" ? "active" : ""}
            onClick={() => setActiveTab("installed")}
            type="button"
          >
            已安装 <b>{enabledSkills.length}</b>
          </button>
          <button
            className={activeTab === "market" ? "active" : ""}
            onClick={() => setActiveTab("market")}
            type="button"
          >
            技能市场 <b>{skills.length}</b>
          </button>
        </div>

        <div className="skills-filter-row">
          <div className="module-search-bar">
            <Search size={18} />
            <input placeholder="搜索技能" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="chip-tabs">
            {categories.map((category) => (
              <button
                className={activeCategory === category ? "active" : ""}
                key={category}
                onClick={() => setActiveCategory(category)}
                type="button"
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <section className="skills-content-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">{activeTab === "installed" ? "Installed" : "Marketplace"}</p>
              <h3>{activeTab === "installed" ? "已安装技能" : "技能市场"}</h3>
            </div>
            <b className="status ready">{visibleListings.length}</b>
          </div>

          <div className={activeTab === "installed" ? "installed-skill-grid" : "skill-market-grid"}>
            {visibleListings.length === 0 ? (
              <EmptyState title="没有匹配的技能" detail="换一个分类或搜索词，或者到设置里添加自定义技能。" />
            ) : (
              visibleListings.map((listing) => (
                <article
                  className={listing.enabled ? "market-card skill-card enabled" : "market-card skill-card"}
                  key={listing.id}
                >
                  <div>
                    <Workflow size={17} />
                    <strong>{listing.name}</strong>
                    <span>{skillHubCategoryLabel(listing.category)}</span>
                    {listing.riskLevel === "high" && <span className="risk-badge high">高风险</span>}
                    {listing.riskLevel === "medium" && <span className="risk-badge medium">中风险</span>}
                  </div>
                  <p>{listing.description}</p>
                  <div className="skill-card-meta">
                    <span>{skillSourceLabel(listing.source)}</span>
                    <span>{listing.installed ? (listing.enabled ? "已启用" : "已安装") : "可安装"}</span>
                  </div>
                  <div className="market-card-actions">
                    {listing.installed ? (
                      <>
                        <button
                          className={listing.enabled ? "secondary-button danger-soft-button" : "primary-button"}
                          onClick={() => onToggleSkill(listing.id, !listing.enabled)}
                          type="button"
                        >
                          {listing.enabled ? "停用" : "启用"}
                        </button>
                        <button className="secondary-button" onClick={onOpenSettings} type="button">
                          配置
                        </button>
                      </>
                    ) : (
                      <button className="secondary-button" onClick={onOpenSettings} type="button">
                        了解更多
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

export function skillHubCategoryLabel(category: SkillHubListing["category"]): string {
  const labels: Record<SkillHubListing["category"], string> = {
    productivity: "推荐",
    engineering: "编程开发",
    office: "办公文档",
    research: "研究写作",
    integration: "集成"
  };
  return labels[category] ?? "推荐";
}

export function skillHubCategoryFromSkill(skill: SkillProfile): SkillHubListing["category"] {
  const text = `${skill.id} ${skill.name} ${skill.description}`.toLowerCase();
  if (/word|excel|ppt|office|报告|文档|表格/.test(text)) return "office";
  if (/code|terminal|filesystem|search|workspace|代码|命令/.test(text)) return "engineering";
  if (/web|research|搜索|网页/.test(text)) return "research";
  if (/mcp|im|email|integration|集成|邮件/.test(text)) return "integration";
  return "productivity";
}

export function skillSourceLabel(source: SkillProfile["source"]) {
  const labels: Record<SkillProfile["source"], string> = {
    built_in: "内置技能",
    custom: "自定义技能",
    extension: "扩展技能"
  };
  return labels[source];
}
