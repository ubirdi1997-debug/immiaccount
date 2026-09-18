import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { Readable } from 'node:stream';

const configDir = process.env.GEMMA_BRIDGE_CONFIG_DIR || join(
  process.platform === 'win32'
    ? (process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'))
    : (process.env.XDG_CONFIG_HOME || join(homedir(), '.config')),
  'uSafeArch', 'gemma-vscode-bridge',
);
function readOptional(file) {
  try { return readFileSync(join(configDir, file), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}
const apiKey = (process.env.BEDROCK_API_KEY || process.env.AWS_BEARER_TOKEN_BEDROCK || readOptional('bedrock-key.txt') || '').trim();
if (!apiKey) {
  console.error(`Bridge setup required: set BEDROCK_API_KEY (a Codespaces secret), or create ${join(configDir, 'bedrock-key.txt')}. Then rerun the Start VS Code bridge task.`);
  process.exit(1);
}
mkdirSync(configDir, { recursive: true, mode: 0o700 });
let savedConfig = readOptional('config.json');
if (savedConfig === undefined) {
  try {
    writeFileSync(join(configDir, 'config.json'), JSON.stringify({ port: 18882, token: randomBytes(32).toString('hex') }, null, 2), { mode: 0o600, flag: 'wx' });
  } catch (error) { if (error.code !== 'EEXIST') throw error; }
  savedConfig = readOptional('config.json');
}
const config = JSON.parse(savedConfig);
const port = config.port;
const prefix = `/${config.token}`;
const mantleBase = 'https://bedrock-mantle.us-west-2.api.aws';

if (!/^[a-f0-9]{48,}$/.test(config.token) || !Number.isInteger(port) || port < 1024 || port > 65535 || !apiKey) {
  throw new Error('Invalid local bridge configuration');
}

function json(res, status, message) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ error: { message } }));
}

const server = createServer(async (req, res) => {
  if (req.headers.origin) return json(res, 403, 'Browser origins are not allowed');
  if (req.url === `${prefix}/health` && req.method === 'GET') return json(res, 200, 'ready');
  if (req.url !== `${prefix}/v1/chat/completions` || req.method !== 'POST') return json(res, 404, 'Not found');

  const chunks = [];
  let length = 0;
  try {
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 4 * 1024 * 1024) return json(res, 413, 'Request too large');
      chunks.push(chunk);
    }
    
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.messages) || typeof payload.model !== 'string') {
      return json(res, 400, 'Invalid chat request');
    }

    // Print to terminal to see what VS Code is requesting
    console.log(`[${new Date().toLocaleTimeString()}] Incoming model request: ${payload.model}`);

    // Route Gemma models to /openai/v1 and all others (Qwen, DeepSeek, Grok, MiniMax, GLM) to /v1
    const upstreamUrl = payload.model.startsWith('google.gemma')
      ? `${mantleBase}/openai/v1/chat/completions`
      : `${mantleBase}/v1/chat/completions`;

    // Disable parallel tool calls only for Gemma
    if (Array.isArray(payload.tools) && payload.tools.length && payload.model.startsWith('google.gemma')) {
      payload.parallel_tool_calls = false;
    }

    if (payload.max_tokens === undefined && payload.max_completion_tokens === undefined) {
      payload.max_tokens = 8192;
    }

    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });

    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    res.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    });

    if (upstream.body) Readable.fromWeb(upstream.body).pipe(res);
    else res.end();
  } catch (error) {
    console.error('Bridge error:', error);
    if (!res.headersSent) {
      json(res, 502, error.name === 'AbortError' ? 'Request cancelled' : 'Bedrock bridge request failed');
    } else {
      res.destroy(error);
    }
  }
});

server.on('error', async (error) => {
  if (error.code === 'EADDRINUSE') {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${prefix}/health`, { signal: AbortSignal.timeout(3000) });
      const body = await response.json();
      if (response.ok && body.error?.message === 'ready') {
        console.log(`VS Code bridge already running on 127.0.0.1:${port}`);
        return;
      }
    } catch {}
  }
  console.error(`Cannot start VS Code bridge: ${error.code || error.message}`);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  writeFileSync(join(configDir, 'local-client.json'), JSON.stringify({ base_url: `http://127.0.0.1:${port}${prefix}/v1`, api_key: 'local-bridge' }, null, 2), { mode: 0o600 });
  console.log(`Universal Bedrock Mantle VS Code bridge ready on 127.0.0.1:${port}`);
  console.log(`Provider connection details: ${join(configDir, 'local-client.json')}`);
});
