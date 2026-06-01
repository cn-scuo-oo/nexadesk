# Roadmap

## Phase 1 - Model Center

- Status: complete
- Provider configuration supports base URL, API key, model names, capabilities, connection testing, and local save.
- Workbench messages use the selected Provider and model with streaming output.
- OpenAI-compatible, Ollama, OpenAI Responses, and Anthropic-style runtime paths are represented.

## Phase 2 - Cowork Agent

- Status: complete
- The Cowork Agent can request tools through native function/tool calls or the fallback `nexadesk-tool` block.
- Low-risk tools can list directories, read files, and search the workspace.
- High-risk tools enter approval before write, shell, browser, or image generation actions.
- Browser reads real web pages after approval, and image generation saves files through a configured image API.

## Phase 3 - Assistants and Skills

- Status: complete
- Built-in assistants include Cowork, Code, Word, Excel, PPT, File Organizer, and Report.
- Skills can be enabled, disabled, edited, and extended with user-created custom skills.
- Active assistant and enabled skills influence the runtime system prompt.

## Phase 4 - Desktop Packaging

- Status: first pass complete
- Electron packages the web app and bundled local API into a Windows desktop app.
- Desktop mode stores settings in Electron's user data directory.
- Provider API keys are encrypted at rest with an Electron `safeStorage`-protected master key.
- Windows NSIS installer generation is available through `npm run dist:win`.

## Phase 5 - Private GitHub Incubation

- Status: in progress
- The project is prepared for a private GitHub repository, not a public open-source release.
- Public release language has been removed from the main package metadata and README.
- Private CI validates typecheck, build, settings persistence, and desktop startup smoke tests.
- Private release and repository hygiene checklists are documented.

## Later Phases

- Public open-source license decision
- App signing and automatic updates
- GitHub release workflow
- Durable session database
- Plugin marketplace and skill import/export
- Remote access and mobile pairing
