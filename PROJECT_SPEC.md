# Project Specification: Immigration Account Tracker with AI Model Bridges

## Overview
A self-hosted reverse proxy for VEVO (Visa Entitlement Verification Online) with server-side userscript injection,  connected with admin ui with simple database

1. create admin panel with user management with all the fields
2. connect the https://online.immi.gov.au/evo/firstParty?actionType=query url to our aws lightsail smallest server use cludflare to add a temporary sub domain connected name vevo.usafe.in 
3. dyanmic result pages with html design same as the  vevo website 

---

## Components

### 1. Application Tracker (Port 3000 → 8080 via nginx)
**Purpose**: Admin creates user accounts with visa application details; users view their own records.

**Features**:
- Admin authentication with secure scrypt password hashing
- User management (create, update, status tracking: In progress / Approved / Rejected)
- Audit history with timestamps, admin ID, status, notes
- Session management (8-hour expiry, HttpOnly cookies, CSRF protection)
- Rate limiting on login attempts
- JSON file storage (`data/db.json`) with atomic writes

**Public URL**: `https://<codespace>-8080.app.github.dev`
**Admin Panel**: `/admin`
**Userscript Download**: `/downloads/vevo-helper.user.js`

---

### 2. VEVO Reverse Proxy (Port 3001 → 8081 via nginx)
**Purpose**: MITM proxy for `online.immi.gov.au` with server-side userscript injection.

**Features**:
- Basic Auth using tracker admin credentials
- Proxies GET/HEAD/POST to `https://online.immi.gov.au`
- Filters cookies (allows only session/security cookies)
- Rewrites HTML responses: replaces upstream domain with proxy origin
- **Injects userscript at `</body>`**: `<script src="/__local/vevo-helper.js" defer></script>`
- Serves injected userscript at `/__local/vevo-helper.js` (wraps original in IIFE with GM_* polyfills)
- Rate limiting on failed auth attempts

**Public URL**: `https://<codespace>-8081.app.github.dev/evo/firstParty?actionType=query`

**Userscript Features** (`vevo-helper.user.js`):
- Auto-fill visa holder enquiry form from stored profiles
- Profile management (save/load/delete) in localStorage
- Form field mapping for document type, number, country, name, DOB, etc.

---

### 3. AWS Bedrock Model Bridge (Port 18882)
**Purpose**: OpenAI-compatible endpoint for VS Code Copilot Chat via AWS Bedrock Mantle API.

**Models (11 total)**:
| Provider | Models |
|----------|--------|
| Mistral | `mistral.mistral-large-3-675b-instruct`, `mistral.devstral-2-123b`, `mistral.magistral-small-2509`, `mistral.voxtral-small-24b-2507` |
| Qwen | `qwen.qwen3-coder-next`, `qwen.qwen3-coder-480b-a35b-instruct`, `qwen.qwen3-coder-30b-a3b-instruct`, `qwen.qwen3-next-80b-a3b-instruct` |
| Google Gemma | `google.gemma-4-31b`, `google.gemma-4-e2b`, `google.gemma-4-26b-a4b` |

**Configuration**:
- Concurrency: 24 total, 8 per model
- Timeout: 180s
- Streaming with backpressure
- Bearer token auth
- Model allowlist (no fallback)

**VS Code Config**: `http://127.0.0.1:18882/{token}/v1` with API key `local-bridge`

---

### 4. Google AI Studio (Gemini) Bridge (Port 18883)
**Purpose**: OpenAI-compatible endpoint for VS Code via Google Generative Language API.

**Models (8 total)**:
- `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-1.5-flash-8b`
- `gemini-2.0-flash-exp`, `gemini-2.0-flash-thinking-exp`, `gemini-2.0-pro-exp`
- `gemini-2.5-pro-exp-03-25`, `gemini-2.5-flash`

**Features**:
- Converts OpenAI chat format → Gemini format
- SSE streaming → OpenAI chunk format
- Safety settings configured
- Function calling support (tools → functionDeclarations)

