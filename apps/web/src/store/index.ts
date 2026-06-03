import { createSlice, createAsyncThunk, configureStore, type PayloadAction } from "@reduxjs/toolkit";
import type {
  AppSettings,
  AppSnapshot,
  McpServerSettings,
  McpServerTestResult,
  McpServerToolsResult,
  AgentProfile,
  RuntimeTelemetryEntry,
  MemoryEntry,
  SessionSummary,
  McpToolPolicy
} from "@nexadesk/shared";

/* ── API helpers ── */
const api = {
  async get<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
    return res.json();
  },
  async post<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`POST ${url} failed: ${res.status}`);
    return res.json();
  },
  async put<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`PUT ${url} failed: ${res.status}`);
    return res.json();
  },
  async del(url: string): Promise<void> {
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) throw new Error(`DELETE ${url} failed: ${res.status}`);
  }
};

/* ── Async Thunks ── */
export const fetchSnapshot = createAsyncThunk("app/fetchSnapshot", () => api.get<AppSnapshot>("/api/snapshot"));
export const fetchSettings = createAsyncThunk("app/fetchSettings", () => api.get<AppSettings>("/api/settings"));
export const saveSettings = createAsyncThunk("app/saveSettings", (settings: AppSettings) => api.put<{ settings: AppSettings }>("/api/settings", { settings }));
export const testMcpServer = createAsyncThunk("mcp/testServer", (server: McpServerSettings) => api.post<McpServerTestResult>("/api/mcp/test", { server }));
export const discoverMcpTools = createAsyncThunk("mcp/discoverTools", (server: McpServerSettings) => api.post<McpServerToolsResult>("/api/mcp/tools", { server }));
export const fetchMemory = createAsyncThunk("memory/fetch", () => api.get<{ entries: MemoryEntry[]; summaries: SessionSummary[] }>("/api/memory"));
export const deleteMemoryEntry = createAsyncThunk("memory/deleteEntry", (entryId: string) => api.del(`/api/memory/entries/${entryId}`));
export const scanSkillSecurity = createAsyncThunk("skills/scan", (skillId: string) => api.post<{ score: number; level: string; findings: Array<{ dimension: string; status: string; detail: string }> }>("/api/skills/scan", { skillId }));

/* ── App Slice ── */
interface AppState {
  snapshot: AppSnapshot | null;
  settings: AppSettings | null;
  loading: boolean;
  error: string | null;
  mode: "live" | "demo";
}

const appSlice = createSlice({
  name: "app",
  initialState: { snapshot: null, settings: null, loading: true, error: null, mode: "demo" } as AppState,
  reducers: {
    setMode(state, action: PayloadAction<"live" | "demo">) { state.mode = action.payload; },
    clearError(state) { state.error = null; }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSnapshot.pending, (state) => { state.loading = true; })
      .addCase(fetchSnapshot.fulfilled, (state, action) => { state.snapshot = action.payload; state.mode = "live"; state.loading = false; state.error = null; })
      .addCase(fetchSnapshot.rejected, (state, action) => { state.loading = false; state.error = action.error.message ?? "Failed to load"; })
      .addCase(fetchSettings.fulfilled, (state, action) => { state.settings = action.payload; })
      .addCase(saveSettings.fulfilled, (state, action) => { state.settings = action.payload.settings; });
  }
});

/* ── MCP Slice ── */
interface McpState {
  testResults: Record<string, McpServerTestResult>;
  toolResults: Record<string, McpServerToolsResult>;
  testingId: string | null;
  refreshingId: string | null;
}

