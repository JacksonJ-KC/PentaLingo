const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const browser=process.env.PENTALINGO_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const files=process.argv.slice(2).length?process.argv.slice(2):['tests/mobile-browser.html','tests/effects-browser.html','tests/effects-reduced-browser.html'];
for(const file of files){
 const args=['--headless','--disable-gpu','--no-sandbox','--no-first-run','--allow-file-access-from-files',`--user-data-dir=${path.resolve('.browser-check')}`,'--virtual-time-budget=6000','--dump-dom',pathToFileURL(path.resolve(file)).href];
 if(file.includes('reduced'))args.unshift('--force-prefers-reduced-motion=reduce');
 const result=spawnSync(browser,args,{encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024});
 const output=result.stdout||'',match=output.match(/<pre id="results">([\s\S]*?)<\/pre>/);
 if(result.error||!match){console.error(file,result.error||'No browser results',result.stderr);process.exitCode=1;continue;}
 const data=JSON.parse(match[1].replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&'));
 if(!Array.isArray(data)||!data.length)throw new Error('Missing browser checks');
 for(const item of data)console.log(`${item.pass?'PASS':'FAIL'} ${item.name}`);
 if(data.some(item=>!item.pass))process.exitCode=1;
}
