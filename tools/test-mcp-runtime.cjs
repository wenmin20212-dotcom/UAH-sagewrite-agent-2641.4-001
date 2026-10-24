const path=require('node:path'),fs=require('node:fs'),{spawn}=require('node:child_process');
const root=path.resolve(process.argv[2]),entry=path.join(root,'agent/portable-source/sagewrite/engine/mcp-server/src/index.mjs');
const child=spawn(path.join(root,'runtime/node.exe'),[entry],{cwd:root,env:{...process.env,SAGEWRITE_WORKSPACE_ROOT:path.join(root,'workspace')},windowsHide:true,stdio:['pipe','pipe','pipe']});
let buffer='',errors='',done=false;const timer=setTimeout(()=>finish(Error('MCP startup timed out')),30000);
function send(v){child.stdin.write(JSON.stringify({jsonrpc:'2.0',...v})+'\n');}
function finish(error,count){if(done)return;done=true;clearTimeout(timer);child.kill();if(error){console.error(error.message,errors.slice(0,300));process.exitCode=1;}else{const report={passed:true,stdioInitialize:true,toolsList:true,toolCount:count,modelCalled:false};fs.writeFileSync('.release-work/mcp-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}}
child.stderr.on('data',d=>errors+=String(d));child.on('error',finish);child.on('exit',()=>{if(!done)finish(Error('MCP exited before tools/list'));});
child.stdout.on('data',d=>{buffer+=String(d);let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let m;try{m=JSON.parse(line);}catch{continue;}if(m.error)return finish(Error(m.error.message));if(m.id===1){send({method:'notifications/initialized'});send({id:2,method:'tools/list',params:{}});}if(m.id===2){const count=m.result?.tools?.length;if(count!==40)return finish(Error('Expected 40 SageWrite tools; got '+count));finish(null,count);}}});
send({id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'sagewrite-release-verification',version:'0.1.1'}}});
