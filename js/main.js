const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 画面のアスペクト比を9:16に保つ
function resizeCanvas() {
    const container = document.getElementById('game-container');
    
    // コンテナのサイズを取得（CSSが効いていない場合は0になることがある）
    let cw = container.clientWidth;
    let ch = container.clientHeight;
    
    // 安全対策：サイズが0の場合はウィンドウサイズから計算する
    if (cw === 0 || ch === 0) {
        cw = Math.min(window.innerWidth, 450);
        ch = Math.min(window.innerHeight, 800);
    }
    
    canvas.width = cw;
    canvas.height = ch;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ==================== ゲーム内の各Entity ====================

// プレイヤー：局長（ちびっこギャング）
class Boss {
    constructor() {
        this.radius = 28;
        this.reset();
        
        // 画像読み込み
        this.img = new Image();
        this.imgLoaded = false;
        this.imgError = false; // エラーフラグを追加
        
        this.img.onload = () => { this.imgLoaded = true; };
        this.img.onerror = () => { 
            console.warn("ボスの画像が見つからねぇ！図形で代用するぞ！");
            this.imgError = true; 
        };
        this.img.src = 'assets/images/boss.png';
    }

    reset() {
        this.x = canvas.width / 2;
        this.y = canvas.height - 120;
        this.vx = 0;
        this.vy = 0;
        this.rebound = 0.98; // 反射時の速度減衰（若干の摩擦）
        this.isMoving = false;
        this.trail = [];
    }

    update() {
        if (this.isMoving) {
            this.x += this.vx;
            this.y += this.vy;

            // 摩擦による緩やかな減速
            this.vx *= 0.99;
            this.vy *= 0.99;

            // 軌跡の追加
            this.trail.push({ x: this.x, y: this.y, alpha: 1 });
            if (this.trail.length > 8) this.trail.shift();

            // 速度が極小になったら停止
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (speed < 0.8) {
                this.vx = 0;
                this.vy = 0;
                this.isMoving = false;
                this.trail = [];
                gameState.currentCombo = 0;
            }
        }
    }

    draw() {
        // 軌跡の描画（残像エフェクト）
        this.trail.forEach((t, index) => {
            ctx.save();
            ctx.globalAlpha = (index / this.trail.length) * 0.3;
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(t.x, t.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        // 本体描画
        ctx.save();
        if (this.imgLoaded && !this.imgError) {
            // 画像を円形にクリップ
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(this.img, this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
        } else {
            // 画像がない場合のフォールバック（赤く威圧的な球体）
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('局長', this.x, this.y + 5);
        }
        ctx.restore();
    }
}

// ターゲット：平社員
class Employee {
    constructor() {
        this.radius = 20;
        this.x = Math.random() * (canvas.width - 60) + 30;
        this.y = canvas.height - 200 - Math.random() * 150; // デスク周辺から発生
        this.vx = (Math.random() - 0.5) * 2.5;
        this.vy = -(Math.random() * 1.5 + 1.0); // 上（エレベーター）に逃げる
        this.isStamped = false;
        this.stampScale = 0; // ハンコが押されたときのアニメーション用

        this.img = new Image();
        this.imgLoaded = false;
        this.imgError = false;
        this.img.onload = () => { this.imgLoaded = true; };
        this.img.onerror = () => { this.imgError = true; };
        this.img.src = 'assets/images/employee.png';
    }

    update() {
        if (!this.isStamped) {
            this.x += this.vx;
            this.y += this.vy;

            // 左右の壁で跳ね返りながら逃げる
            if (this.x - this.radius < 0 || this.x + this.radius > canvas.width) {
                this.vx = -this.vx;
            }
        } else {
            // 残業モード（ハンコが押された）
            if (this.stampScale < 1) {
                this.stampScale += 0.15;
            }
        }
    }

    draw() {
        ctx.save();
        if (this.imgLoaded && !this.imgError) {
            ctx.drawImage(this.img, this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
        } else {
            // フォールバック（悲哀の青い球体）
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('社員', this.x, this.y + 4);
        }

        // 強制残業「始末書ハンコ」エフェクト
        if (this.isStamped) {
            ctx.globalAlpha = Math.min(this.stampScale, 1.0);
            ctx.strokeStyle = '#ef4444';
            ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 1.2 * this.stampScale, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // 「残業」の文字刻印
            ctx.fillStyle = '#ef4444';
            ctx.font = '900 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('残業', this.x, this.y + 6);
        }
        ctx.restore();
    }
}

// 障害物：事務用デスク
class Desk {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.width = w;
        this.height = h;
    }

    draw() {
        ctx.save();
        ctx.fillStyle = '#475569';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 3;
        // 面取り
        ctx.beginPath();
        ctx.roundRect(this.x, this.y, this.width, this.height, 8);
        ctx.fill();
        ctx.stroke();

        // 書類山積みのエフェクト
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(this.x + 10, this.y + 5, 15, 12);
        ctx.fillStyle = '#94a3b8';
        ctx.strokeRect(this.x + 10, this.y + 5, 15, 12);
        
        ctx.restore();
    }
}

// ==================== ゲーム管理システム ====================

const gameState = {
    running: false,
    boss: null, // 初期化時に生成する
    employees: [],
    desks: [],
    stampedCount: 0,
    escapedCount: 0,
    currentCombo: 0,
    dragStart: { x: 0, y: 0 },
    dragCurrent: { x: 0, y: 0 },
    isDragging: false,
    startTime: null,
    totalSeconds: 0,
    doubleTapTimer: 0
};

// ステージ初期化
function initStage() {
    gameState.boss = new Boss();
    gameState.employees = [];
    gameState.desks = [
        new Desk(40, 220, 100, 45),
        new Desk(canvas.width - 140, 220, 100, 45),
        new Desk(canvas.width / 2 - 50, 380, 100, 45),
        new Desk(40, 500, 100, 45),
        new Desk(canvas.width - 140, 500, 100, 45)
    ];

    // 初期社員生成
    for (let i = 0; i < 4; i++) {
        gameState.employees.push(new Employee());
    }

    gameState.stampedCount = 0;
    gameState.escapedCount = 0;
    gameState.currentCombo = 0;
    gameState.startTime = Date.now();
    gameState.totalSeconds = 0;

    document.getElementById('stamped-count').innerText = '0';
    document.getElementById('escaped-count').innerText = '0';
    document.getElementById('game-clock').innerText = '17:00';
}

// メインのゲームアップデート処理 (60FPS)
function updateGame() {
    if (!gameState.running) return;

    gameState.boss.update();

    // 局長（ボス）とオフィス境界の衝突
    if(typeof Physics !== 'undefined') {
        Physics.checkWallCollision(gameState.boss, canvas.width, canvas.height);
        
        // 局長（ボス）とデスクの衝突
        gameState.desks.forEach(desk => {
            Physics.resolveObstacleCollision(gameState.boss, desk);
        });
    }

    // 社員（ザコ）たちの更新
    for (let i = gameState.employees.length - 1; i >= 0; i--) {
        const emp = gameState.employees[i];
        emp.update();

        // エレベーター（上端）に逃亡成功したか
        if (!emp.isStamped && emp.y - emp.radius < 50) {
            gameState.escapedCount++;
            document.getElementById('escaped-count').innerText = gameState.escapedCount;
            gameState.employees.splice(i, 1);
            
            // 逃亡が5人を超えたら局長の威厳失墜（ゲームオーバー）
            if (gameState.escapedCount >= 5) {
                endGame(false);
            }
            continue;
        }

        // 局長との体当たり判定（決裁完了！）
        if (typeof Physics !== 'undefined' && !emp.isStamped && Physics.checkCircleCollision(gameState.boss, emp)) {
            emp.isStamped = true;
            gameState.stampedCount++;
            gameState.currentCombo++;
            document.getElementById('stamped-count').innerText = gameState.stampedCount;
            if(typeof audio !== 'undefined') audio.playStamp(gameState.currentCombo);

            // 一定時間後に消滅させ、新しい社員をオフィス下部から補充
            setTimeout(() => {
                if (gameState.running) {
                    gameState.employees = gameState.employees.filter(e => e !== emp);
                    if (gameState.totalSeconds < 60) {
                        gameState.employees.push(new Employee());
                    }
                }
            }, 800);
        }
    }

    // 時計の進捗 (1秒プレイ＝ゲーム内1分)
    const elapsed = Math.floor((Date.now() - gameState.startTime) / 1000);
    if (elapsed !== gameState.totalSeconds) {
        gameState.totalSeconds = elapsed;
        
        const currentMinutes = elapsed % 60;
        const padMinutes = String(currentMinutes).padStart(2, '0');
        document.getElementById('game-clock').innerText = `17:${padMinutes}`;

        // 18:00 (60秒経過) で残業取締大成功
        if (gameState.totalSeconds >= 60) {
            endGame(true);
        }
    }

    // 手榴弾ダブルタップタイマーの減衰
    if (gameState.doubleTapTimer > 0) {
        gameState.doubleTapTimer -= 16.67; // 1Fあたりのミリ秒
    }
}

// 描画ループ
function drawGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. 水道局の床（タイル模様）をコード描画
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    const tileSize = 40;
    for (let x = 0; x < canvas.width; x += tileSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += tileSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    // 2. 逃亡口（エレベーターエリア）の描画
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, 50);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 50);
    ctx.lineTo(canvas.width, 50);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('↓↓↓ 定時退社口 (エレベーター) ↓↓↓', canvas.width / 2, 32);

    // 3. デスク（障害物）描画
    gameState.desks.forEach(desk => desk.draw());

    // 4. 社員（ザコ）描画
    gameState.employees.forEach(emp => emp.draw());

    // 5. 局長（プレイヤー）描画
    if(gameState.boss) gameState.boss.draw();

    // 6. 引っ張りガイドライン描画
    if (gameState.isDragging && gameState.boss && !gameState.boss.isMoving) {
        const dx = gameState.dragStart.x - gameState.dragCurrent.x;
        const dy = gameState.dragStart.y - gameState.dragCurrent.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 10) {
            // パワーと射出角の計算
            const maxDrag = 150;
            const powerRatio = Math.min(dist / maxDrag, 1.0);
            
            // ガイドライン
            ctx.save();
            ctx.lineWidth = 4;
            // 射出方向予測（逆ベクトル）
            const endX = gameState.boss.x + (dx * 1.5);
            const endY = gameState.boss.y + (dy * 1.5);

            // パワーに応じたカラーフェード
            const r = Math.floor(255 * powerRatio);
            const g = Math.floor(255 * (1 - powerRatio));
            ctx.strokeStyle = `rgb(${r}, ${g}, 0)`;
            ctx.setLineDash([8, 6]);

            ctx.beginPath();
            ctx.moveTo(gameState.boss.x, gameState.boss.y);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // チャージエフェクト
            ctx.restore();
            ctx.save();
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(gameState.boss.x, gameState.boss.y, gameState.boss.radius + (1 - powerRatio) * 20, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }
}

// 完全に自律したゲームループ
function gameLoop() {
    updateGame();
    drawGame();
    if (gameState.running) {
        requestAnimationFrame(gameLoop);
    }
}

// ==================== イベントハンドリング ====================

function setupInput() {
    // マウス / タッチ対応の統一ラッパー
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const onStart = (e) => {
        if (!gameState.running || !gameState.boss || gameState.boss.isMoving) return;
        const pos = getPos(e);
        
        // ダブルタップ判定（手榴弾ボム発動！）
        if (gameState.doubleTapTimer > 0) {
            triggerBomb();
            gameState.doubleTapTimer = 0;
            return;
        }
        gameState.doubleTapTimer = 250; // 250ms以内ならダブルタップ

        gameState.dragStart = pos;
        gameState.dragCurrent = pos;
        gameState.isDragging = true;
    };

    const onMove = (e) => {
        if (!gameState.isDragging) return;
        gameState.dragCurrent = getPos(e);
    };

    const onEnd = () => {
        if (!gameState.isDragging) return;
        gameState.isDragging = false;

        const dx = gameState.dragStart.x - gameState.dragCurrent.x;
        const dy = gameState.dragStart.y - gameState.dragCurrent.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 最小スワイプ閾値を超えていれば射出！
        if (dist > 15) {
            const maxDrag = 150;
            const power = Math.min(dist / maxDrag, 1.0) * 25; // 最大初速
            const angle = Math.atan2(dy, dx);

            gameState.boss.vx = Math.cos(angle) * power;
            gameState.boss.vy = Math.sin(angle) * power;
            gameState.boss.isMoving = true;

            // 射出と同時に俺様の爆音ボイスを轟かせる
            if(typeof audio !== 'undefined') audio.playVoice();
        }
    };

    // タッチイベント（スマホ）
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onStart(e); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); onMove(e); }, { passive: false });
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); onEnd(); }, { passive: false });

    // マウスイベント（PC）
    canvas.addEventListener('mousedown', onStart);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
}

