const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../assets/game-core');
test('challenge decks reproduce the full tile distribution',()=>{
  assert.deepEqual(C.deck('D-2026-11-11'),C.deck('D-2026-11-11'));
  assert.notDeepEqual(C.deck('C-FIRST'),C.deck('C-SECOND'));
  const counts={};for(const l of C.deck('C-TEST'))counts[l]=(counts[l]||0)+1;
  assert.deepEqual(counts,C.letters);
});
test('word scoring includes length and rare letters but excludes blank bonuses',()=>{
  const word=w=>[...w].map(letter=>({letter,blank:false}));
  assert.equal(C.points(word('CATS')),1);
  assert.equal(C.points(word('QUIZ')),7);
  const tiles=word('QUIZ');tiles[0].blank=true;assert.equal(C.points(tiles),4);
  assert.equal(C.points(word('PLANETS')),4);
});
test('combos have a 10 second window, cap at four, and restart on expiry',()=>{
  assert.equal(C.comboWindow,10000);
  assert.equal(C.combo(null,100,1),1);
  assert.equal(C.combo(100,10100,1),2);
  assert.equal(C.combo(100,10101,4),1);
  assert.equal(C.combo(100,200,4),4);
  assert.equal(C.duration('sprint'),90);assert.equal(C.duration('daily'),300);
});
// Run the actual UI controller against a small DOM substitute to exercise state transitions.
const vm=require('node:vm'),fs=require('node:fs');
function app(){
  let testTime=Date.now();
  const elements=new Map();
  const element=()=>({textContent:'',value:'A',className:'',style:{},dataset:{},children:[],classList:{toggle(){}},setAttribute(){},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},showModal(){},parentElement:{classList:{toggle(){}}}});
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element,querySelectorAll(){return [];},querySelector(){return null;},addEventListener(){}};
  const sandbox={document,PentaCore:C,GameEffects:class{constructor(){this.full=true;}setFull(value){this.full=value;}stage(){}drawTile(){}place(){}reject(){}bank(){}finish(best){this.finalBest=best;}},GameAudio:class{unlock(){}effect(){}setMusic(){}},localStorage:{getItem(){return null;},setItem(){}},location:{href:'https://example.com/'},URL,AbortController,setTimeout,clearTimeout,setInterval(){return 1;},clearInterval(){},fetch:async()=>({ok:true,json:async()=>[{word:'cats'}]}),console};
  sandbox.Date=class extends Date{static now(){return testTime;}};
  sandbox.setTimeout=(...args)=>{const timer=setTimeout(...args);timer.unref();return timer;};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require.resolve('../assets/word-game.js'),'utf8'),sandbox);
  const run=code=>vm.runInContext(code,sandbox);
  run.advance=ms=>{testTime+=ms;run('render()');};
  return run;
}
test('placement, discard, wildcards and end-round penalties preserve tiles and stop play',()=>{
  const run=app();run('startRound()');
  assert.equal(run('s.rows.length'),5);assert.equal(run('s.rows.every(row=>row.length===1)'),true);
  const total=run('s.bag.length+6');assert.equal(total,Object.values(C.letters).reduce((a,b)=>a+b,0));
  run('discard()');assert.equal(run('s.discard.length'),1);
  run("selection='discard';place(0)");assert.equal(run('s.discard.length'),0);assert.equal(run('s.rows[0].length'),2);
  const bag=run('s.bag.length');run.advance(1000);run("selection='wild';place(1)");assert.equal(run('s.blanks'),1);assert.equal(run('s.rows[1][1].blank'),true);assert.equal(run('s.bag.length'),bag);
  run('discard();endRound()');assert.equal(run('s.score'),-1);run('endRound();place(0);discard()');assert.equal(run('s.score'),-1);assert.equal(run('s.rows[0].length'),2);
});
test('board controls stay mounted across moves and round restarts',()=>{
  const run=app();
  run("startRound();const originalLane=$('gameBoard').children[0];const originalButton=originalLane.children[1];place(0);discard();render()");
  assert.equal(run("$('gameBoard').children[0]===originalLane"),true);
  assert.equal(run("$('gameBoard').children[0].children[1]===originalButton"),true);
  run('endRound();startRound()');
  assert.equal(run("$('gameBoard').children[0].children[1]===originalButton"),true);
});
test('duplicate asynchronous submissions score once and reject late results after ending',async()=>{
  const run=app();run("startRound();s.rows[0]=[...'CATS'].map(l=>tile(l));s.rows[1]=[...'CATS'].map(l=>tile(l))");
  await run('Promise.all([bank(0),bank(0),bank(1)])');assert.equal(run('s.words.length'),1);assert.equal(run('s.score'),1);
  run("s.rows[2]=[...'CATS'].map(l=>tile(l));s.words=[];s.score=0");
  await run('const pendingBank=bank(2);endRound();pendingBank');assert.equal(run('s.words.length'),0);assert.equal(run('s.score'),0);
});

