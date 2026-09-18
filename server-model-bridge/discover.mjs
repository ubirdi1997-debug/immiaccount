import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const key=readFileSync(join(process.env.LOCALAPPDATA,'uSafeArch/gemma-vscode-bridge/bedrock-key.txt'),'utf8').trim();
for (const path of ['/v1/models','/openai/v1/models']) {
try { const r=await fetch('https://bedrock-mantle.us-west-2.api.aws'+path,{headers:{'x-api-key':key},signal:AbortSignal.timeout(20000)}); const d=await r.json(); console.log(path,r.status,r.ok?(d.data||d.models||[]).map(x=>x.id||x.modelId).filter(x=>/gemma|qwen|grok/i.test(x)):JSON.stringify(d).slice(0,400)); } catch(e){console.log(path,e.name)}
}