// 必殺技：手榴弾ボムの起爆
function triggerBomb() {
    if(typeof audio !== 'undefined') audio.playBomb();
    
    // 画面中央に派手な爆発エフェクトを発生させ、全社員にハンコを押し付ける
    gameState.employees.forEach(emp => {
        if (!emp.isStamped) {
            emp.isStamped = true;
            gameState.stampedCount++;
            document.getElementById('stamped-count').innerText = gameState.stampedCount;
        }
    });

    // 爆発フラッシュ演出
    const originalBg = canvas.style.backgroundColor;
    canvas.style.backgroundColor = '#ef4444';
    setTimeout(() => { canvas.style.backgroundColor = originalBg; }, 100);
}

// ==================== ゲームフロー制御 ====================

function startGame() {
    if(typeof audio !== 'undefined') {
        audio.unlock();
        audio.playBGM();
    } else {
        console.warn("audio.js が読み込めていないか、エラーが起きているぞ！");
    }

    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('result-screen').classList.add('hidden');
    document.getElementById('play-ui').classList.remove('hidden');

    gameState.running = true;
    initStage();
    setupInput();
    gameLoop();
}

function endGame(isClear) {
    gameState.running = false;
    if(typeof audio !== 'undefined') audio.stopBGM();

    document.getElementById('play-ui').classList.add('hidden');
    const resultScreen = document.getElementById('result-screen');
    resultScreen.classList.remove('hidden');

    const title = document.getElementById('result-title');
    const desc = document.getElementById('result-desc');
    const finalScore = document.getElementById('final-score');

    finalScore.innerText = gameState.stampedCount;

    if (isClear) {
        title.innerText = "残業成功！";
        title.className = "text-4xl font-black text-yellow-400 mb-2 tracking-widest animate-bounce";
        desc.innerText = "お見事！ 局長（あなた）の威圧感によって、18:00までの退社ラッシュを完全に阻止した。サービス残業の開始だッ！";
    } else {
        title.innerText = "定時退社発生";
        title.className = "text-4xl font-black text-red-500 mb-2 tracking-widest";
        desc.innerText = "平社員どもが定時にオフィスを脱出し、家に帰ってしまった。 労働基準法を許した局長は始末書ものだ！";
    }
}

// 初期化（開始画面の描画等）
initStage(); // Canvasに初期状態を描画するために一度呼ぶ
drawGame();

// ボタンイベントの登録
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('result-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
});