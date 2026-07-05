const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 画像アセットの準備
const bossImg = new Image();
let bossImgLoaded = false;
bossImg.onload = () => { bossImgLoaded = true; };
bossImg.src = 'assets/images/boss.png';

const empImg = new Image();
let empImgLoaded = false;
empImg.onload = () => { empImgLoaded = true; };
empImg.src = 'assets/images/employee.png';

// 演出用
const camera = { x: 0, y: 0, shakeTime: 0, shakeIntensity: 0 };
let particles = [];

function shakeScreen(intensity, time) {
    camera.shakeIntensity = intensity;
    camera.shakeTime = time;
}

class Particle {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 12;
        this.vy = (Math.random() - 0.5) * 12;
        this.size = Math.random() * 5 + 2;
        this.life = 1.0;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        this.life -= 0.04;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = Math.max(this.life, 0);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.restore();
    }
}

function spawnParticles(x, y, count) {
    for(let i=0; i<count; i++) particles.push(new Particle(x, y));
}

// ==================== ゲーム・物理エンジン管理 ====================

const gameState = {
    running: false,
    engine: null,
    world: null,
    runner: null,
    mouseConstraint: null,
    bossBody: null,
    sling: null,
    enemies: [],
    shotsLeft: 3,
    state: 'idle', // idle, flying, gameover
    doubleTapTimer: 0,
    bombUsed: false // 手榴弾は1発射につき1回
};

// ステージの塔を構築する
function buildStage(cx, cy) {
    const blockOpts = { label: 'block', friction: 0.5, restitution: 0.1, density: 0.005 };
    const empOpts = { label: 'employee', restitution: 0.4, friction: 0.5, density: 0.002 };

    // 書類の束（ブロック）と社員（敵）をピラミッド状に積む
    Composite.add(gameState.world, [
        Bodies.rectangle(cx - 50, cy, 20, 50, blockOpts),
        Bodies.rectangle(cx + 50, cy, 20, 50, blockOpts),
        Bodies.rectangle(cx, cy - 35, 140, 15, blockOpts), // 板
        
        Bodies.rectangle(cx - 30, cy - 70, 20, 50, blockOpts),
        Bodies.rectangle(cx + 30, cy - 70, 20, 50, blockOpts),
        Bodies.rectangle(cx, cy - 105, 100, 15, blockOpts), // 板
        
        Bodies.rectangle(cx, cy - 140, 20, 50, blockOpts)
    ]);

    // 社員を各階層に配置
    const e1 = Bodies.circle(cx, cy + 10, 18, empOpts);
    const e2 = Bodies.circle(cx, cy - 60, 18, empOpts);
    const e3 = Bodies.circle(cx, cy - 130, 18, empOpts);
    
    gameState.enemies.push(e1, e2, e3);
    Composite.add(gameState.world, [e1, e2, e3]);
}