test('final personal-best celebration uses the score after discard penalties',()=>{
  const run=app();
  run("records=[{score:10,mode:'classic'}];startRound();s.score=15;s.discard=Array.from({length:6},()=>tile('A'));endRound()");
  assert.equal(run('s.score'),9);
  assert.equal(run('fx.finalBest'),false);
  run('startRound();s.score=20;endRound()');
  assert.equal(run('fx.finalBest'),true);
});

test('discard cooldown blocks every input path until exactly one second and resets each round',()=>{
  const run=app();
  run("startRound();discard();const queued=s.queue;const bagSize=s.bag.length;const drag={preventDefault(){},stopPropagation(){},dataTransfer:{setData(){}}}");
  run("placementPointerDown({button:0});$('discardButton').onclick();beginTileDrag(drag,'queue');dropTile(drag);endTileDrag();discard()");
  assert.equal(run('s.discard.length'),1);
  assert.equal(run('s.queue===queued&&s.bag.length===bagSize'),true);
  run.advance(999);run('discard()');
  assert.equal(run('s.discard.length'),1);
  run.advance(1);run("beginTileDrag(drag,'queue');dropTile(drag)");
  assert.equal(run('s.discard.length'),2);
  run('endRound();startRound();discard()');
  assert.equal(run('s.discard.length'),1);
});

test('one drag cannot consume multiple queue tiles or trigger a follow-up pointer click',()=>{
  const run=app();
  run("startRound();const drag={preventDefault(){},stopPropagation(){},dataTransfer:{setData(){}}};const front=s.queue;const next=s.bag[0];beginTileDrag(drag,'queue');dropTile(drag,0);dropTile(drag,1);clickLane({detail:1},2)");
  assert.equal(run('s.rows[0].length'),2);
  assert.equal(run('s.rows[1].length+s.rows[2].length'),2);
  assert.equal(run('s.rows[0][1]===front'),true);
  assert.equal(run('s.queue.letter===next'),true);
  assert.equal(run('dragSession===null'),true);
  run.advance(1000);run('placementPointerDown({button:0,isPrimary:true});clickLane({detail:1},2)');
  assert.equal(run('s.rows[2].length'),2);
});
test('external and stale drags cannot place tiles, and discarded tiles move only once',()=>{
  const run=app();
  run("startRound();const drag={preventDefault(){},stopPropagation(){},dataTransfer:{setData(){}}};dropTile(drag,0)");
  assert.equal(run('s.rows[0].length'),1);
  run("beginTileDrag(drag,'queue');place(1);dropTile(drag,0);endTileDrag()");
  assert.equal(run('s.rows[0].length'),1);
  run.advance(1000);run("discard();const top=s.discard[0];beginTileDrag(drag,'discard');dropTile(drag,0);dropTile(drag,2)");
  assert.equal(run('s.rows[0][1]===top'),true);
  assert.equal(run('s.discard.length'),0);
  assert.equal(run('s.rows[2].length'),1);
});
test('queue previews follow the seeded sequence and shrink safely at the end',()=>{
  const run=app();
  run("loadCode('C-PREVIEW');startRound();const lookahead=[s.queue.letter,...s.bag.slice(0,4)]");
  assert.equal(run("$('queuePreview').children.length"),4);
  assert.equal(run("$('queuePreview').children.map(p=>p.textContent).join('')===s.bag.slice(0,4).join('')"),true);
  run('place(0);discard()');
  assert.equal(run('s.rows[0][1].letter===lookahead[0]&&s.discard[0].letter===lookahead[1]&&s.queue.letter===lookahead[2]'),true);
  run.advance(1000);run("s.bag=['Z'];render();place(1)");run.advance(1000);run('place(1)');
  assert.equal(run('s.queue'),null);
  assert.equal(run("$('queuePreview').children.every(p=>p.textContent==='·')"),true);
});

