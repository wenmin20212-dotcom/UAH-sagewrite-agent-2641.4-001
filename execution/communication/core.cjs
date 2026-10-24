// Same Windows user, local machine only. No remote addresses or arbitrary executable paths.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http'),os=require('node:os');
const registry=require('../agent-registry.cjs');
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
const canon=v=>process.platform==='win32'?path.resolve(v).toLowerCase():path.resolve(v);
function identity(root){const a=registry.inspect(root);return {agentKey:a.agentKey,installationKey:digest(a.agentKey+'\n'+canon(root)),root:a.directory,name:a.name};}
function folder(profile){return path.join(profile,'data/agent-communication');}
function read(file){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>262144)throw Error('Invalid communication record');return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(value),{mode:0o600});fs.renameSync(temp,file);}
function endpointFile(root,base=path.join(process.env.LOCALAPPDATA||os.homedir(),'UAH-AgentCommunication/endpoints')){return path.join(base,identity(root).installationKey+'.json');}
function settings(profile){try{return read(path.join(folder(profile),'settings.json'));}catch(e){if(e.code==='ENOENT')return {enabled:false,peers:[]};throw e;}}
function configure({root,profile,peerDirectory,enabled=true}){const self=identity(root),old=settings(profile);const peers=Array.isArray(old.peers)?old.peers:[];if(peerDirectory){const peer=identity(peerDirectory);if(peer.installationKey===self.installationKey)throw Error('Select another Agent installation');const i=peers.findIndex(p=>p.installationKey===peer.installationKey);if(i<0)peers.push(peer);else peers[i]=peer;}
 atomic(path.join(folder(profile),'settings.json'),{schema:'uah-agent-communication-settings/v1',enabled,peers});return {enabled,peers:peers.map(({agentKey,installationKey,name,root})=>({agentKey,installationKey,name,root})),scope:'text_only_no_tools'};}
