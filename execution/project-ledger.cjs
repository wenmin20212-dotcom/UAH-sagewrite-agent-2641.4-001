// Instance-owned history survives removal of the original project or export folder.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function createLedger(dataRoot){
 function use(fn){fs.mkdirSync(dataRoot,{recursive:true});const db=new DatabaseSync(path.join(dataRoot,'project-ledger.sqlite'));try{db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,snapshot TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,projectId TEXT NOT NULL,kind TEXT NOT NULL,at TEXT NOT NULL,body TEXT NOT NULL);');return fn(db);}finally{db.close();}}
 function remember(p){return use(db=>db.prepare('INSERT INTO projects VALUES(?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot').run(p.id,JSON.stringify(p)));}
 function record(id,kind,body){return use(db=>{if(!db.prepare('SELECT 1 FROM projects WHERE id=?').get(id))throw Error('Project must be registered first');const event={id:crypto.randomUUID(),projectId:id,kind,at:new Date().toISOString(),...body};db.prepare('INSERT INTO events VALUES(?,?,?,?,?)').run(event.id,id,kind,event.at,JSON.stringify(event));return event;});}
 function history(id){return use(db=>db.prepare('SELECT body FROM events WHERE projectId=? ORDER BY rowid').all(id).map(r=>JSON.parse(r.body)));}
 function list(){return use(db=>db.prepare('SELECT snapshot FROM projects ORDER BY id').all().map(r=>{const p=JSON.parse(r.snapshot),events=db.prepare('SELECT body FROM events WHERE projectId=? ORDER BY rowid').all(p.id).map(r=>JSON.parse(r.body));return {...p,workspaceAvailable:fs.existsSync(path.join(p.workspace,'project.json')),delivery:{historyCount:events.length,last:events.at(-1)||null,github:events.filter(e=>e.kind==='github_release_verified').at(-1)||null}};}));}
 function exported(project,receipt){remember(project);const manifest=receipt.manifestPath;return record(project.id,'export_prepared',{version:manifest?JSON.parse(fs.readFileSync(manifest,'utf8')).version:null,roleIdentity:project.roleIdentity||null,manifestPath:manifest,manifestSha256:digest(manifest)});}
 function packaged(project,receipt,manifestPath,outputRoot){if(receipt.status!=='packaged')throw Error('A successful package receipt is required');remember(project);const file=path.join(outputRoot,'package-receipt.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));return record(project.id,'packaged',{version:manifest.version,roleIdentity:project.roleIdentity||null,manifestPath,manifestSha256:digest(manifestPath),outputRoot,receiptPath:file,receiptSha256:digest(file),githubStatus:'not_published'});}
 async function verifyGithub({projectId,repository,tag,assetName,localInstaller},api){
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||!tag||tag.length>200||!assetName||!path.isAbsolute(localInstaller))throw Error('Invalid GitHub release request');
  const project=list().find(p=>p.id===projectId);if(!project?.roleIdentity?.code)throw Error('A confirmed numbered role is required');
  const code=project.roleIdentity.code;if(!repository.split('/')[1].includes(code)||!assetName.includes(code))throw Error('Repository and installer filename must contain the complete role code: '+code);
  if(!/\.exe$/i.test(assetName)||path.basename(localInstaller)!==assetName)throw Error('Select the complete Windows Setup.exe, not source or incremental update ZIP');
  const fd=fs.openSync(localInstaller,'r'),magic=Buffer.alloc(2);try{fs.readSync(fd,magic,0,2,0);}finally{fs.closeSync(fd);}if(magic.toString()!=='MZ')throw Error('Installer is not a Windows executable');
  const packages=history(projectId).filter(e=>e.kind==='packaged');if(!packages.length)throw Error('No recorded demold package; import its original receipt first');
  const release=await api(`repos/${repository}/releases/tags/${encodeURIComponent(tag)}`);
  if(release.draft)throw Error('Draft release is not a published release');
  const matches=(release.assets||[]).filter(a=>a.name===assetName);if(matches.length!==1)throw Error('Complete installer asset was not found uniquely');
  const asset=matches[0],sha256=digest(localInstaller);if(asset.state!=='uploaded'||asset.size!==fs.statSync(localInstaller).size||asset.digest!=='sha256:'+sha256)throw Error('Remote installer size/hash is absent or differs; cannot mark verified');
  const repo=await api(`repos/${repository}`),url=`https://github.com/${repository}/releases/tag/${encodeURIComponent(tag)}`;
  return record(projectId,'github_release_verified',{repository,repositoryUrl:`https://github.com/${repository}`,visibility:repo.private?'private':'public',tag,releaseUrl:url,releaseId:release.id,assetId:asset.id,downloadUrl:asset.browser_download_url,assetName,bytes:asset.size,sha256,roleIdentity:project.roleIdentity,packagingEventId:packages.at(-1).id,verification:'github_asset_bytes_match_local_exe',completeness:'installer_contents_not_inspected',notice:'Remote asset verified. EXE extension and hash do not prove a complete installation; clean-machine installation validation must be recorded separately.'});
 }
 return {remember,record,history,list,exported,packaged,verifyGithub};
}
module.exports={createLedger};
