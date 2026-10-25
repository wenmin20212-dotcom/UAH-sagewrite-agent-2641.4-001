const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function inventory(root){const out=[];function walk(dir,prefix=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name),rel=prefix+e.name;if(/\.(?:bak|backup)$/i.test(e.name))continue;if(e.isSymbolicLink())throw Error('Skill links are not supported');if(e.isDirectory())walk(f,rel+'/');else if(e.isFile())out.push(rel);}}walk(root);return out;}
function sync({codeRoot,configRoot,skills}){
 const receiptPath=path.join(configRoot,'product-skills-state.json');
 const state=fs.existsSync(receiptPath)?JSON.parse(fs.readFileSync(receiptPath,'utf8')):{schema:'uah-product-skills/v1',files:{}};
 const legacyFile=path.join(codeRoot,'execution/skill-legacy-hashes.json'),legacy=fs.existsSync(legacyFile)?JSON.parse(fs.readFileSync(legacyFile,'utf8')):{};
 const result={updated:[],unchanged:[],conflicts:[]};
 for(const s of skills){
  if(!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s.name))throw Error('Invalid skill name');
  const src=path.resolve(codeRoot,'agent',s.path),base=path.resolve(codeRoot,'agent');
  if(!src.startsWith(base+path.sep))throw Error('Skill source escapes agent');
  const dst=path.join(configRoot,'skills',s.name);
  for(const rel of inventory(src)){
   const key=s.name+'/'+rel,source=path.join(src,rel),target=path.join(dst,rel),bytes=fs.readFileSync(source),next=hash(bytes);
   for(let q=path.dirname(target);q!==path.dirname(configRoot);q=path.dirname(q)){if(fs.existsSync(q)&&fs.lstatSync(q).isSymbolicLink())throw Error('Skill target ancestor link');if(q===path.dirname(q))break;}
   let current=null;if(fs.existsSync(target)){if(fs.lstatSync(target).isSymbolicLink())throw Error('Skill target link');current=hash(fs.readFileSync(target));}
   if(current===next){state.files[key]=next;result.unchanged.push(key);continue;}
   if(current!==null&&current!==state.files[key]&&current!==legacy[key]){result.conflicts.push(key);continue;}
   fs.mkdirSync(path.dirname(target),{recursive:true});
   if(current!==null){const backup=path.join(configRoot,'product-skill-backups',current,s.name,rel);fs.mkdirSync(path.dirname(backup),{recursive:true});if(!fs.existsSync(backup))fs.copyFileSync(target,backup);}
   fs.writeFileSync(target,bytes);state.files[key]=next;result.updated.push(key);
  }
 }
 fs.mkdirSync(configRoot,{recursive:true});fs.writeFileSync(receiptPath,JSON.stringify(state,null,2));
 fs.writeFileSync(path.join(configRoot,'product-skills-last-sync.json'),JSON.stringify({...result,at:new Date().toISOString()},null,2));
 return result;
}
module.exports={sync};
