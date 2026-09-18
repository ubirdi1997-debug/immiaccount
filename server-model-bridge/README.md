# uSafe server model bridge

Service: `usafe-model-bridge.service` on the existing EC2 host.
Listener: `127.0.0.1:18880` (not exposed to the internet).

## Quick Start

Start the authenticated SSH tunnel on Windows:
```powershell
cd "D:\uSafe Arch\server-model-bridge"
.\start-bridge.bat
```

Or use the PowerShell script directly:
```powershell
.\start-tunnel.ps1
```

Configure your OpenAI-compatible VS Code provider with base URL
`http://127.0.0.1:18881/v1` and the API key from
`%LOCALAPPDATA%\uSafeArch\gemma-vscode-bridge\server-client.json`.
Do not commit or share that file. Existing VS Code settings were not changed.

## Available Models (11 total)

### Mistral (Claude-class for coding & reasoning)
| Model | Description | Best For |
|-------|-------------|----------|
| `mistral.mistral-large-3-675b-instruct` | Top-tier 675B model | Complex reasoning, analysis, comparable to Claude 3.5 Sonnet |
| `mistral.devstral-2-123b` | Development specialist | Coding tasks, debugging, refactoring |
| `mistral.magistral-small-2509` | Efficient reasoning | Quick tasks, general assistance |
| `mistral.voxtral-small-24b-2507` | Compact multimodal | Light tasks, quick responses |

### Qwen (Excellent for coding)
| Model | Description | Best For |
|-------|-------------|----------|
| `qwen.qwen3-coder-next` | Latest coder | Cutting-edge coding assistance |
| `qwen.qwen3-coder-480b-a35b-instruct` | Large coder | Complex code generation, architecture |
| `qwen.qwen3-coder-30b-a3b-instruct` | Efficient coder | Fast coding, quick fixes |
| `qwen.qwen3-next-80b-a3b-instruct` | General purpose | Mixed tasks, documentation |

### Google Gemma
| Model | Description | Best For |
|-------|-------------|----------|
| `google.gemma-4-31b` | Efficient 31B | General tasks, quick responses |
| `google.gemma-4-e2b` | Compact | Lightweight tasks |
| `google.gemma-4-26b-a4b` | Larger 26B | More complex reasoning |

## Architecture

```
VS Code Copilot Chat
        │
        ▼
Local SSH Tunnel (port 18881)
        │
        ▼
EC2 Bridge Server (port 18880)
        │
        ▼
AWS Bedrock via Mantle API
```

## Configuration

Server secrets: `/etc/usafe-model-bridge/config.json`, root-only, supplied to a
DynamicUser systemd service using LoadCredential. No prompts, outputs or keys are logged.
Logs contain request IDs, model IDs, status and elapsed milliseconds.

- 24 simultaneous requests total, 8 per model; excess gets 429 + Retry-After.
- Streaming forwards chunks with backpressure; disconnect aborts upstream.
- 180-second deadline; no automatic retries (avoids duplicate billed requests).
- Exact model allowlist, no silent model fallback, upstream HTTP errors preserved.
- GET /v1/models and /health require the bridge bearer token.
- All models use native Bedrock `/v1` path on the Mantle endpoint.
- Generation speed/quotas still depend on AWS. An extra server hop is not a latency guarantee.

Tests: `node --test server-model-bridge/server.test.mjs`.

## Troubleshooting

### Bridge not responding
```powershell
# Check if tunnel is running
Test-NetConnection -ComputerName 127.0.0.1 -Port 18881

# Restart the tunnel
cd "D:\uSafe Arch\server-model-bridge"
.\start-bridge.bat
```

### Model not found error
- Ensure the bridge is running before starting VS Code
- Check that the model ID matches exactly (case-sensitive)
- Verify with: `curl http://127.0.0.1:18881/v1/models`

### Environment variable not set
```powershell
$config = Get-Content "$env:LOCALAPPDATA\uSafeArch\gemma-vscode-bridge\server-client.json" | ConvertFrom-Json
[Environment]::SetEnvironmentVariable("USAFE_BRIDGE_KEY", $config.api_key, "User")
```
