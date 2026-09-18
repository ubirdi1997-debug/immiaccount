import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createBridge} from './server.mjs';
test('authentication, route selection, concurrency, upstream errors and streamed output',async()=>{
 let active=0,peak=0;const paths=[];
 const upstream=createServer(async(req,res)=>{paths.push(req.url);active++;peak=Math.max(peak,active);for await(const c of req){};await new Promise(r=>setTimeout(r,40));res.writeHead(req.url.startsWith('/bad')?400:200,{'content-type':'text/event-stream'});res.end('data: [DONE]\n\n');active--;});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const bridge=createBridge({token:'test-token',apiKey:'test',upstream:`http://127.0.0.1:${upstream.address().port}`,models:{gemma:{path:'/openai/v1'},grok:{path:'/openai/v1'},qwen:{path:'/v1'},bad:{path:'/bad'}}});
 await new Promise(r=>bridge.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${bridge.address().port}`;
 try{assert.equal((await fetch(base+'/v1/models')).status,401);
 const responses=await Promise.all(['gemma','grok','qwen','bad'].map(model=>fetch(base+'/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer test-token'},body:JSON.stringify({model,messages:[{role:'user',content:'test'}],stream:true})})));
 assert.deepEqual(responses.map(r=>r.status),[200,200,200,400]);assert.ok(peak>1);assert.deepEqual(paths.sort(),['/openai/v1/chat/completions','/openai/v1/chat/completions','/v1/chat/completions','/bad/chat/completions'].sort());for(const r of responses)assert.equal(await r.text(),'data: [DONE]\n\n');
 }finally{bridge.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(r=>bridge.close(r)),new Promise(r=>upstream.close(r))]);}
});
