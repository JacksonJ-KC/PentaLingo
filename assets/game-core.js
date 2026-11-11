/* Shared deterministic rules, usable in the browser and Node tests. */
(function(root){
  const letters={A:5,B:3,C:3,D:3,E:7,F:2,G:3,H:3,I:5,J:1,K:2,L:3,M:3,N:4,O:5,P:3,Q:1,R:4,S:4,T:4,U:3,V:2,W:2,X:1,Y:2,Z:1};
  const bonus='JKQVXZ';
  const comboWindow=10000;
  function random(seed){let n=2166136261;for(const c of seed)n=Math.imul(n^c.charCodeAt(0),16777619);return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
  function deck(seed){const rng=random(seed),bag=Object.entries(letters).flatMap(([l,n])=>Array(n).fill(l));for(let i=bag.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}return bag;}
  function points(tiles){return 1+tiles.length-4+tiles.reduce((n,t)=>n+(!t.blank&&bonus.includes(t.letter)?3:0),0);}
  const core={letters,bonus,deck,points,comboWindow,duration:mode=>mode==='sprint'?90:300,combo:(last,now,chain)=>last!==null&&now-last<=comboWindow?Math.min(chain+1,4):1};
  if(typeof module!=='undefined')module.exports=core;else root.PentaCore=core;
})(typeof window==='undefined'?globalThis:window);