**VS Code Config**: `http://127.0.0.1:18883/{token}/v1` with API key `local-bridge`

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      GitHub Codespace                           │
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │   nginx     │    │   nginx     │    │   Node.js Server    │  │
│  │   :8080     │    │   :8081     │    │   (tracker :3000)   │  │
│  └──────┬──────┘    └──────┬──────┘    └─────────────────────┘  │
│         │                  │                                     │
│         ▼                  ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Public URLs (GitHub tunnel)                 │    │
│  │  https://<name>-8080.app.github.dev  → Tracker           │    │
│  │  https://<name>-8081.app.github.dev  → VEVO Proxy        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │  Bedrock Bridge     │  │  Gemini Bridge      │              │
│  │  :18882 (local)     │  │  :18883 (local)     │              │
│  └─────────────────────┘  └─────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Credentials

### Tracker Admin
- **Login**: `admin`
- **Password**: `mfSZe1-0OULMmtBWykd0bUIAe0kUAk2-`
- **Stored in**: `tracker/data/admin-credentials.json`

### API Keys (Configured)
- **AWS Bedrock Mantle**: `ABSKTWFudGxlQXBpS2V5LTI2eTh5Mm91LWF0LTA1OTkyNjIwODg1MDppYXJ4aENTSlE4OWpLZUxpV295YWkvNjZ3azBJb3BIaDFNa2ZZcFowRG9Ob3p6cm9KNmprenU2RGxjRT0=`
- **Google AI Studio**: `AQ.Ab8RN6KipPBvC6swXD96QX45ah-g0fRoDTl-lk4WyjFemWLp3A-`

---

## VS Code Integration

Add to `settings.json`:
```json
{
  "chat.languageModelOverrides": {
    "gemini-1.5-pro": { "vendor": "Google", "family": "gemini", "version": "1.5-pro", "maxTokens": 8192 },
    "gemini-1.5-flash": { "vendor": "Google", "family": "gemini", "version": "1.5-flash", "maxTokens": 8192 },
    "gemini-2.5-pro": { "vendor": "Google", "family": "gemini", "version": "2.5-pro", "maxTokens": 8192 },
    "gemini-2.5-flash": { "vendor": "Google", "family": "gemini", "version": "2.5-flash", "maxTokens": 8192 },
    "mistral-large": { "vendor": "Mistral", "family": "mistral", "version": "large-3-675b", "maxTokens": 4096 },
    "qwen-coder": { "vendor": "Qwen", "family": "qwen", "version": "qwen3-coder-next", "maxTokens": 4096 }
  }
}
```

Configure Copilot Chat → Language Model → "Add custom model" with bridge URLs.

---

## Limitations & Notes

1. **GitHub Codespaces URLs require GitHub auth** for the tunnel. True public access without auth requires deploying to own infrastructure (AWS Lightsail/EC2, VPS, etc.) with custom domain.

2. **VEVO Proxy** requires admin Basic Auth - this is by design for security.

3. **Model bridges** run locally on `127.0.0.1` - for team access, would need to expose via tunnel or deploy bridges to server.

4. **Database** is JSON file-based - suitable for small installations only.

5. **No HTTPS termination** at app level - nginx handles proxy, Codespaces provides TLS.

---

## Commands

```bash
# Tracker deployment
cd tracker
npm run deploy      # Start (creates admin if needed)
npm run restart     # Restart all services
npm run stop        # Stop all services
npm run status      # Check status
npm test            # Run integration tests

# Model bridges (run in background)
# Bedrock: BEDROCK_API_KEY=... node gemma-vscode-bridge.mjs
# Gemini:  GOOGLE_AI_STUDIO_KEY=... node google-ai-studio-bridge.mjs
```

---

## Future Enhancements (If Deploying to Own Infrastructure)

- [ ] Custom domain with DNS (e.g., `tracker.example.com`, `vevo.example.com`)
- [ ] HTTPS with Let's Encrypt / ACME
- [ ] PostgreSQL / SQLite for tracker database
- [ ] Docker Compose for orchestration
- [ ] Bridge services as systemd units
- [ ] Monitoring / logging (Prometheus, Grafana)
- [ ] CI/CD pipeline for deployments