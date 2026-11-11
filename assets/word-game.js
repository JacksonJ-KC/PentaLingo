'use strict';
const $=id=>document.getElementById(id), C=PentaCore, audio=new GameAudio(), fx=new GameEffects();
let mode='classic',s=null,clock=null,epoch=0,selection='queue',challenge=null;
let dragSession=null,suppressClickUntil=0;
let placementTimer=null;
const placementDelay=1000;
let placementGesture=null;
const handledPlacementEvents=new WeakSet();
function selectedPlacementTile(){
  if(selection==='wild')return s?.blanks?`${s.blanks}:${$('wildLetter').value}`:null;
  return selection==='discard'?s?.discard[0]:s?.queue;
}
function capturePlacementGesture(kind){
  return {kind,round:s,version:epoch,source:selection,tile:selectedPlacementTile(),used:false};
}
function placementPointerDown(event){
  if(event.isPrimary===false||(event.button!==undefined&&event.button!==0))return;
  suppressClickUntil=0;
  placementGesture=capturePlacementGesture('pointer');
}
function placementKeyDown(event){
  if(!['Enter',' '].includes(event.key)||!event.target.closest?.('.word-row'))return;
  if(event.repeat){event.preventDefault();return;}
  placementGesture=capturePlacementGesture('keyboard');
}
function beginTileDrag(event,source){
  const dragged=source==='queue'?s?.queue:s?.discard[0];
  if(!live()||!dragged){event.preventDefault();return;}
  selection=source;
  placementGesture=capturePlacementGesture('pointer');
  dragSession={round:s,version:epoch,source,tile:dragged,used:false};
  if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',dragged.letter);}
}
function dropTile(event,index=null){
  event.preventDefault();event.stopPropagation();
  const gesture=dragSession;
  if(!gesture||gesture.used||gesture.round!==s||gesture.version!==epoch)return;
  const current=gesture.source==='queue'?s.queue:s.discard[0];
  if(current!==gesture.tile)return;
  // A drop owns one specific tile, never whichever tile happens to be next.
  gesture.used=true;dragSession=null;suppressClickUntil=Date.now()+350;
  if(placementGesture)placementGesture.used=true;
  selection=gesture.source;
  if(index!==null)place(index);else if(gesture.source==='queue')discard();
}
function endTileDrag(){if(dragSession)suppressClickUntil=Date.now()+350;dragSession=null;}
function clickLane(event,index){
  if(handledPlacementEvents.has(event))return;
  handledPlacementEvents.add(event);
  if(dragSession||Date.now()<suppressClickUntil)return;
  const pointerClick=event.detail>0||['mouse','touch','pen'].includes(event.pointerType)||event.sourceCapabilities?.firesTouchEvents;
  // Compatibility clicks and duplicate callbacks belong to the same press. They
  // must not consume the freshly advanced queue or a second wildcard/discard.
  if(pointerClick||(event.detail===0&&placementGesture?.kind==='keyboard')){
    placementGesture ||= capturePlacementGesture('pointer');
    const gesture=placementGesture;
    if(gesture.used||gesture.round!==s||gesture.version!==epoch||gesture.source!==selection||gesture.tile!==selectedPlacementTile())return;
    gesture.used=true;
  }
  place(index);
}
const safeRead=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const safeWrite=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
let records=safeRead('pentalingo-rounds-v2',[]);if(!Array.isArray(records))records=[];
const prefs=safeRead('pentalingo-audio',{});
fx.setFull(safeRead('pentalingo-effects',true)!==false);
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);if(error)audio.effect('error');}
function seconds(){return s?Math.max(0,Math.ceil((s.deadline-Date.now())/1000)):C.duration(mode);}
function live(){if(!s?.active)return false;if(seconds()<=0){endRound();return false;}return true;}
function tile(letter,blank=false){return {letter,blank};}
function seedCode(){return `${mode==='sprint'?'S':'C'}-${Math.random().toString(36).slice(2,10).toUpperCase()}`;}
function startRound(){
  if(s?.active)return;
  audio.unlock();epoch++;clearInterval(clock);
  clearTimeout(placementTimer);
  dragSession=null;suppressClickUntil=0;
  placementGesture=null;
  fx.stage();
  const code=challenge||(mode==='daily'?`D-${new Date().toISOString().slice(0,10)}`:seedCode());
  const bag=C.deck(code),rows=Array.from({length:5},()=>{const index=bag.findIndex(l=>!'AEIOU'.includes(l));return [tile(bag.splice(index,1)[0])];});
  s={active:true,code,mode,bag,rows,discard:[],queue:tile(bag.shift()),blanks:2,score:0,words:[],chain:1,lastBank:null,deadline:Date.now()+C.duration(mode)*1000,pending:new Set(),milestone:false};
  s.nextPlacementAt=0;
  const previous=records.filter(r=>r.mode===mode);
  s.previousBest=previous.length?Math.max(...previous.map(r=>r.score)):null;s.bestCelebrated=false;s.bestChain=1;
  $('rewardTitle').textContent='FIND YOUR FLOW';$('rewardDetail').textContent='Bank words. Build a streak.';$('rewardCard').dataset.tier='1';
  selection='queue';clock=setInterval(tick,1000);audio.effect('start');status('Round on! Tap a lane or press 1–5 to place the selected letter.');render();
  fx.drawTile(C.bonus.includes(s.queue.letter));
}
function tick(){if(!s?.active)return;if(seconds()<=0){endRound();return;}renderClock();if(s.lastBank!==null&&Date.now()-s.lastBank>C.comboWindow&&s.chain!==1){s.chain=1;$('combo').textContent='×1';}}
function renderClock(){const left=seconds();$('timeLeft').textContent=`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;$('timeBar').style.width=`${left/C.duration(mode)*100}%`;$('timeBar').parentElement.classList.toggle('urgent',left<=30);$('comboFuse').style.width=`${s?.active&&s.lastBank!==null?Math.max(0,1-(Date.now()-s.lastBank)/C.comboWindow)*100:0}%`;}
function place(index){
  if(!live()||s.pending.has(index))return;
  if(Date.now()<s.nextPlacementAt)return;
  if(s.rows[index].length>=10){status('That lane is full. Bank its word or choose another lane.',true);return;}
  let next;
  if(selection==='wild'){if(!s.blanks)return;next=tile($('wildLetter').value,true);s.blanks--;}
  else if(selection==='discard'){next=s.discard.shift();}
  else {next=s.queue;if(next)s.queue=s.bag.length?tile(s.bag.shift()):null;}
  if(!next){status('No tile selected. Try a discard or a wildcard.',true);return;}
  const drewQueue=selection==='queue';
  // Enforce the lock at the mutation boundary, shared by every input method.
  s.nextPlacementAt=Date.now()+placementDelay;
  const round=s;
  clearTimeout(placementTimer);
  placementTimer=setTimeout(()=>{if(s===round&&s.active){render();if($('status').textContent==='Tile placed. Next placement ready in one second.')status('Ready. Place the next tile in any lane.');}},placementDelay);
  s.rows[index].push(next);selection='queue';audio.effect('place');render();status('Tile placed. Next placement ready in one second.');
  fx.place(index,s.rows[index].length,next.blank);if(drewQueue&&s.queue)fx.drawTile(C.bonus.includes(s.queue.letter));
}
function discard(){if(!live()||!s.queue)return;s.discard.unshift(s.queue);s.queue=s.bag.length?tile(s.bag.shift()):null;selection='queue';audio.effect('discard');render();status('Queue discarded. The newest discard is available to reuse.');if(s.queue)fx.drawTile(C.bonus.includes(s.queue.letter));}
async function bank(index){
  if(!live()||s.pending.has(index))return;const tiles=s.rows[index].slice(),word=tiles.map(t=>t.letter).join('');
  if(word.length<4){status('Build at least four letters before banking.',true);fx.reject(index);return;}
  if(s.words.some(w=>w.word===word)){s.chain=1;render();status('You already banked that word. Try something new.',true);return;}
  const round=s,version=epoch;s.pending.add(index);render();status(`Checking ${word}…`);
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(word.toLowerCase())}&max=1`,{signal:controller.signal});
    if(!response.ok)throw new Error('Dictionary unavailable');const data=await response.json();
    if(s!==round||epoch!==version||!live())return;
    const valid=Array.isArray(data)&&data.some(item=>item.word?.toUpperCase()===word);
    if(!valid){s.chain=1;status(`${word} isn’t in the dictionary. Keep building; your tiles are safe.`,true);fx.reject(index);return;}
    // Another lane may have completed the same request while this one was pending.
    if(s.words.some(w=>w.word===word)){status('That word has just been banked in another lane.',true);return;}
    const now=Date.now();s.chain=C.combo(s.lastBank,now,s.chain);s.lastBank=now;
    let points=C.points(tiles)+s.chain-1;s.words.push({word,points});s.score+=points;
    const milestone=s.words.length===5&&!s.milestone;if(milestone){s.score+=5;s.milestone=true;}
    s.bestChain=Math.max(s.bestChain,s.chain);
    const personalBest=s.previousBest!==null&&s.score>s.previousBest&&!s.bestCelebrated;
    if(personalBest)s.bestCelebrated=true;
    fx.bank(index,tiles,points,s.chain,milestone,personalBest);
    s.rows[index]=s.discard.length?[s.discard.shift()]:[];audio.effect(milestone||personalBest?'milestone':s.chain>1?'combo':'bank');status(`${word} banked for +${points}!${milestone?' Five-word milestone: +5 bonus!':''}${s.chain>1?` Combo ×${s.chain}!`:''}`);
  }catch(error){if(s===round&&epoch===version&&live())status('Dictionary connection unavailable. Your tiles are safe; try banking again.',true);}
  finally{clearTimeout(timeout);round.pending.delete(index);if(s===round)render();}
}
function endRound(){
  if(!s?.active)return;s.active=false;epoch++;clearInterval(clock);const penalty=s.discard.length;s.score-=penalty;selection='queue';
  clearTimeout(placementTimer);
  records.push({score:s.score,mode:s.mode,code:s.code,words:s.words.length,date:new Date().toISOString()});records=records.sort((a,b)=>b.score-a.score).slice(0,30);safeWrite('pentalingo-rounds-v2',records);
  const best=s.previousBest!==null&&s.score>s.previousBest;
  audio.effect(best?'milestone':'end');render();$('resultTitle').textContent=best?'A new personal best!':s.words.length?'Words well played.':'Every round is a fresh start.';$('resultScore').textContent=s.score;$('resultDetail').textContent=`${s.words.length} words banked · ${penalty} discard penalty · ${s.code}`;
  $('resultDialog').dataset.best=String(best);
  $('resultHighlights').replaceChildren();
  const longest=s.words.reduce((a,b)=>b.word.length>a.length?b.word:a,'');
  for(const [label,value] of [['LONGEST WORD',longest||'—'],['BEST COMBO',`×${s.words.length?s.bestChain:1}`],['MILESTONE',s.milestone?'5 words ✓':`${s.words.length} / 5`]]){const item=document.createElement('div'),title=document.createElement('span'),detail=document.createElement('strong');title.textContent=label;detail.textContent=value;item.append(title,detail);$('resultHighlights').append(item);}
  $('resultDialog').showModal();fx.finish(best);status('Round complete. Start again to chase a new best.');
}
function tileButton(t,selected,disabled=false){const el=document.createElement('button');el.type='button';el.className=`tile${C.bonus.includes(t.letter)&&!t.blank?' bonus':''}${t.blank?' blank':''}${selected?' selected':''}`;el.textContent=t.letter;el.disabled=disabled;el.setAttribute('aria-label',`${t.blank?'Wildcard ':''}${t.letter}`);return el;}
function render(){
  const active=!!s?.active;
  $('discardPile').dataset.count=s?.discard.length||0;
  $('arena').classList.toggle('is-playing',active);
  $('milestoneProgress').textContent=s?.milestone?'BONUS BANKED!':`${Math.min(s?.words.length||0,5)} / 5 · +5 bonus`;
  $('milestoneLabel').textContent=s?.milestone?'FIVE-WORD CLUB':'NEXT MILESTONE';
  Array.from($('milestoneGems').children).forEach((gem,i)=>gem.classList.toggle('earned',i<(s?.words.length||0)));
  $('score').textContent=s?.score||0;$('combo').textContent=`×${s?.chain||1}`;$('wordCount').textContent=s?.words.length||0;renderClock();
  $('playButton').disabled=active;$('playButton').textContent=s?'Play again ↗':'Start round ↗';$('finishButton').disabled=!active;
  document.querySelectorAll('[data-mode]').forEach(b=>{b.disabled=active;b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',b.dataset.mode===mode);});
  $('modeLabel').textContent=`${mode.toUpperCase()} ROUND`;$('roundTitle').textContent=active?'One letter. So many possibilities.':'Your next great word awaits.';$('roundHint').textContent=active?'Tap a lane to place. Bank a word to score.':'Start a round, then tap a lane to place your letter.';
  const queue=$('queueTile');queue.textContent=s?.queue?.letter||'?';queue.disabled=!active||!s.queue;queue.className=`tile queue${selection==='queue'&&active?' selected':''}${s?.queue&&C.bonus.includes(s.queue.letter)?' bonus':''}`;queue.setAttribute('aria-label',s?.queue?`Select front queue letter ${s.queue.letter}`:'Queue empty');queue.setAttribute('aria-pressed',selection==='queue');queue.draggable=active&&!!s.queue;
  $('queuePreview').replaceChildren();
  for(let i=0;i<4;i++){
    const letter=s?.bag[i],preview=document.createElement('span');
    preview.className=`tile preview-tile${letter&&C.bonus.includes(letter)?' bonus':''}${!letter?' empty':''}`;
    preview.textContent=letter||'·';preview.draggable=false;
    preview.setAttribute('aria-label',letter?`Queue position ${i+2}: ${letter}, preview only`:`Queue position ${i+2}: empty`);
    $('queuePreview').append(preview);
  }
  $('tilesLeft').textContent=`${s?.bag.length??Object.values(C.letters).reduce((a,b)=>a+b,0)} tiles in the bag`;
  $('discardButton').disabled=!active||!s.queue;$('wildButton').disabled=!active||!s.blanks;$('wildButton').textContent=`${selection==='wild'?'Selected':'Use blank'} · ${s?.blanks??2} left`;$('wildButton').setAttribute('aria-pressed',selection==='wild');
  $('wildLetter').disabled=!active;
  for(let i=0;i<5;i++){
    // Keep controls mounted so taps, keyboard focus and scroll position survive moves.
    let lane=$('gameBoard').children[i];
    if(!lane){
    lane=document.createElement('div');lane.className='lane';const number=document.createElement('span');number.className='lane-number';number.textContent=String(i+1).padStart(2,'0');
    const row=document.createElement('button');row.type='button';row.className='word-row';row.disabled=!active||s.pending.has(i);row.setAttribute('aria-label',`Place selected letter in lane ${i+1}: ${s?.rows[i].map(t=>t.letter).join('')||'empty'}`);row.onclick=e=>clickLane(e,i);
    for(let j=0;j<10;j++){const t=s?.rows[i][j],cell=document.createElement('span');cell.className=`tile${!t?' empty':t.blank?' blank':C.bonus.includes(t.letter)?' bonus':''}`;cell.textContent=t?.letter||'';row.append(cell);}
    row.ondragover=e=>{if(dragSession&&!dragSession.used)e.preventDefault();};row.ondrop=e=>dropTile(e,i);
    const submit=document.createElement('button');submit.className='bank';submit.textContent=s?.pending.has(i)?'…':'Bank';submit.disabled=!active||s.pending.has(i);submit.setAttribute('aria-label',`Bank word in lane ${i+1}`);submit.onclick=()=>bank(i);lane.append(number,row,submit);$('gameBoard').append(lane);
    }
    const row=lane.children[1],submit=lane.children[2];
    row.disabled=!active||s.pending.has(i);
    row.setAttribute('aria-disabled',String(row.disabled||Date.now()<s.nextPlacementAt));
    lane.classList.toggle('placement-locked',active&&Date.now()<s.nextPlacementAt);
    row.setAttribute('aria-label',`Place selected letter in lane ${i+1}: ${s?.rows[i].map(t=>t.letter).join('')||'empty'}`);
    for(let j=0;j<10;j++){
      const t=s?.rows[i][j],cell=row.children[j];
      cell.className=`tile${!t?' empty':t.blank?' blank':C.bonus.includes(t.letter)?' bonus':''}`;
      cell.textContent=t?.letter||'';
    }
    submit.textContent=s?.pending.has(i)?'…':'Bank';submit.disabled=!active||s.pending.has(i);
    lane.classList.toggle('ready',active&&s.rows[i].length>=4);lane.classList.toggle('checking',active&&s.pending.has(i));
  }
  $('discardPile').replaceChildren();s?.discard.forEach((t,i)=>{const b=tileButton(t,i===0&&selection==='discard',!active||i!==0);if(i===0)b.setAttribute('aria-label',`Reuse ${t.letter}; ${s.discard.length} discarded tiles, ${s.discard.length} point penalty`);b.onclick=()=>{selection='discard';render();status('Discard selected. Tap a lane to use it.');};b.draggable=active&&i===0;b.ondragstart=e=>beginTileDrag(e,'discard');$('discardPile').append(b);});
  $('roundCode').textContent=s?`Round: ${s.code}`:challenge?`Loaded: ${challenge}`:'Start a round to get your code.';
  $('shareButton').disabled=!s;$('submittedWordsList').replaceChildren();
  if(!s?.words.length){const li=document.createElement('li');li.className='empty-state';li.textContent='Your word wins will appear here.';$('submittedWordsList').append(li);}
  s?.words.slice().reverse().forEach(w=>{const li=document.createElement('li'),pts=document.createElement('span');li.textContent=w.word;pts.textContent=`+${w.points}`;li.append(pts);$('submittedWordsList').append(li);});
  const longest=s?.words.reduce((a,b)=>b.word.length>a.length?b.word:a,'');$('bestWord').textContent=longest?`Longest: ${longest}`:'Go for a long one';
  $('tileCountsGrid').replaceChildren();for(const letter of Object.keys(C.letters)){const el=document.createElement('div'),count=document.createElement('span');el.className=C.bonus.includes(letter)?'bonus':'';el.textContent=letter;count.textContent=s?s.bag.filter(l=>l===letter).length:C.letters[letter];el.append(count);$('tileCountsGrid').append(el);}
  $('leaderboard').replaceChildren();const top=records.filter(r=>r.mode===mode).slice(0,5);if(!top.length){const li=document.createElement('li');li.className='empty-state';li.textContent='A fresh leaderboard. Set the first score.';$('leaderboard').append(li);}top.forEach((r,i)=>{const li=document.createElement('li'),label=document.createElement('span'),detail=document.createElement('small'),score=document.createElement('strong');label.textContent=`${i+1}. ${r.mode==='daily'?'Daily challenge':r.mode==='sprint'?'Sprint':'Classic'}`;detail.textContent=`${r.words} words · ${String(r.date).slice(0,10)}`;label.append(detail);score.textContent=r.score;li.append(label,score);$('leaderboard').append(li);});
}
async function copy(text){try{await navigator.clipboard.writeText(text);status('Copied! Send it to a friend.');}catch{window.prompt('Copy and share:',text);}}
function link(){const url=new URL(location.href);url.searchParams.set('challenge',s.code);return url.href;}
function loadCode(raw){if(s?.active){status('Finish this round before loading a challenge.',true);return;}const code=raw.trim().toUpperCase();if(!/^(?:[CS]-[A-Z0-9]{1,20}|D-\d{4}-\d{2}-\d{2})$/.test(code)){status('Use a round code such as C-ABC123, S-ABC123 or D-2026-11-11.',true);return;}challenge=code;mode=code.startsWith('S-')?'sprint':code.startsWith('D-')?'daily':'classic';render();status('Challenge loaded. Start the round when you’re ready.');}
$('playButton').onclick=startRound;$('finishButton').onclick=()=>{if($('mobileMenu').open)$('mobileMenu').close();endRound();};$('discardButton').onclick=discard;$('queueTile').onclick=()=>{if(dragSession)return;selection='queue';render();};$('queueTile').ondragstart=e=>beginTileDrag(e,'queue');$('discardPile').ondragover=e=>{if(dragSession&&!dragSession.used&&dragSession.source==='queue')e.preventDefault();};$('discardPile').ondrop=e=>dropTile(e);
document.addEventListener('dragend',endTileDrag);
document.addEventListener('pointerdown',placementPointerDown,true);
document.addEventListener('keydown',placementKeyDown,true);
document.addEventListener('keyup',event=>{
  if(!['Enter',' '].includes(event.key))return;
  const gesture=placementGesture;
  if(gesture?.kind==='keyboard')setTimeout(()=>{if(placementGesture===gesture)placementGesture=null;},0);
},true);
$('wildButton').onclick=()=>{if(live()&&s.blanks){selection='wild';render();status('Wildcard selected. Choose a letter, then tap a lane.');}};
$('helpButton').onclick=()=>$('helpDialog').showModal();document.querySelectorAll('.dialog-close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('loadButton').onclick=()=>loadCode($('challengeCode').value);$('shareButton').onclick=()=>s&&copy(link());$('copyResult').onclick=()=>s&&copy(`PentaLingo · ${s.score} points · ${s.words.length} words\nBeat my ${s.mode} round: ${link()}`);
$('effectsButton').onclick=()=>{fx.setFull(!fx.full);safeWrite('pentalingo-effects',fx.full);effectsLabel();};
function effectsLabel(){$('effectsButton').textContent=`Effects ${fx.full?'full':'calm'}`;$('effectsButton').setAttribute('aria-pressed',fx.full);}
effectsLabel();
for(const letter of Object.keys(C.letters)){const o=document.createElement('option');o.value=o.textContent=letter;$('wildLetter').append(o);}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(s?.active)return;mode=b.dataset.mode;challenge=null;s=null;render();});
function audioLabels(){$('soundButton').textContent=`Sound ${audio.sound?'on':'off'}`;$('soundButton').setAttribute('aria-pressed',audio.sound);$('musicButton').textContent=`Music ${audio.music?'on':'off'}`;$('musicButton').setAttribute('aria-pressed',audio.music);safeWrite('pentalingo-audio',{sound:audio.sound,music:audio.music});}
$('soundButton').onclick=()=>{audio.unlock();audio.sound=!audio.sound;audio.effect('place');audioLabels();};$('musicButton').onclick=()=>{audio.setMusic(!audio.music);audioLabels();};audio.sound=!!prefs?.sound;
// Saved music preferences only resume after a user gesture, respecting autoplay rules.
if(prefs?.music)document.addEventListener('pointerdown',()=>{audio.setMusic(true);audioLabels();},{once:true});audioLabels();
document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.repeat||document.querySelector('dialog[open]')||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(/^[1-5]$/.test(e.key)){e.preventDefault();place(Number(e.key)-1);}if(e.key.toLowerCase()==='d'){e.preventDefault();discard();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
// Move the existing controls rather than clone them, retaining handlers and round state.
if(typeof window!=='undefined'){
  const mobileLayout=window.matchMedia('(max-width: 1024px)');
  const extras=Array.from(document.querySelector('aside').children);
  const homes=[
    [document.querySelector('.header-actions'),'mobileSettings'],
    [document.querySelector('.modes'),'mobileRoundMode'],
    [$('finishButton'),'mobileRoundActions'],
    [document.querySelector('.milestone-track'),'mobileMilestone'],
    [extras[0],'mobileFriends'],[extras[1],'mobileScores'],[extras[2],'mobileWords'],[extras[3],'mobileBag'],
    [$('discardPile'),'mobileDiscardSlot']
  ].map(([node,target])=>{const anchor=document.createComment('Desktop control position');node.before(anchor);return {node,target,anchor};});
  let appliedMobileLayout=null;
  function syncMobileLayout(){
    if(appliedMobileLayout===mobileLayout.matches)return;
    appliedMobileLayout=mobileLayout.matches;
    if(!mobileLayout.matches&&$('mobileMenu').open)$('mobileMenu').close();
    for(const {node,target,anchor} of homes){if(mobileLayout.matches)$(target).append(node);else anchor.after(node);}
  }
  syncMobileLayout();mobileLayout.addEventListener('change',syncMobileLayout);window.addEventListener('resize',syncMobileLayout);
  $('mobileMenuButton').onclick=()=>$('mobileMenu').showModal();
  const tabs=Array.from(document.querySelectorAll('[data-mobile-tab]'));
  function selectTab(tab){for(const item of tabs){const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;$(`pane-${item.dataset.mobileTab}`).hidden=!selected;}}
  for(const [index,tab] of tabs.entries()){
    tab.onclick=()=>selectTab(tab);
    tab.onkeydown=event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();selectTab(tabs[next]);tabs[next].focus();};
  }
}
render();const initialCode=new URL(location.href).searchParams.get('challenge');if(initialCode){$('challengeCode').value=initialCode;loadCode(initialCode);}
