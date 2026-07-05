class AudioManager {
    constructor() {
        this.ctx = null;
        this.unlocked = false;
        
        // BGMはファイルが存在すれば鳴らす
        this.bgm = new Audio('assets/sounds/bgm_main.mp3');
        this.bgm.loop = true;
        this.bgm.volume = 0.4;
    }

    unlock() {
        if (this.unlocked) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            this.ctx = new AudioContext();
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        }

        // BGMの再生制限解除
        this.bgm.play().then(() => {
            this.bgm.pause();
            this.bgm.currentTime = 0;
        }).catch(e => console.log("BGM file not found or muted."));

        this.unlocked = true;
    }

    playBGM() {
        if (this.bgm) {
            this.bgm.currentTime = 0;
            this.bgm.play().catch(() => {});
        }
    }

    stopBGM() {
        if (this.bgm) this.bgm.pause();
    }

    // --- ここから下はMP3が無くても絶対に鳴る「シンセサイザー音生成」 ---
    
    playSynth(type, freq1, freq2, duration, volume = 0.5) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type; // 'square', 'sawtooth', 'triangle', 'sine'
        
        osc.frequency.setValueAtTime(freq1, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq2, this.ctx.currentTime + duration);
        
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    // 射出音（シュイィィン！）
    playShoot() {
        this.playSynth('square', 800, 1200, 0.2, 0.3);
    }

    // ハンコ決裁音（ドゴォッ！）
    playStamp(combo = 0) {
        const baseFreq = Math.min(150 + (combo * 20), 400); // コンボで音が高くなる
        this.playSynth('triangle', baseFreq, 40, 0.3, 0.6);
    }

    // 壁反射音（カンッ！）
    playBounce() {
        this.playSynth('sine', 600, 200, 0.1, 0.2);
    }

    // 手榴弾ボム音（ドギュゥゥン！）
    playBomb() {
        if (!this.ctx) return;
        // 爆発音はノイズを生成する
        const bufferSize = this.ctx.sampleRate * 0.5; // 0.5秒
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    }
}

const audio = new AudioManager();