const mcpSlice = createSlice({
  name: "mcp",
  initialState: { testResults: {}, toolResults: {}, testingId: null, refreshingId: null } as McpState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(testMcpServer.pending, (state, action) => { state.testingId = action.meta.arg.id; })
      .addCase(testMcpServer.fulfilled, (state, action) => {
        state.testResults[action.meta.arg.id] = action.payload;
        state.testingId = null;
      })
      .addCase(testMcpServer.rejected, (state) => { state.testingId = null; })
      .addCase(discoverMcpTools.pending, (state, action) => { state.refreshingId = action.meta.arg.id; })
      .addCase(discoverMcpTools.fulfilled, (state, action) => {
        state.toolResults[action.meta.arg.id] = action.payload;
        state.refreshingId = null;
      })
      .addCase(discoverMcpTools.rejected, (state) => { state.refreshingId = null; });
  }
});

/* ── Memory Slice ── */
interface MemoryState {
  entries: MemoryEntry[];
  summaries: SessionSummary[];
  loading: boolean;
}

const memorySlice = createSlice({
  name: "memory",
  initialState: { entries: [], summaries: [], loading: false } as MemoryState,
  reducers: {
    addEntry(state, action: PayloadAction<MemoryEntry>) { state.entries.push(action.payload); },
    updateEntry(state, action: PayloadAction<{ id: string; patch: Partial<MemoryEntry> }>) {
      const idx = state.entries.findIndex((e) => e.id === action.payload.id);
      if (idx >= 0) state.entries[idx] = { ...state.entries[idx], ...action.payload.patch };
    },
    removeEntry(state, action: PayloadAction<string>) {
      state.entries = state.entries.filter((e) => e.id !== action.payload);
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMemory.pending, (state) => { state.loading = true; })
      .addCase(fetchMemory.fulfilled, (state, action) => { state.entries = action.payload.entries; state.summaries = action.payload.summaries; state.loading = false; })
      .addCase(fetchMemory.rejected, (state) => { state.loading = false; })
      .addCase(deleteMemoryEntry.fulfilled, (state, action) => { state.entries = state.entries.filter((e) => e.id !== action.meta.arg); });
  }
});

/* ── Agents Slice ── */
interface AgentsState {
  agents: AgentProfile[];
  activeAgentId: string | null;
}

const agentsSlice = createSlice({
  name: "agents",
  initialState: { agents: [], activeAgentId: null } as AgentsState,
  reducers: {
    setActiveAgent(state, action: PayloadAction<string>) { state.activeAgentId = action.payload; },
    toggleAgentEnabled(state, action: PayloadAction<string>) {
      const agent = state.agents.find((a) => a.id === action.payload);
      if (agent) agent.enabled = !agent.enabled;
    }
  },
  extraReducers: (builder) => {
    builder.addCase(fetchSnapshot.fulfilled, (state, action) => {
      state.agents = action.payload.agents;
      if (!state.activeAgentId || !action.payload.agents.some((a) => a.id === state.activeAgentId)) {
        state.activeAgentId = action.payload.agents.find((a) => a.enabled)?.id ?? null;
      }
    });
  }
});

/* ── Telemetry Slice ── */
interface TelemetryState {
  entries: RuntimeTelemetryEntry[];
  loaded: boolean;
}

const telemetrySlice = createSlice({
  name: "telemetry",
  initialState: { entries: [], loaded: false } as TelemetryState,
  reducers: {
    addEntry(state, action: PayloadAction<RuntimeTelemetryEntry>) {
      state.entries.unshift(action.payload);
      if (state.entries.length > 80) state.entries.pop();
    }
  }
});

/* ── Store ── */
export const store = configureStore({
  reducer: {
    app: appSlice.reducer,
    mcp: mcpSlice.reducer,
    memory: memorySlice.reducer,
    agents: agentsSlice.reducer,
    telemetry: telemetrySlice.reducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const { setMode, clearError } = appSlice.actions;
export const { addEntry: addTelemetryEntry } = telemetrySlice.actions;
export const { addEntry: addMemoryEntry, updateEntry: updateMemoryEntry, removeEntry: removeMemoryEntry } = memorySlice.actions;
export const { setActiveAgent, toggleAgentEnabled } = agentsSlice.actions;
