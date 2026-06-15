/* ── Theme System ── */
type ThemeAppearance = "light" | "dark";
type ThemeId =
  | "honey-warm"
  | "classic-dark"
  | "midnight"
  | "nord"
  | "emerald"
  | "sakura"
  | "rose"
  | "cyber"
  | "paper"
  | "mocha"
  | "ocean"
  | "dawn"
  | "sunset"
  | "daylight";
type ThemeMode = "light" | "dark" | "system";
interface ThemeMeta {
  id: ThemeId;
  name: string;
  description: string;
  appearance: ThemeAppearance;
  preview: string[];
}
const THEMES: ThemeMeta[] = [
  {
    id: "honey-warm",
    name: "蜂蜜暖光",
    description: "NexaDesk 默认暖色主题",
    appearance: "light",
    preview: ["#fff4c8", "#1f6b50", "#d97800", "#2e6f55"]
  },
  {
    id: "daylight",
    name: "日光清透",
    description: "清爽蓝调浅色主题",
    appearance: "light",
    preview: ["#f0f4f8", "#1f6b50", "#0ea5e9", "#2e6f55"]
  },
  {
    id: "paper",
    name: "纸墨淡雅",
    description: "仿纸质感温暖浅色",
    appearance: "light",
    preview: ["#f5f0e8", "#1f6b50", "#b8860b", "#2e6f55"]
  },
  {
    id: "sakura",
    name: "樱花粉白",
    description: "柔和粉色主题",
    appearance: "light",
    preview: ["#fdf2f8", "#ec4899", "#a855f7", "#10b981"]
  },
  {
    id: "classic-dark",
    name: "经典深色",
    description: "纯净近黑暗色主题",
    appearance: "dark",
    preview: ["#0f1117", "#1f6b50", "#d97800", "#3daa7a"]
  },
  {
    id: "midnight",
    name: "午夜深蓝",
    description: "深邃冷调暗色主题",
    appearance: "dark",
    preview: ["#0f172a", "#14b8a6", "#d97800", "#14b8a6"]
  },
  {
    id: "nord",
    name: "Nord 极光",
    description: "受 Nord 配色启发",
    appearance: "dark",
    preview: ["#2e3440", "#88c0d0", "#ebcb8b", "#a3be8c"]
  },
  {
    id: "emerald",
    name: "翡翠暗绿",
    description: "自然灵动翡翠绿",
    appearance: "dark",
    preview: ["#0a1a14", "#10b981", "#67e8f9", "#10b981"]
  },
  {
    id: "rose",
    name: "暗夜玫红",
    description: "深邃浪漫玫红",
    appearance: "dark",
    preview: ["#1a0f14", "#f472b6", "#c084fc", "#34d399"]
  },
  {
    id: "cyber",
    name: "赛博霓虹",
    description: "科技感霓虹暗色",
    appearance: "dark",
    preview: ["#0a0a14", "#818cf8", "#22d3ee", "#34d399"]
  },
  {
    id: "mocha",
    name: "摩卡棕韵",
    description: "温暖棕调暗色主题",
    appearance: "dark",
    preview: ["#1a1410", "#d97800", "#c084fc", "#8fbc6a"]
  },
  {
    id: "ocean",
    name: "深海蔚蓝",
    description: "深邃海洋蓝调",
    appearance: "dark",
    preview: ["#0a1628", "#38bdf8", "#f59e0b", "#34d399"]
  },
  {
    id: "dawn",
    name: "黎明暖橙",
    description: "破晓暖橙暗色",
    appearance: "dark",
    preview: ["#1a1018", "#f97316", "#e879f9", "#4ade80"]
  },
  {
    id: "sunset",
    name: "落日余晖",
    description: "夕阳暖金色调",
    appearance: "dark",
    preview: ["#1a1008", "#f59e0b", "#ef4444", "#84cc16"]
  }
];
const themeStorageKey = "nexadesk.theme.id";
const themeModeStorageKey = "nexadesk.theme.mode";
