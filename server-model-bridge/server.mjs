import {createServer} from 'node:http';
import {timingSafeEqual,randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function createBridge(config) {
  let active=0; const counts=new Map();
  const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
  const error=(res,status,message)=>json(res,status,{error:{message,type:'bridge_error'}});
  const server=createServer(async(req,res)=>{
    const id=randomUUID(),started=Date.now(); let model='',acquired=false;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),config.timeoutMs||180000);
    res.on('close',()=>{if(!res.writableEnded)controller.abort();});
    try {
      if(req.headers.origin) return error(res,403,'Browser access is disabled');
      const provided=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+config.token);
      if(provided.length!==expected.length||!timingSafeEqual(provided,expected))return error(res,401,'Invalid bridge API key');
      res.setHeader('x-request-id',id);
      if(req.method==='GET'&&req.url==='/health')return json(res,200,{status:'ready',active,limit:config.maxConcurrent||24});
      if(req.method==='GET'&&req.url==='/v1/models')return json(res,200,{object:'list',data:Object.keys(config.models).map(id=>({id,object:'model',owned_by:'bedrock'}))});
      if(req.method!=='POST'||req.url!=='/v1/chat/completions')return error(res,404,'Not found');
      // Reserve a slot before buffering to bound memory under simultaneous requests.
      if(active>=(config.maxConcurrent||24)){res.setHeader('retry-after','1');return error(res,429,'Bridge concurrency limit reached');}
      active++;acquired=true;
      let size=0;const chunks=[];
      for await(const chunk of req){size+=chunk.length;if(size>4*1024*1024)return error(res,413,'Request too large');chunks.push(chunk);}
      let payload;try{payload=JSON.parse(Buffer.concat(chunks));}catch{return error(res,400,'Invalid JSON');}
      if(!payload||typeof payload.model!=='string'||!Array.isArray(payload.messages))return error(res,400,'model and messages are required');
      model=payload.model;const route=config.models[model];
      if(!route)return error(res,400,'Model not configured; see /v1/models');
      const count=counts.get(model)||0;
      if(count>=(config.perModelConcurrent||8)){res.setHeader('retry-after','1');return error(res,429,'Model concurrency limit reached');}
      counts.set(model,count+1);
      try {
        if(route.disableParallelTools&&payload.tools?.length)payload.parallel_tool_calls=false;
        if(payload.max_tokens===undefined&&payload.max_completion_tokens===undefined)payload.max_tokens=4096;
        const response=await fetch(config.upstream+route.path+'/chat/completions',{
          method:'POST',headers:{'content-type':'application/json','x-api-key':config.apiKey,accept:'application/json, text/event-stream'},
          body:JSON.stringify({...payload,model:route.id||model}),signal:controller.signal,redirect:'error'
        });
        const headers={'content-type':response.headers.get('content-type')||'application/json','cache-control':'no-store','x-accel-buffering':'no'};
        for(const h of ['retry-after','x-amzn-requestid'])if(response.headers.has(h))headers[h]=response.headers.get(h);
        res.writeHead(response.status,headers);res.flushHeaders();
        if(response.body)await pipeline(Readable.fromWeb(response.body),res);else res.end();
      } finally { counts.set(model,(counts.get(model)||1)-1); }
    }catch(e){if(!res.headersSent&&!res.destroyed)error(res,controller.signal.aborted?504:502,controller.signal.aborted?'Upstream deadline exceeded':'Upstream connection failed');else res.destroy();}
    finally {clearTimeout(timer);if(acquired)active--;console.log(JSON.stringify({id,model,status:res.statusCode,ms:Date.now()-started}));}
  });
  server.requestTimeout=60000;server.headersTimeout=15000;
  return server;
}
if(import.meta.url===pathToFileURL(process.argv[1]).href){
  const config=JSON.parse(readFileSync(process.argv[2],'utf8'));
  if(!config.token||config.token.length<32||!config.apiKey)throw Error('Missing bridge credentials');
  const server=createBridge(config);server.listen(config.port||18880,'127.0.0.1');
  process.on('SIGTERM',()=>{server.close();setTimeout(()=>process.exit(0),10000).unref();});
}
