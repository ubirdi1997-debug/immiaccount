import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { Readable } from 'node:stream';

const configDir = process.env.GEMINI_BRIDGE_CONFIG_DIR || join(
  process.platform === 'win32'
    ? (process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'))
    : (process.env.XDG_CONFIG_HOME || join(homedir(), '.config')),
  'uSafeArch', 'gemini-vscode-bridge',
);

function readOptional(file) {
  try { return readFileSync(join(configDir, file), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

const apiKey = (process.env.GOOGLE_AI_STUDIO_KEY || process.env.GEMINI_API_KEY || readOptional('gemini-key.txt') || '').trim();
if (!apiKey) {
  console.error(`Bridge setup required: set GOOGLE_AI_STUDIO_KEY or GEMINI_API_KEY, or create ${join(configDir, 'gemini-key.txt')}.`);
  process.exit(1);
}

mkdirSync(configDir, { recursive: true, mode: 0o700 });
let savedConfig = readOptional('config.json');
if (savedConfig === undefined) {
  try {
    writeFileSync(join(configDir, 'config.json'), JSON.stringify({ port: 18883, token: randomBytes(32).toString('hex') }, null, 2), { mode: 0o600, flag: 'wx' });
  } catch (error) { if (error.code !== 'EEXIST') throw error; }
  savedConfig = readOptional('config.json');
}
const config = JSON.parse(savedConfig);
const port = config.port;
const prefix = `/${config.token}`;

const geminiBase = 'https://generativelanguage.googleapis.com/v1beta';

const models = {
  'gemini-1.5-pro': { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' },
  'gemini-1.5-flash': { id: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
  'gemini-1.5-flash-8b': { id: 'gemini-1.5-flash-8b', displayName: 'Gemini 1.5 Flash-8B' },
  'gemini-2.0-flash-exp': { id: 'gemini-2.0-flash-exp', displayName: 'Gemini 2.0 Flash (Experimental)' },
  'gemini-2.0-flash-thinking-exp': { id: 'gemini-2.0-flash-thinking-exp', displayName: 'Gemini 2.0 Flash Thinking (Experimental)' },
  'gemini-2.0-pro-exp': { id: 'gemini-2.0-pro-exp', displayName: 'Gemini 2.0 Pro (Experimental)' },
  'gemini-2.5-pro-exp-03-25': { id: 'gemini-2.5-pro-exp-03-25', displayName: 'Gemini 2.5 Pro (Experimental)' },
  'gemini-2.5-flash': { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
};

function json(res, status, message) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ error: { message } }));
}

function modelList(res) {
  const data = Object.entries(models).map(([id, m]) => ({ id, object: 'model', owned_by: 'google', display_name: m.displayName }));
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ object: 'list', data }));
}

const server = createServer(async (req, res) => {
  if (req.headers.origin) return json(res, 403, 'Browser origins are not allowed');
  if (req.url === `${prefix}/health` && req.method === 'GET') return json(res, 200, 'ready');
  if (req.url === `${prefix}/v1/models` && req.method === 'GET') return modelList(res);
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

    console.log(`[${new Date().toLocaleTimeString()}] Incoming model request: ${payload.model}`);

    const modelConfig = models[payload.model];
    if (!modelConfig) {
      return json(res, 400, `Model not found: ${payload.model}`);
    }

    // Convert OpenAI format to Gemini format
    const geminiPayload = {
      contents: payload.messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      })),
      generationConfig: {
        temperature: payload.temperature ?? 0.7,
        topP: payload.top_p ?? 0.95,
        topK: payload.top_k ?? 40,
        maxOutputTokens: payload.max_tokens ?? 8192,
        stopSequences: payload.stop,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    };

    if (payload.tools?.length) {
      geminiPayload.tools = payload.tools.map(t => ({
        functionDeclarations: [{
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        }]
      }));
    }

    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });

    const upstreamUrl = `${geminiBase}/models/${modelConfig.id}:streamGenerateContent?key=${apiKey}&alt=sse`;

    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'text/event-stream',
      },
      body: JSON.stringify(geminiPayload),
      signal: controller.signal,
    });

    res.writeHead(upstream.status, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      'connection': 'keep-alive',
    });

    if (upstream.body) {
      let buffer = '';
      for await (const chunk of Readable.fromWeb(upstream.body)) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              res.write('data: [DONE]\n\n');
              break;
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (content) {
                const openAIChunk = {
                  id: `chatcmpl-${randomBytes(8).toString('hex')}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: payload.model,
                  choices: [{ index: 0, delta: { content }, finish_reason: null }],
                };
                res.write(`data: ${JSON.stringify(openAIChunk)}\n\n`);
              }
            } catch {}
          }
        }
      }
    } else {
      res.end();
    }
  } catch (error) {
    console.error('Bridge error:', error);
    if (!res.headersSent) {
      json(res, 502, error.name === 'AbortError' ? 'Request cancelled' : 'Gemini bridge request failed');
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
        console.log(`Gemini bridge already running on 127.0.0.1:${port}`);
        return;
      }
    } catch {}
  }
  console.error(`Cannot start Gemini bridge: ${error.code || error.message}`);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  writeFileSync(join(configDir, 'local-client.json'), JSON.stringify({ base_url: `http://127.0.0.1:${port}${prefix}/v1`, api_key: 'local-bridge' }, null, 2), { mode: 0o600 });
  console.log(`Google AI Studio (Gemini) VS Code bridge ready on 127.0.0.1:${port}`);
  console.log(`Provider connection details: ${join(configDir, 'local-client.json')}`);
});