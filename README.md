# immiaccount

The **Start VS Code bridge** task starts `gemma-vscode-bridge.mjs` when this
folder opens. In Codespaces it runs inside the Codespace; when opening a local
Windows checkout it runs on Windows. Node.js 18 or newer must be installed.
If VS Code prompts, allow automatic tasks for this trusted workspace. You can
also use **Tasks: Manage Automatic Tasks in Folder** to enable them, or
**Tasks: Run Task → Start VS Code bridge** to start it manually.

One-time setup on each host:

- **Windows:** Existing configuration and `bedrock-key.txt` in
  `%LOCALAPPDATA%\uSafeArch\gemma-vscode-bridge` are reused.
- **Codespaces:** Add a Codespaces secret named `BEDROCK_API_KEY`, grant this
  repository access, and restart the Codespace so its terminals inherit it.
  Alternatively, put `bedrock-key.txt` in
  `~/.config/uSafeArch/gemma-vscode-bridge`.

The bridge creates a private `config.json` if absent (default port 18882) and
writes `local-client.json` alongside it. In your OpenAI-compatible VS Code
provider, use that host's `base_url` and `api_key` from `local-client.json`.
The URL contains a secret token; keep these files outside the repository.
Provider configuration is a separate one-time step in each environment.
In Codespaces, the provider extension must run in the remote extension host
so it can reach the bridge on `127.0.0.1`. No public port is needed.

Linux respects `XDG_CONFIG_HOME`; `GEMMA_BRIDGE_CONFIG_DIR` can override the
configuration directory on any host. `BEDROCK_API_KEY` or
`AWS_BEARER_TOKEN_BEDROCK` overrides the local key file. Existing port and token
settings are preserved. The separate EC2 SSH tunnel in `server-model-bridge/`
is not required for this direct bridge.