function initMatter() {
    if (gameState.engine) {
        Runner.stop(gameState.runner);
        Engine.clear(gameState.engine);
    }
    
    gameState.engine = Engine.create();
    gameState.world = gameState.engine.world;
    gameState.engine.gravity.y = 1.2; // アングリーバード風の少し強めの重力

    const w = 450;
    const h = 800;

    // 床・壁・天井（見えない壁）
    const wallOpts = { isStatic: true, render: { visible: false } };
    Composite.add(gameState.world, [
        Bodies.rectangle(w/2, h + 25, w + 100, 50, wallOpts), // 床
        Bodies.rectangle(-25, h/2, 50, h * 2, wallOpts),      // 左壁
        Bodies.rectangle(w + 25, h/2, 50, h * 2, wallOpts),   // 右壁
        Bodies.rectangle(w/2, -500, w * 2, 50, wallOpts)      // 天井
    ]);

    // 空中の足場（デスク）
    Composite.add(gameState.world, [
        Bodies.rectangle(w/2, 350, 200, 20, { isStatic: true, label: 'desk' }), // 中央の棚
        Bodies.rectangle(80, 550, 150, 20, { isStatic: true, label: 'desk' }),  // 左の棚
        Bodies.rectangle(w - 80, 200, 150, 20, { isStatic: true, label: 'desk' }) // 右の棚
    ]);

    // 足場の上に塔を建てる
    buildStage(w/2, 320);
    buildStage(80, 520);

    // マウスコントロール（スリングショット用）
    const mouse = Mouse.create(canvas);
    // スケール対応：画面のCSSサイズとCanvasの論理サイズ(450x800)のズレを補正
    const container = document.getElementById('game-container');
    const scaleX = 450 / container.clientWidth;
    const scaleY = 800 / container.clientHeight;
    Mouse.setScale(mouse, { x: scaleX, y: scaleY });

    gameState.mouseConstraint = MouseConstraint.create(gameState.engine, {
        mouse: mouse,
        constraint: { stiffness: 0.1, render: { visible: false } }
    });
    Composite.add(gameState.world, gameState.mouseConstraint);

    // 引っ張って離した時のイベント（発射！）
    Events.on(gameState.mouseConstraint, 'enddrag', function(e) {
        if (gameState.sling && gameState.sling.bodyB === gameState.bossBody) {
            const dist = Vector.magnitude(Vector.sub(gameState.bossBody.position, gameState.sling.pointA));
            if (dist > 20) { // 一定以上引っ張られていたら発射
                gameState.sling.bodyB = null; 
                gameState.state = 'flying';
                if(typeof audio !== 'undefined' && audio) audio.playShoot();
                
                gameState.shotsLeft--;
                document.getElementById('shots-count').innerText = gameState.shotsLeft;
                
                // 4秒後に次の弾（局長）を装填するか、ゲーム終了判定
                setTimeout(() => {
                    if (gameState.enemies.length > 0 && gameState.shotsLeft > 0) {
                        loadBoss();
                    } else if (gameState.enemies.length > 0 && gameState.shotsLeft <= 0) {
                        endGame(false); // 弾切れ
                    }
                }, 4000);
            }
        }
    });

    // 衝突時のダメージ判定（敵を倒す）
    Events.on(gameState.engine, 'collisionStart', function(event) {
        const pairs = event.pairs;
        for (let i = 0; i < pairs.length; i++) {
            const bodyA = pairs[i].bodyA;
            const bodyB = pairs[i].bodyB;

            // 相対的な衝撃の強さを簡易計算
            const relVel = Vector.magnitude(Vector.sub(bodyA.velocity, bodyB.velocity));

            if (relVel > 2 && typeof audio !== 'undefined' && audio) {
                audio.playBounce(); // ぶつかる音
            }

            // 一定以上の衝撃が社員に加わったら撃破！
            if (bodyA.label === 'employee' && relVel > 4) killEnemy(bodyA);
            if (bodyB.label === 'employee' && relVel > 4) killEnemy(bodyB);
        }
    });

    gameState.runner = Runner.create();
    Runner.run(gameState.runner, gameState.engine);
}

// 局長（弾）をパチンコにセットする
function loadBoss() {
    if (gameState.bossBody) {
        Composite.remove(gameState.world, gameState.bossBody);
    }
    const anchor = { x: 450 / 2, y: 700 }; // 画面下部中央
    
    gameState.bossBody = Bodies.circle(anchor.x, anchor.y, 22, { 
        label: 'boss', 
        restitution: 0.6, // よく弾む
        density: 0.05     // 重くして破壊力アップ
    });
    
    if (!gameState.sling) {
        gameState.sling = Constraint.create({
            pointA: anchor,
            bodyB: gameState.bossBody,
            stiffness: 0.03, // ゴムの伸びやすさ
            damping: 0.01,
            length: 10
        });
        Composite.add(gameState.world, gameState.sling);
    } else {
        gameState.sling.bodyB = gameState.bossBody;
    }
    
    Composite.add(gameState.world, gameState.bossBody);
    gameState.state = 'idle';
    gameState.bombUsed = false;
}

// 敵を倒した時の処理
function killEnemy(body) {
    if (gameState.enemies.includes(body)) {
        gameState.enemies = gameState.enemies.filter(e => e !== body);
        Composite.remove(gameState.world, body);
        
        spawnParticles(body.position.x, body.position.y, 20);
        shakeScreen(8, 10);
        if(typeof audio !== 'undefined' && audio) audio.playStamp(5 - gameState.enemies.length);
        
        document.getElementById('escaped-count').innerText = gameState.enemies.length;

        // 敵が全滅したらクリア！
        if (gameState.enemies.length <= 0) {
            setTimeout(() => endGame(true), 1500);
        }
    }
}

