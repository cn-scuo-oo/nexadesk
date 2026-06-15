import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from "recharts";

export interface RuntimeMetricsData {
  timestamp: string;
  provider: string;
  model: string;
  firstTokenMs: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  status: "success" | "error" | "pending";
}

interface RuntimeChartProps {
  data: RuntimeMetricsData[];
  type?: "line" | "area" | "bar";
  dataKey?: keyof RuntimeMetricsData;
  title?: string;
  height?: number;
  color?: string;
}

/**
 * NexaDesk Runtime Metrics Chart
 * Displays AI model performance metrics over time using Recharts.
 */
export const RuntimeChart: React.FC<RuntimeChartProps> = ({
  data,
  type = "area",
  dataKey = "durationMs",
  title,
  height = 300,
  color = "#1f6b50",
}) => {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-current/10 bg-surface-raised/50"
        style={{ height }}
      >
        <p className="text-secondary text-sm">No metrics data available</p>
      </div>
    );
  }

  const formatValue = (value: number, key: string) => {
    if (key.includes("Token")) return value.toLocaleString();
    if (key.includes("Ms")) return `${value}ms`;
    return value.toString();
  };

  const chartProps = {
    data,
    margin: { top: 5, right: 30, left: 20, bottom: 5 },
  };

  const commonAxisProps = {
    tick: { fontSize: 12, fill: "currentColor", opacity: 0.6 },
    stroke: "currentColor",
    strokeOpacity: 0.2,
  };

  const renderChart = () => {
    switch (type) {
      case "line":
        return (
          <LineChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
            <XAxis dataKey="timestamp" {...commonAxisProps} />
            <YAxis {...commonAxisProps} tickFormatter={(v) => formatValue(v, dataKey)} />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--theme-surface-raised)",
                border: "1px solid var(--theme-border)",
                borderRadius: "var(--theme-radius)",
                fontSize: "12px",
              }}
              formatter={(value: number) => [formatValue(value, dataKey), dataKey]}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3, fill: color }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        );

      case "bar":
        return (
          <BarChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
            <XAxis dataKey="timestamp" {...commonAxisProps} />
            <YAxis {...commonAxisProps} tickFormatter={(v) => formatValue(v, dataKey)} />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--theme-surface-raised)",
                border: "1px solid var(--theme-border)",
                borderRadius: "var(--theme-radius)",
                fontSize: "12px",
              }}
              formatter={(value: number) => [formatValue(value, dataKey), dataKey]}
            />
            <Legend />
            <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        );

      case "area":
      default:
        return (
          <AreaChart {...chartProps}>
            <defs>
              <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
            <XAxis dataKey="timestamp" {...commonAxisProps} />
            <YAxis {...commonAxisProps} tickFormatter={(v) => formatValue(v, dataKey)} />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--theme-surface-raised)",
                border: "1px solid var(--theme-border)",
                borderRadius: "var(--theme-radius)",
                fontSize: "12px",
              }}
              formatter={(value: number) => [formatValue(value, dataKey), dataKey]}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorGradient)"
            />
          </AreaChart>
        );
    }
  };

  return (
    <div className="rounded-lg border border-current/10 bg-surface/50 p-4">
      {title && (
        <h3 className="text-sm font-semibold text-secondary mb-3">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
};

/**
 * Token Usage Summary Card
 */
interface TokenSummaryProps {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost?: number;
}

export const TokenSummary: React.FC<TokenSummaryProps> = ({
  inputTokens,
  outputTokens,
  totalTokens,
  cost,
}) => {
  return (
    <div className="grid grid-cols-4 gap-4">
      <div className="rounded-lg border border-current/10 bg-surface/50 p-3 text-center">
        <p className="text-xs text-secondary mb-1">Input Tokens</p>
        <p className="text-lg font-semibold text-primary">{inputTokens.toLocaleString()}</p>
      </div>
      <div className="rounded-lg border border-current/10 bg-surface/50 p-3 text-center">
        <p className="text-xs text-secondary mb-1">Output Tokens</p>
        <p className="text-lg font-semibold text-accent">{outputTokens.toLocaleString()}</p>
      </div>
      <div className="rounded-lg border border-current/10 bg-surface/50 p-3 text-center">
        <p className="text-xs text-secondary mb-1">Total Tokens</p>
        <p className="text-lg font-semibold">{totalTokens.toLocaleString()}</p>
      </div>
      {cost !== undefined && (
        <div className="rounded-lg border border-current/10 bg-surface/50 p-3 text-center">
          <p className="text-xs text-secondary mb-1">Estimated Cost</p>
          <p className="text-lg font-semibold text-success">${cost.toFixed(4)}</p>
        </div>
      )}
    </div>
  );
};

export default RuntimeChart;
