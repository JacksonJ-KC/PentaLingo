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
  const elements=new Map();
  const element=()=>({textContent:'',value:'A',className:'',style:{},dataset:{},children:[],classList:{toggle(){}},setAttribute(){},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},showModal(){},parentElement:{classList:{toggle(){}}}});
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element,querySelectorAll(){return [];},querySelector(){return null;},addEventListener(){}};
  const sandbox={document,PentaCore:C,GameEffects:class{constructor(){this.full=true;}setFull(value){this.full=value;}stage(){}drawTile(){}place(){}reject(){}bank(){}finish(best){this.finalBest=best;}},GameAudio:class{unlock(){}effect(){}setMusic(){}},localStorage:{getItem(){return null;},setItem(){}},location:{href:'https://example.com/'},URL,AbortController,setTimeout,clearTimeout,setInterval(){return 1;},clearInterval(){},fetch:async()=>({ok:true,json:async()=>[{word:'cats'}]}),console};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require.resolve('../assets/word-game.js'),'utf8'),sandbox);
  return code=>vm.runInContext(code,sandbox);
}
test('placement, discard, wildcards and end-round penalties preserve tiles and stop play',()=>{
  const run=app();run('startRound()');
  assert.equal(run('s.rows.length'),5);assert.equal(run('s.rows.every(row=>row.length===1)'),true);
  const total=run('s.bag.length+6');assert.equal(total,Object.values(C.letters).reduce((a,b)=>a+b,0));
  run('discard()');assert.equal(run('s.discard.length'),1);
  run("selection='discard';place(0)");assert.equal(run('s.discard.length'),0);assert.equal(run('s.rows[0].length'),2);
  const bag=run('s.bag.length');run("selection='wild';place(1)");assert.equal(run('s.blanks'),1);assert.equal(run('s.rows[1][1].blank'),true);assert.equal(run('s.bag.length'),bag);
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