// 手榴弾ボム（ダブルタップで物理爆発）
function triggerBomb() {
    if (gameState.state !== 'flying' || gameState.bombUsed || !gameState.bossBody) return;
    gameState.bombUsed = true;
    
    if(typeof audio !== 'undefined' && audio) audio.playBomb();
    shakeScreen(20, 20); 
    spawnParticles(gameState.bossBody.position.x, gameState.bossBody.position.y, 40);
    
    // 局長の周囲のBodyに爆発の力（衝撃波）を加える
    const allBodies = Composite.allBodies(gameState.world);
    allBodies.forEach(b => {
        if (b.isStatic || b === gameState.bossBody) return;
        const dx = b.position.x - gameState.bossBody.position.x;
        const dy = b.position.y - gameState.bossBody.position.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 180) { // 爆発の及ぶ範囲
            const forceMag = 0.1 * (180 - dist) / 180; // 近いほど強い
            Matter.Body.applyForce(b, b.position, { x: (dx/dist)*forceMag, y: (dy/dist)*forceMag });
            
            // 敵が爆風に巻き込まれたら撃破
            if (b.label === 'employee') killEnemy(b);
        }
    });

    const originalBg = canvas.style.backgroundColor;
    canvas.style.backgroundColor = '#ffffff';
    setTimeout(() => { canvas.style.backgroundColor = originalBg; }, 100);
}

// ==================== 描画ループ ====================

function drawGame() {
    ctx.save();
    
    // カメラ揺れ
    if (camera.shakeTime > 0) {
        camera.shakeTime--;
        camera.x = (Math.random() - 0.5) * camera.shakeIntensity;
        camera.y = (Math.random() - 0.5) * camera.shakeIntensity;
        ctx.translate(camera.x, camera.y);
    }

    // 背景
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!gameState.world) { ctx.restore(); return; }

    // スリングショットのゴム（後ろ側）描画
    if (gameState.sling && gameState.sling.bodyB) {
        ctx.beginPath();
        ctx.moveTo(gameState.sling.pointA.x - 20, gameState.sling.pointA.y);
        ctx.lineTo(gameState.bossBody.position.x, gameState.bossBody.position.y);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 6;
        ctx.stroke();
    }

    // Matter.js の全Bodyを描画にマッピング
    const bodies = Composite.allBodies(gameState.world);
    bodies.forEach(body => {
        ctx.save();
        ctx.translate(body.position.x, body.position.y);
        ctx.rotate(body.angle);

        if (body.label === 'boss') {
            if (bossImgLoaded) {
                ctx.drawImage(bossImg, -body.circleRadius, -body.circleRadius, body.circleRadius*2, body.circleRadius*2);
            } else {
                ctx.fillStyle = '#ef4444';
                ctx.beginPath(); ctx.arc(0,0,body.circleRadius,0,Math.PI*2); ctx.fill();
            }
            // ボムが使える時はオーラをまとう
            if (gameState.state === 'flying' && !gameState.bombUsed) {
                ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)';
                ctx.lineWidth = 4;
                ctx.beginPath(); ctx.arc(0,0,body.circleRadius + 5 + Math.sin(Date.now()/50)*3, 0, Math.PI*2); ctx.stroke();
            }
        } 
        else if (body.label === 'employee') {
            if (empImgLoaded) {
                ctx.drawImage(empImg, -body.circleRadius, -body.circleRadius, body.circleRadius*2, body.circleRadius*2);
            } else {
                ctx.fillStyle = '#3b82f6';
                ctx.beginPath(); ctx.arc(0,0,body.circleRadius,0,Math.PI*2); ctx.fill();
            }
        }
        else if (body.label === 'block') {
            const w = body.bounds.max.x - body.bounds.min.x;
            const h = body.bounds.max.y - body.bounds.min.y;
            ctx.fillStyle = '#cbd5e1';
            ctx.strokeStyle = '#64748b';
            ctx.lineWidth = 2;
            ctx.fillRect(-w/2, -h/2, w, h);
            ctx.strokeRect(-w/2, -h/2, w, h);
            // 書類っぽい線
            ctx.beginPath(); ctx.moveTo(-w/3, -h/4); ctx.lineTo(w/3, -h/4); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-w/3, 0); ctx.lineTo(w/3, 0); ctx.stroke();
        }
        else if (body.label === 'desk') {
            const w = body.bounds.max.x - body.bounds.min.x;
            const h = body.bounds.max.y - body.bounds.min.y;
            ctx.fillStyle = '#475569';
            ctx.fillRect(-w/2, -h/2, w, h);
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(-w/2, -h/2, w, 4); // デスクのフチ
        }
        ctx.restore();
    });

    // スリングショットのゴム（前側）描画
    if (gameState.sling && gameState.sling.bodyB) {
        ctx.beginPath();
        ctx.moveTo(gameState.bossBody.position.x, gameState.bossBody.position.y);
        ctx.lineTo(gameState.sling.pointA.x + 20, gameState.sling.pointA.y);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 4;
        ctx.stroke();
    }

    // パーティクルの更新と描画
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        p.draw();
        if (p.life <= 0) particles.splice(i, 1);
    }

    ctx.restore(); // カメラ揺れリセット
}

