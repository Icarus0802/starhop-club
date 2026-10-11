'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname,port=Number(process.env.PORT)||5173;
const version=require('./package.json').version;
const {verifiedRelease,createNativeApi}=require('./scripts/native-ai-server.cjs');
const nativeEnabled=verifiedRelease();
if(nativeEnabled)process.env.STARHOP_THREADS='8';
const nativeApi=createNativeApi({enabled:nativeEnabled,budgetMs:15000,engineName:'星河 2.2 · 深度收官',engine:nativeEnabled?require('./benchmarks/challenge-15-deep-native.cjs'):null});
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  const localHosts=new Set(['127.0.0.1:'+port,'localhost:'+port]);
  if(!localHosts.has(req.headers.host)){res.writeHead(403);res.end();return;}
  if(req.url==='/api/app/status'&&req.method==='GET'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({app:'starhop-club',version,installation:root}));return;
  }
  if(req.url==='/api/app/stop'&&req.method==='POST'){
    if(req.headers.origin!=='http://'+req.headers.host||req.headers['x-starhop-stop']!=='1'){res.writeHead(403);res.end();return;}
    res.writeHead(200,{'Content-Type':'application/json'});res.end('{"stopping":true}');
    nativeApi.close().finally(()=>server.close(()=>process.exit()));return;
  }
  if(await nativeApi.handle(req,res))return;
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)||pathname.includes('/.git')||pathname.includes('\\')||/^\/(?:runtime|arena-results|logs|release-package)(?:\/|$)/.test(pathname)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);});
});
server.listen(port,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+port));
server.on('error',error=>{console.error(error.message);nativeApi.close().finally(()=>process.exit(1));});
process.once('SIGINT',()=>{nativeApi.close().finally(()=>server.close(()=>process.exit()));});
process.once('SIGTERM',()=>{nativeApi.close().finally(()=>server.close(()=>process.exit()));});
