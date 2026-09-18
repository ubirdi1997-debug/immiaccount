import {readFileSync,writeFileSync} from 'node:fs';import {join} from 'node:path';import {randomBytes} from 'node:crypto';
const dir=join(process.env.LOCALAPPDATA,'uSafeArch/gemma-vscode-bridge');
// Model configurations for VS Code Bedrock model picker
// All models use Bedrock native path /v1 (tested and working)
// Note: xAI Grok models are listed in /v1/models but require different routing
// and are not currently callable through the standard Bedrock Converse API
const modelIds=[
  // Google models
  'google.gemma-4-31b',
  'google.gemma-4-e2b',                    // Efficient model
  'google.gemma-4-26b-a4b',                // Larger model
  // Qwen models (excellent for coding)
  'qwen.qwen3-coder-next',                 // Latest coder (tested working)
  'qwen.qwen3-coder-480b-a35b-instruct',   // Large coder
  'qwen.qwen3-coder-30b-a3b-instruct',      // Efficient coder
  'qwen.qwen3-next-80b-a3b-instruct',       // General purpose
  // Mistral models (comparable to Claude for coding & complex reasoning)
  'mistral.mistral-large-3-675b-instruct', // Top-tier 675B model (tested working), comparable to Claude 3.5 Sonnet
  'mistral.devstral-2-123b',               // Specialized for development/coding tasks
  'mistral.magistral-small-2509',          // Efficient reasoning model
  'mistral.voxtral-small-24b-2507',        // Compact multimodal model
];
const models={};
for(const id of modelIds){
  // All models use Bedrock native path /v1
  models[id]={
    path:'/v1',
    // Google models have issues with parallel tool calls
    disableParallelTools:id.startsWith('google.'),
    // Map to actual Bedrock model ID
    id:id
  };
}
const file=join(dir,'server-config.json');let token;try{token=JSON.parse(readFileSync(file)).token}catch{token=randomBytes(32).toString('hex')}
writeFileSync(file,JSON.stringify({token,apiKey:readFileSync(join(dir,'bedrock-key.txt'),'utf8').trim(),upstream:'https://bedrock-mantle.us-west-2.api.aws',port:18880,maxConcurrent:24,perModelConcurrent:8,timeoutMs:180000,models},null,2));console.log('Server configuration saved with '+Object.keys(models).length+' models.');