function gameLoop() {
    drawGame();
    if (gameState.running) {
        requestAnimationFrame(gameLoop);
    }
}

// ダブルタップの検知
let isInputSetup = false;
function setupInput() {
    if (isInputSetup) return;
    isInputSetup = true;

    const onStart = (e) => {
        if (!gameState.running) return;
        
        // 空中飛行中のダブルタップで手榴弾発動
        if (gameState.state === 'flying' && !gameState.bombUsed) {
            if (gameState.doubleTapTimer > 0) {
                triggerBomb();
                gameState.doubleTapTimer = 0;
            } else {
                gameState.doubleTapTimer = 300; // 300ms以内に2回目でボム
            }
        }
    };

    // スマホタッチとマウスクリックの両方でボム発動を拾う
    canvas.addEventListener('touchstart', (e) => { onStart(e); }, { passive: false });
    canvas.addEventListener('mousedown', onStart);
    
    // タイマー減衰ループ
    setInterval(() => {
        if(gameState.doubleTapTimer > 0) gameState.doubleTapTimer -= 50;
    }, 50);
}

// ==================== ゲーム進行制御 ====================

function startGame() {
    if(typeof audio !== 'undefined') {
        audio.unlock();
        audio.playBGM();
    }
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('result-screen').classList.add('hidden');
    document.getElementById('play-ui').classList.remove('hidden');

    gameState.enemies = [];
    gameState.shotsLeft = 3;
    document.getElementById('shots-count').innerText = gameState.shotsLeft;
    
    initMatter();
    loadBoss();
    setupInput();
    
    if (!gameState.running) {
        gameState.running = true;
        gameLoop();
    }
}

function endGame(isClear) {
    if (!gameState.running) return;
    gameState.running = false;
    
    if (gameState.runner) Runner.stop(gameState.runner);
    if(typeof audio !== 'undefined') audio.stopBGM();

    document.getElementById('play-ui').classList.add('hidden');
    const resultScreen = document.getElementById('result-screen');
    resultScreen.classList.remove('hidden');

    const title = document.getElementById('result-title');
    const desc = document.getElementById('result-desc');

    if (isClear) {
        title.innerText = "残業取締 完了！";
        title.className = "text-4xl font-black text-yellow-400 mb-2 tracking-widest animate-bounce";
        desc.innerText = "見事だ！ 物理法則をもねじ伏せ、全ての社員を定時退社から引き戻したぞ！";
    } else {
        title.innerText = "定時退社 発生";
        title.className = "text-4xl font-black text-red-500 mb-2 tracking-widest";
        desc.innerText = "弾（局長）が尽きてしまった。社員どもは全員家に帰ってしまったぞ。始末書だ！";
    }
}

// ボタンイベントの登録
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('result-screen').classList.add('hidden');
    startGame(); // そのまま再出社
});

// タイトル画面用の初回描画
ctx.fillStyle = '#1e293b';
ctx.fillRect(0, 0, canvas.width, canvas.height);