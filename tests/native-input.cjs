// Real Chromium mouse input through CDP, with no browser automation dependency.
const {spawn}=require('node:child_process');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const browser=process.env.PENTALINGO_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const child=spawn(browser,['--headless','--disable-gpu','--no-sandbox','--no-first-run','--remote-debugging-pipe',`--user-data-dir=${path.resolve('.browser-input-check')}`],{stdio:['ignore','ignore','pipe','pipe','pipe']});
let nextId=0,buffer='',session;
const pending=new Map(),listeners=new Set();
child.stdio[4].on('data',chunk=>{buffer+=chunk.toString();let end;while((end=buffer.indexOf('\0'))!==-1){const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(message.id){const request=pending.get(message.id);if(request){pending.delete(message.id);clearTimeout(request.timeout);message.error?request.reject(new Error(JSON.stringify(message.error))):request.resolve(message.result);}}else for(const listener of listeners)listener(message);}});
function send(method,params={},sessionId=session){return new Promise((resolve,reject)=>{const id=++nextId;const timeout=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},15000);pending.set(id,{resolve,reject,timeout});child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function mouse(type,x,y,pressed=false){await send('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:pressed?1:0,clickCount:type==='mouseMoved'?0:1});}
(async()=>{
 try{
 const target=await send('Target.createTarget',{url:'about:blank'},null);session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;
 await send('Page.enable');await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:pathToFileURL(path.resolve('index.html')).href});
 let ready=false;for(let i=0;i<240;i++){ready=await evaluate('typeof startRound==="function"&&!!document.querySelector(".word-row")');if(ready)break;await pause(50);}if(!ready)throw new Error('Game did not initialize');
 await evaluate("loadCode('C-NATIVE');startRound();fx.setFull(false);window.fixture={bag:s.bag.slice(),queue:{...s.queue},rows:s.rows.map(r=>r.map(t=>({...t})))};window.inputTrace=[];for(const type of ['pointerdown','pointerup','mousedown','mouseup','click','dragstart','drop','dragend'])document.addEventListener(type,e=>inputTrace.push({type,detail:e.detail,target:e.target.className}),true)");
 const reset=()=>evaluate("s.bag=fixture.bag.slice();s.queue={...fixture.queue};s.rows=fixture.rows.map(r=>r.map(t=>({...t})));selection='queue';s.nextPlacementAt=0;clearTimeout(placementTimer);inputTrace=[];render()");
 async function position(selector){return evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);}
 for(let i=0;i<60;i++){
 await reset();const p=await position(`.lane:nth-child(${i%5+1}) .word-row .tile:nth-child(${i%8+2})`);
 await mouse('mouseMoved',p.x,p.y);await mouse('mousePressed',p.x,p.y,true);await mouse('mouseReleased',p.x,p.y);
 const count=await evaluate('s.rows.reduce((n,r)=>n+r.length,0)');if(count!==6)throw new Error(`Click ${i} placed ${count-5} tiles: ${await evaluate('JSON.stringify(inputTrace)')}`);
 }
 console.log('PASS 60 native mouse clicks each place exactly one tile');
 await reset();const p=await position('.word-row');
 for(let i=0;i<2;i++){await mouse('mouseMoved',p.x,p.y);await mouse('mousePressed',p.x,p.y,true);await mouse('mouseReleased',p.x,p.y);}
 if(await evaluate('s.rows.reduce((n,r)=>n+r.length,0)')!==6)throw new Error('Placement lock allowed a second real click');
 await pause(1050);
 await mouse('mousePressed',p.x,p.y,true);await mouse('mouseReleased',p.x,p.y);
 if(await evaluate('s.rows.reduce((n,r)=>n+r.length,0)')!==7)throw new Error('Placement did not unlock');
 console.log('PASS real mouse placements are blocked for one second and then unlock');
 }catch(error){console.error(error);process.exitCode=1;}
 finally{await send('Browser.close',{},null).catch(()=>child.kill());for(const request of pending.values())clearTimeout(request.timeout);}
})();
