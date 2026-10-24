const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),arg=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1];};
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const {files}=require('./apply-child-upgrade.cjs');
(async()=>{
 const base=path.resolve(arg('--base')||''),output=path.resolve(arg('--output')||'.release-work/payload-0.1.2');
 if(!arg('--base'))throw Error('Supply --base <matching desktop runtime directory>');
 if(!output.startsWith(path.join(root,'.release-work')+path.sep)||fs.existsSync(output))throw Error('Choose a fresh output under .release-work');
 const backend=path.resolve(arg('--backend')||path.join(base,'app/BOSS-win32-x64/resources/bin/goose.exe')),native=JSON.parse(fs.readFileSync(path.join(root,'native/context-budget/runtime.json')));
 if(hash(backend)!==native.sha256)throw Error('Matching context-budget native engine required');
 for(const n of ['app','runtime','execution/node_modules'])if(!fs.existsSync(path.join(base,n)))throw Error('Missing runtime dependency '+n);
 // Copy only program runtime; never copy data, workspace, updates or instance identity.
 for(const n of ['app','runtime']){files(path.join(base,n));fs.cpSync(path.join(base,n),path.join(output,n),{recursive:true});}
 for(const n of ['agent','assets','execution','updater'])fs.cpSync(path.join(root,n),path.join(output,n),{recursive:true});
 fs.cpSync(path.join(base,'execution/node_modules'),path.join(output,'execution/node_modules'),{recursive:true});
 const mcpDeps=path.join(root,'packaging/mcp-runtime/node_modules');if(!fs.existsSync(mcpDeps))throw Error('Run npm ci --prefix packaging/mcp-runtime --ignore-scripts first');
 fs.cpSync(mcpDeps,path.join(output,'agent/portable-source/sagewrite/engine/mcp-server/node_modules'),{recursive:true});
 for(const n of ['agent.json','README.md','LICENSE-Goose','LICENSE-SageWrite'])fs.copyFileSync(path.join(root,n),path.join(output,n));
 fs.cpSync(path.join(root,'docs'),path.join(output,'docs'),{recursive:true});
 fs.copyFileSync(backend,path.join(output,'app/BOSS-win32-x64/resources/bin/goose.exe'));fs.writeFileSync(path.join(output,'native-backend.json'),JSON.stringify(native,null,2));
 const asar=require('@electron/asar'),archive=path.join(output,'app/BOSS-win32-x64/resources/app.asar'),stage=output+'-asar-stage';asar.extractAll(archive,stage);fs.copyFileSync(path.join(root,'host/uah-standalone-host.cjs'),path.join(stage,'uah-standalone-host.cjs'));await asar.createPackage(stage,archive+'.new');fs.renameSync(archive+'.new',archive);asar.uncacheAll();
 const cfg=JSON.parse(fs.readFileSync(path.join(root,'updater/config.template.json')));
 cfg.productBaseline=['agent','assets','execution'].flatMap(n=>files(path.join(output,n)).map(f=>({...f,path:n+'/'+f.path})));for(const rel of ['agent.json','updater/product-bootstrap.cjs'])cfg.productBaseline.push({path:rel,sha256:hash(path.join(output,rel))});
 fs.writeFileSync(path.join(output,'updater/config.json'),JSON.stringify(cfg,null,2));fs.unlinkSync(path.join(output,'updater/config.template.json'));
 fs.writeFileSync(path.join(output,'launch.ps1'),'\uFEFF'+"$ErrorActionPreference='Stop'\r\nStart-Process -FilePath (Join-Path $PSScriptRoot 'runtime\\node.exe') -ArgumentList @(('\"'+(Join-Path $PSScriptRoot 'updater\\launcher.cjs')+'\"')) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden\r\n");
 fs.writeFileSync(path.join(output,'Start-SageWrite.cmd'),'@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1"\r\n');
 const meta=JSON.parse(fs.readFileSync(path.join(root,'agent.json')));fs.writeFileSync(path.join(output,'package-receipt.json'),JSON.stringify({schema:'uah-sagewrite-package-receipt/v1',productId:meta.id,version:meta.version,excluded:['package-receipt.json','release-manifest.json'],mcpRuntime:{server:'2.0.0',zod:'4.6.5'},files:files(output)},null,2));fs.writeFileSync(path.join(output,'release-manifest.json'),JSON.stringify({schema:'uah-sagewrite-release/v1',version:meta.version,files:files(output)},null,2));console.log(output);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