function store(profile){const {DatabaseSync}=require('node:sqlite');fs.mkdirSync(folder(profile),{recursive:true});const db=new DatabaseSync(path.join(folder(profile),'messages.sqlite'));db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS messages(key TEXT PRIMARY KEY,body TEXT NOT NULL)');const get=key=>{const row=db.prepare('SELECT body FROM messages WHERE key=?').get(key);return row?JSON.parse(row.body):null;};return {get,insert:r=>db.prepare('INSERT INTO messages VALUES(?,?)').run(r.key,JSON.stringify(r)),put:r=>db.prepare('UPDATE messages SET body=? WHERE key=?').run(JSON.stringify(r),r.key),list:()=>db.prepare('SELECT body FROM messages ORDER BY rowid DESC LIMIT 100').all().map(r=>JSON.parse(r.body)),close:()=>db.close()};}
function publicMessage(r){const {key,direction,messageId,sender,recipient,text,status,reply,createdAt,updatedAt,error,sessionId}=r;return {key,direction,messageId,sender,recipient,text,status,reply,createdAt,updatedAt,error,sessionId};}
const validId=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(s);
function validText(s){return typeof s==='string'&&s.trim().length>0&&s.length<=12000;}
async function startReceiver({root,profile,reply,endpointBase,ownerPid,timeoutMs=120000}){
 const self=identity(root),db=store(profile),token=crypto.randomBytes(32).toString('hex'),file=endpointFile(root,endpointBase);let busy=false,closing=false;
 for(const r of db.list())if(r.direction==='incoming'&&r.status==='running'){r.status='interrupted';r.error='Receiver restarted; message was not replayed';db.put(r);}
 const server=http.createServer(async(req,res)=>{const answer=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};try{
 if(closing)return answer(503,{error:'stopping'});
 if(req.socket.remoteAddress!=='127.0.0.1'||req.headers.host!=='127.0.0.1:'+server.address().port||req.headers.origin||req.headers.authorization!=='Bearer '+token)return answer(403,{error:'local_authenticated_client_required'});
 if(req.method==='GET'&&req.url==='/status')return answer(200,{schema:'uah-agent-communication/v1',...self,scope:'text_only_no_tools'});
 if(req.method==='GET'&&req.url.startsWith('/messages/')){
 const url=new URL(req.url,'http://127.0.0.1'),messageId=url.pathname.slice('/messages/'.length),sender=identity(url.searchParams.get('senderRoot'));const policy=settings(profile);
 if(!validId(messageId)||!policy.enabled||!policy.peers?.some(p=>p.installationKey===sender.installationKey))return answer(403,{error:'sender_not_allowed'});
 const row=db.get('in:'+sender.installationKey+':'+messageId);return row?answer(200,publicMessage(row)):answer(404,{error:'message_not_found'});
 }
 if(req.method!=='POST'||req.url!=='/messages'||!String(req.headers['content-type']).startsWith('application/json'))return answer(404,{error:'not_found'});
 let data='',tooLarge=false;for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>65536){tooLarge=true;break;}}if(tooLarge)return answer(413,{error:'message_too_large'});let body;try{body=JSON.parse(data);}catch{return answer(400,{error:'invalid_json'});}
 if(!validId(body.messageId)||!validText(body.text)||typeof body.senderRoot!=='string')return answer(400,{error:'invalid_message'});
 const sender=identity(body.senderRoot),policy=settings(profile);if(!policy.enabled||!policy.peers?.some(p=>p.installationKey===sender.installationKey&&p.agentKey===sender.agentKey))return answer(403,{error:'sender_not_allowed'});
 const key='in:'+sender.installationKey+':'+body.messageId,hash=digest(body.text),old=db.get(key);if(old)return answer(old.payloadHash===hash?200:409,old.payloadHash===hash?publicMessage(old):{error:'message_id_conflict'});
 if(busy)return answer(429,{error:'receiver_busy'});busy=true;const now=new Date().toISOString(),row={key,direction:'incoming',messageId:body.messageId,sender,recipient:self,text:body.text,payloadHash:hash,status:'running',createdAt:now,updatedAt:now};db.insert(row);
 try{const result=await reply({sender,text:body.text,messageId:body.messageId,timeoutMs});if(!result||typeof result.text!=='string'||!result.text.trim()||result.text.length>48000)throw Error('Invalid reply');row.reply=result.text;row.sessionId=result.sessionId;row.status='completed';}catch(e){row.status='failed';row.error=e.code==='model_not_configured'?'model_not_configured':'Reply failed or timed out; request was not replayed';}finally{row.updatedAt=new Date().toISOString();db.put(row);busy=false;}return answer(200,publicMessage(row));
 }catch{return answer(400,{error:'communication_request_failed'});}});
 server.headersTimeout=10000;server.requestTimeout=15000;
 try{await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));atomic(file,{schema:'uah-agent-communication-endpoint/v1',...self,pid:process.pid,port:server.address().port,token,createdAt:new Date().toISOString()});}catch(e){db.close();server.close();throw e;}
 const close=async()=>{if(closing)return;closing=true;clearInterval(timer);try{if(read(file).token===token)fs.unlinkSync(file);}catch{}await new Promise(r=>server.close(r));db.close();};
 const timer=setInterval(()=>{try{if(ownerPid&&!require('../mobile-presence.cjs').alive(ownerPid)||!settings(profile).enabled)void close();}catch{void close();}},3000);timer.unref();
 return {port:server.address().port,close,descriptor:()=>read(file)};
}
async function request(endpoint,route,body,timeout=150000){if(endpoint.schema!=='uah-agent-communication-endpoint/v1'||!Number.isInteger(endpoint.port)||endpoint.port<1||endpoint.port>65535||!/^[a-f0-9]{64}$/.test(endpoint.token))throw Error('Invalid local endpoint');const response=await fetch('http://127.0.0.1:'+endpoint.port+route,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Bearer '+endpoint.token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)});const text=await response.text();if(text.length>100000)throw Error('Oversized reply');const value=JSON.parse(text);if(!response.ok)throw Object.assign(Error(value.error||'Communication failed'),{status:response.status});return value;}
async function send({root,profile,registryRoot,directory,text,messageId,endpointBase,timeoutMs=150000}){
 if(!validId(messageId)||!validText(text))throw Error('Provide a stable message ID (8–100 safe characters) and 1–12000 characters of text');const self=identity(root),target=identity(directory);
 const known=registry.createRegistry(registryRoot).list().agents.some(a=>a.agentKey===target.agentKey&&a.locations.some(l=>canon(l.directory)===canon(directory)));if(!known)throw Error('Recipient installation must be registered first');
 const endpoint=read(endpointFile(directory,endpointBase));if(endpoint.installationKey!==target.installationKey||endpoint.agentKey!==target.agentKey)throw Error('Recipient endpoint identity changed');
 const db=store(profile),key='out:'+target.installationKey+':'+messageId;try{const hash=digest(text),old=db.get(key);if(old){if(old.payloadHash!==hash)throw Error('Message ID already used for different text');return publicMessage(old);}
 const status=await request(endpoint,'/status',null,5000);if(status.installationKey!==target.installationKey)throw Error('Recipient identity mismatch');const now=new Date().toISOString(),row={key,direction:'outgoing',messageId,sender:self,recipient:target,text,payloadHash:hash,status:'sending',createdAt:now,updatedAt:now};db.insert(row);
 try{const result=await request(endpoint,'/messages',{messageId,senderRoot:self.root,text},timeoutMs);if(result.messageId!==messageId||result.sender?.installationKey!==self.installationKey||result.recipient?.installationKey!==target.installationKey)throw Error('Reply identity mismatch');row.status=result.status;row.reply=result.reply;row.error=result.error;row.sessionId=result.sessionId;}catch(e){row.status=e.status&&e.status<500?'rejected':'uncertain';row.error=e.status&&e.status<500?e.message:'No confirmed result; do not resend automatically';}row.updatedAt=new Date().toISOString();db.put(row);return publicMessage(row);
 }finally{db.close();}}
function history(profile){const db=store(profile);try{return {schema:'uah-agent-communication-history/v1',messages:db.list().map(publicMessage)};}finally{db.close();}}
async function refresh({root,profile,directory,messageId,endpointBase}){
 const self=identity(root),target=identity(directory),db=store(profile),key='out:'+target.installationKey+':'+messageId;
 try{const row=db.get(key);if(!row)throw Error('No existing outgoing message');const endpoint=read(endpointFile(directory,endpointBase));if(endpoint.installationKey!==target.installationKey)throw Error('Recipient identity changed');const remote=await request(endpoint,'/messages/'+encodeURIComponent(messageId)+'?senderRoot='+encodeURIComponent(self.root),null,5000);
 if(remote.sender?.installationKey!==self.installationKey||remote.recipient?.installationKey!==target.installationKey||remote.messageId!==messageId)throw Error('Reply identity mismatch');row.status=remote.status;row.reply=remote.reply;row.error=remote.error;row.sessionId=remote.sessionId;row.updatedAt=new Date().toISOString();db.put(row);return publicMessage(row);
 }finally{db.close();}
}
module.exports={refresh,identity,folder,settings,configure,endpointFile,read,startReceiver,send,history,request};
