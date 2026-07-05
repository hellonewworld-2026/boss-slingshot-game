class AudioManager {
    constructor() {
        this.ctx = null;
        this.unlocked = false;
        
        // 音源データのロード (ファイルがない場合はエラーがコンソールに出るが進行はする)
        this.bgm = new Audio('assets/sounds/bgm_main.mp3');
        this.bgm.loop = true;
        this.bgm.volume = 0.5;

        this.seStamp = new Audio('assets/sounds/se_stamp.mp3');
        this.seStamp.volume = 0.8;

        this.seBomb = new Audio('assets/sounds/se_bomb.mp3');
        this.seBomb.volume = 0.7;

        this.voiceAngry = new Audio('assets/sounds/voice_angry.mp3');
        this.voiceAngry.volume = 0.9;
    }

    // 最初のユーザー操作（スタートボタン押下）で呼び出し、オーディオをアンロックする
    unlock() {
        if (this.unlocked) return;
        
        // Web Audio APIのコンテキスト作成・再開
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            this.ctx = new AudioContext();
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        }

        // 各Audioオブジェクトを一瞬だけ再生・即停止してブラウザ制限を解除
        const audios = [this.bgm, this.seStamp, this.seBomb, this.voiceAngry];
        audios.forEach(audio => {
            audio.play().then(() => {
                audio.pause();
                if (audio !== this.bgm) {
                    audio.currentTime = 0;
                }
            }).catch(e => console.log("Audio unlock muted or file missing: ", e));
        });

        this.unlocked = true;
    }

    playBGM() {
        this.bgm.currentTime = 0;
        this.bgm.play().catch(e => console.log("BGM play error: ", e));
    }

    stopBGM() {
        this.bgm.pause();
    }

    playStamp(combo = 0) {
        // コンボ数に応じて少しピッチを上げて気持ちよさを出す
        const sound = this.seStamp.cloneNode();
        sound.volume = Math.min(0.8 + (combo * 0.05), 1.0);
        sound.play().catch(() => {});
    }

    playBomb() {
        const sound = this.seBomb.cloneNode();
        sound.play().catch(() => {});
    }

    playVoice() {
        this.voiceAngry.play().catch(() => {});
    }
}

const audio = new AudioManager();