/* Original procedural soundtrack: soft chords, bass pulses and a pentatonic melody. */
class GameAudio {
  constructor(){this.sound=false;this.music=false;this.ctx=null;this.loop=null;this.step=0;}
  unlock(){try{this.ctx ||= new (window.AudioContext||window.webkitAudioContext)();this.ctx.resume().catch(()=>{});}catch{}}
  tone(freq,when,duration,volume=.04,type='sine'){
    if(!this.ctx)return;const osc=this.ctx.createOscillator(),gain=this.ctx.createGain();osc.type=type;osc.frequency.value=freq;gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(volume,when+.02);gain.gain.exponentialRampToValueAtTime(.0001,when+duration);osc.connect(gain);gain.connect(this.ctx.destination);osc.start(when);osc.stop(when+duration+.02);
  }
  effect(kind){if(!this.sound||!this.ctx||document.hidden)return;const notes={place:[440,660],discard:[330,220],error:[180,130],bank:[523,659,784],combo:[659,784,988,1175],milestone:[523,659,784,1047,1319],end:[523,659,784,1047],start:[392,523,784]}[kind]||[440];notes.forEach((f,i)=>this.tone(f,this.ctx.currentTime+i*.08,.22,.055));}
  setMusic(enabled){this.music=enabled;clearInterval(this.loop);if(enabled){this.unlock();this.tick();this.loop=setInterval(()=>this.tick(),300);}}
  tick(){if(!this.ctx||document.hidden)return;const t=this.ctx.currentTime,step=this.step++%32,chords=[[130.81,164.81,196],[110,130.81,164.81],[87.31,110,130.81],[98,123.47,146.83]],chord=chords[Math.floor(step/8)];if(step%8===0)chord.forEach(f=>this.tone(f*2,t,2.3,.014,'triangle'));if(step%2===0)this.tone(chord[0],t,.35,.035);const melody=[523.25,659.25,783.99,659.25,587.33,523.25,440,392];if(step%2===1)this.tone(melody[Math.floor(step/4)],t,.55,.018);}
}
