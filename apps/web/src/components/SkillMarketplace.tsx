import React, { useState, useMemo } from "react";

interface SkillListing {
  id: string;
  name: string;
  description: string;
  category: string;
  source: string;
  installed: boolean;
  enabled: boolean;
  riskLevel: "low" | "medium" | "high";
  tags: string[];
}

interface SkillMarketplaceProps {
  currentSkills: SkillListing[];
  onInstall: (skillId: string) => void;
  onUninstall: (skillId: string) => void;
  onToggle: (skillId: string, enabled: boolean) => void;
}

export const SkillMarketplace: React.FC<SkillMarketplaceProps> = ({
  currentSkills,
  onInstall,
  onUninstall,
  onToggle
}) => {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [view, setView] = useState<"installed" | "browse">("installed");

  // Marketplace seed skills (extension catalog)
  const marketplaceSkills: SkillListing[] = useMemo(() => [
    { id: "skill-wechat-ops", name: "IM 运维助手", description: "将飞书/钉钉群消息转为 Agent 任务，支持审批、摘要和执行回执。", category: "integration", source: "extension", installed: false, enabled: false, riskLevel: "medium", tags: ["im", "agent-hub", "approval"] },
    { id: "skill-workspace-artifacts", name: "Workspace Artifacts", description: "把代码 diff、命令输出和报告沉淀成可审阅工件。", category: "engineering", source: "extension", installed: false, enabled: false, riskLevel: "low", tags: ["workspace", "diff", "artifact"] },
    { id: "skill-web-scraper", name: "网页抓取器", description: "抓取网页内容并结构化提取关键信息。", category: "research", source: "extension", installed: false, enabled: false, riskLevel: "medium", tags: ["web", "scraper", "research"] },
    { id: "skill-data-analyzer", name: "数据分析师", description: "读取 CSV/Excel/JSON 数据文件并执行统计分析和可视化。", category: "productivity", source: "extension", installed: false, enabled: false, riskLevel: "low", tags: ["data", "analysis", "csv"] },
    { id: "skill-email-copilot", name: "邮件副驾", description: "撰写、回复和管理邮件，支持 SMTP/IMAP 协议。", category: "office", source: "extension", installed: false, enabled: false, riskLevel: "medium", tags: ["email", "communication"] },
    { id: "skill-git-copilot", name: "Git 协作助手", description: "自动生成 commit message、Code Review、分支管理等。", category: "engineering", source: "extension", installed: false, enabled: false, riskLevel: "high", tags: ["git", "devops", "review"] },
    { id: "skill-translator", name: "翻译引擎", description: "多语言翻译和本地化，支持 50+ 语言。", category: "productivity", source: "extension", installed: false, enabled: false, riskLevel: "low", tags: ["translate", "i18n"] },
    { id: "skill-image-gen", name: "AI 绘图助手", description: "生成和编辑图片，支持 Stable Diffusion 和 DALL-E。", category: "productivity", source: "extension", installed: false, enabled: false, riskLevel: "low", tags: ["image", "ai-gen", "creative"] },
  ], []);

  // Merge installed skills with marketplace
  const allSkills = useMemo(() => {
    const installedMap = new Map(currentSkills.map((s) => [s.id, s]));
    const merged = [...currentSkills];
    marketplaceSkills.forEach((ms) => {
      if (!installedMap.has(ms.id)) merged.push(ms);
    });
    return merged;
  }, [currentSkills, marketplaceSkills]);

  const categories = useMemo(() => {
    const cats = new Set(allSkills.map((s) => s.category));
    return ["all", ...Array.from(cats)];
  }, [allSkills]);

  const filtered = allSkills.filter((s) => {
    if (view === "installed" && !s.installed) return false;
    if (view === "browse" && s.installed) return false;
    if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) &&
        !s.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const riskColor = (level: string) => {
    switch (level) {
      case "high": return "#ef4444";
      case "medium": return "#f59e0b";
      case "low": return "#2e8b68";
      default: return "#9ca3af";
    }
  };

  return (
    <div className="skill-marketplace">
      <div className="skill-marketplace-header">
        <div className="skill-marketplace-tabs">
          <button className={`skill-tab ${view === "installed" ? "active" : ""}`} onClick={() => setView("installed")}>
            Installed ({currentSkills.length})
          </button>
          <button className={`skill-tab ${view === "browse" ? "active" : ""}`} onClick={() => setView("browse")}>
            Browse ({marketplaceSkills.length})
          </button>
        </div>
        <div className="skill-marketplace-search">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search skills..." className="input" />
        </div>
      </div>

      <div className="skill-category-chips">
        {categories.map((cat) => (
          <button key={cat} className={`skill-category-chip ${categoryFilter === cat ? "active" : ""}`}
            onClick={() => setCategoryFilter(cat)}>
            {cat === "all" ? "All" : cat}
          </button>
        ))}
      </div>

      <div className="skill-marketplace-grid">
        {filtered.length === 0 ? (
          <div className="skill-empty">No skills found.</div>
        ) : (
          filtered.map((skill) => (
            <article key={skill.id} className="skill-marketplace-card">
              <div className="skill-card-header">
                <span className="skill-category-badge">{skill.category}</span>
                <span className="skill-risk-badge" style={{ backgroundColor: riskColor(skill.riskLevel) + "20", color: riskColor(skill.riskLevel) }}>
                  {skill.riskLevel}
                </span>
              </div>
              <h4 className="skill-card-name">{skill.name}</h4>
              <p className="skill-card-desc">{skill.description}</p>
              <div className="skill-card-tags">
                {skill.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="skill-tag">{tag}</span>
                ))}
              </div>
              <div className="skill-card-actions">
                {skill.installed ? (
                  <>
                    <label className="skill-toggle">
                      <input type="checkbox" checked={skill.enabled}
                        onChange={(e) => onToggle(skill.id, e.target.checked)} />
                      <span>{skill.enabled ? "Enabled" : "Disabled"}</span>
                    </label>
                    <button className="btn btn-sm btn-danger" onClick={() => onUninstall(skill.id)}>Uninstall</button>
                  </>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => onInstall(skill.id)}>Install</button>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
};

export default SkillMarketplace;
