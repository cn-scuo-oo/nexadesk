import type { AutomationScheduleKind, AutomationRunStatus, ToolCall } from "@nexadesk/shared";

export function runtimeStatusLabel(status: RuntimeStatus): string {
  return status === "completed" ? "完成" : status === "failed" ? "失败" : status === "running" ? "运行中" : status;
}

export function automationScheduleKindLabel(kind: AutomationScheduleKind | string): string {
  const map: Record<string, string> = {
    manual: "手动",
    once: "一次",
    hourly: "每小时",
    daily: "每天",
    weekly: "每周"
  };
  return map[kind] ?? kind;
}

export function automationRunStatusLabel(status: AutomationRunStatus | string): string {
  return status === "completed" ? "完成" : status === "failed" ? "失败" : status === "running" ? "运行中" : status;
}

export function toolNameLabel(name: string): string {
  const map: Record<string, string> = {
    list_dir: "列目录",
    read_file: "读文件",
    write_file: "写文件",
    run_command: "执行命令",
    search: "搜索",
    browser: "浏览器",
    image_generate: "生成图片"
  };
  return map[name] ?? name;
}

export function toolStatusLabel(status: ToolCall["status"] | string): string {
  return status === "completed"
    ? "完成"
    : status === "failed"
      ? "失败"
      : status === "running"
        ? "运行中"
        : status === "queued"
          ? "排队"
          : status;
}

export function policyLabel(policy: string): string {
  return policy === "allow" ? "允许" : policy === "deny" ? "拒绝" : "询问";
}

type RuntimeStatus = "running" | "completed" | "failed" | string;
