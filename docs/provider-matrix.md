# Domestic Provider Matrix

Last checked: 2026-06-02.

This matrix is the baseline for China-friendly model providers bundled in NexaDesk. It records the default Base URL, default model names, tracked capabilities, and the status of local verification.

The static check is automated by `npm run provider:matrix`. Live provider checks require user-owned API keys and can be run with `npm run provider:matrix:live`; the script only probes each provider's `/models` endpoint and does not send chat prompts.

## Verification Status

| Provider | Provider ID | Base URL | Default models | Capabilities tracked | API key env | Status |
| --- | --- | --- | --- | --- | --- | --- |
| DeepSeek | `deepseek` | `https://api.deepseek.com` | `deepseek-v4-flash`, `deepseek-v4-pro`, `deepseek-chat`, `deepseek-reasoner` | streaming, function calling, structured output | `DEEPSEEK_API_KEY` | Official docs checked; live key test pending |
| Alibaba Cloud Bailian / Qwen | `dashscope-qwen` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus`, `qwen-max`, `qwen-turbo`, `qwen-vl-plus` | streaming, function calling, vision, structured output | `DASHSCOPE_API_KEY` | Official docs checked; live key test pending |
| SiliconFlow | `siliconflow-cn` | `https://api.siliconflow.cn/v1` | `deepseek-ai/DeepSeek-V3`, `Qwen/Qwen2.5-72B-Instruct` | streaming, function calling, structured output | `SILICONFLOW_API_KEY` | Official docs checked; live key test pending |
| Moonshot Kimi | `moonshot` | `https://api.moonshot.cn/v1` | `kimi-k2.6`, `kimi-k2.5`, `moonshot-v1-128k`, `moonshot-v1-32k`, `moonshot-v1-8k` | streaming, function calling, vision, structured output | `MOONSHOT_API_KEY` | Official docs checked; live key test pending |
| Zhipu GLM | `zhipu` | `https://open.bigmodel.cn/api/paas/v4` | `glm-5.1`, `glm-5-turbo`, `glm-5`, `glm-4.7`, `glm-4.7-flash` | streaming, function calling, web search, structured output | `ZHIPU_API_KEY` | Official docs checked; live key test pending |

## How To Run Live Checks

PowerShell example:

```powershell
$env:DEEPSEEK_API_KEY = "sk-..."
$env:DASHSCOPE_API_KEY = "sk-..."
$env:SILICONFLOW_API_KEY = "sk-..."
$env:MOONSHOT_API_KEY = "sk-..."
$env:ZHIPU_API_KEY = "sk-..."
npm run provider:matrix:live
```

CI runs the static matrix only. Do not put provider API keys into GitHub Actions unless the repository owner intentionally creates private repository secrets and accepts the provider billing risk.

## Notes

- NexaDesk's in-app "Test connection", "Refresh models", and the live matrix script use the same low-cost pattern: `GET {baseUrl}/models` with a Bearer API key.
- Model catalogs change quickly. The bundled defaults are a practical starting set, not an exhaustive list.
- If a provider deprecates a model, update `packages/shared/src/index.ts`, this document, and `scripts/provider-matrix-check.mjs` in the same change.
- Existing installed settings may keep user-edited Provider values. The default matrix applies to new defaults and recovered settings, while user settings remain under user control.

## Official References

- DeepSeek API Docs: https://api-docs.deepseek.com/
- Alibaba Cloud Bailian OpenAI compatibility: https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope
- SiliconFlow chat completions: https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions
- Moonshot Kimi API overview: https://platform.kimi.com/docs/api/overview
- Zhipu GLM API reference: https://docs.bigmodel.cn/api-reference