test('one mouse press ignores duplicate click notifications and the next press works after the lock',()=>{
  const run=app();
  run('startRound();placementPointerDown({button:0,isPrimary:true});clickLane({detail:1},0);clickLane({detail:1},0);clickLane({detail:1},1)');
  assert.equal(run('s.rows[0].length'),2);
  assert.equal(run('s.rows[1].length'),1);
  run.advance(1000);run('placementPointerDown({button:0,isPrimary:true});clickLane({detail:2},0)');
  assert.equal(run('s.rows[0].length'),3);
});
test('repeated callbacks for the same activation cannot place twice',()=>{
  const run=app();
  run('startRound();const activation={detail:0};clickLane(activation,0);clickLane(activation,0)');
  assert.equal(run('s.rows[0].length'),2);
});
test('a delayed click after drop cannot consume a second tile',()=>{
  const run=app();
  run("startRound();const drag={preventDefault(){},stopPropagation(){},dataTransfer:{setData(){}}};placementPointerDown({button:0});beginTileDrag(drag,'queue');dropTile(drag,0);endTileDrag();suppressClickUntil=0;clickLane({detail:1,pointerType:'mouse'},0)");
  assert.equal(run('s.rows[0].length'),2);
  run.advance(1000);run('placementPointerDown({button:0});clickLane({detail:1},0)');
  assert.equal(run('s.rows[0].length'),3);
});
test('duplicate wildcard and discard clicks do not also place the next queue tile',()=>{
  const run=app();
  run("startRound();selection='wild';placementPointerDown({button:0});clickLane({detail:1},0);clickLane({detail:1},0)");
  assert.equal(run('s.rows[0].length'),2);
  assert.equal(run('s.blanks'),1);
  run.advance(1000);run("discard();selection='discard';const queued=s.queue;placementPointerDown({button:0});clickLane({detail:1},1);clickLane({detail:1},1)");
  assert.equal(run('s.rows[1].length'),2);
  assert.equal(run('s.queue===queued'),true);
});

test('the global one-second lock rejects every placement source without consuming tiles',()=>{
  const run=app();run('startRound();place(0);const queued=s.queue;const bagSize=s.bag.length;discard();const top=s.discard[0];const remainingQueue=s.queue;');
  run("place(1);selection='discard';place(2);selection='wild';place(3)");
  assert.equal(run('s.rows.reduce((n,row)=>n+row.length,0)'),6);
  assert.equal(run('s.queue===remainingQueue&&s.discard[0]===top&&s.blanks===2'),true);
  run.advance(999);run('place(4)');
  assert.equal(run('s.rows[4].length'),1);
  run.advance(1);run('place(4)');
  assert.equal(run('s.rows[4].length'),2);
  assert.equal(run('s.blanks'),1);
  run('endRound();startRound();place(0)');
  assert.equal(run('s.rows[0].length'),2);
});
