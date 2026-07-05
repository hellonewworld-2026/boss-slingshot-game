const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 論理サイズを固定（物理演算の安定化のため）
const LOGICAL_WIDTH = 450;
const LOGICAL_HEIGHT = 800;
canvas.width = LOGICAL_WIDTH;
canvas.height = LOGICAL_HEIGHT;

// ==================== リッチ描画システム ====================

// 背景の描画（夜のオフィス街）
function drawBackground() {
    // 空のグラデーション
    const grad = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
    grad.addColorStop(0, '#0f172a'); // 濃い紺色
    grad.addColorStop(1, '#334155'); // 少し明るいグレーブルー
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // 遠景のビル群シルエット
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(50, 400, 80, 400);
    ctx.fillRect(150, 300, 100, 500);
    ctx.fillRect(280, 450, 90, 350);
    ctx.fillRect(380, 250, 70, 550);

    // ビルの窓の明かり
    ctx.fillStyle = 'rgba(250, 204, 21, 0.4)';
    for(let i=160; i<240; i+=25) {
        for(let j=320; j<700; j+=30) {
            if(Math.random() > 0.3) ctx.fillRect(i, j, 10, 15);
        }
    }
}

// 木箱（障害物）の描画
function drawWoodenCrate(x, y, w, h, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    
    // ベースの色
    ctx.fillStyle = '#b45309'; // 木の色
    ctx.fillRect(-w/2, -h/2, w, h);
    
    // 枠線
    ctx.strokeStyle = '#78350f'; // 濃い茶色
    ctx.lineWidth = 4;
    ctx.strokeRect(-w/2, -h/2, w, h);
    
    // 木目・補強線の描画
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w/2, -h/2); ctx.lineTo(w/2, h/2);
    ctx.moveTo(w/2, -h/2); ctx.lineTo(-w/2, h/2);
    ctx.stroke();

    ctx.restore();
}

// ==================== ゲーム・物理エンジン管理 ====================

const gameState = {
    running: false,
    engine: null,
    world: null,
    runner: null,
    bossBody: null,
    enemies: [],
    shotsLeft: 3,
    state: 'idle', // idle(待機), dragging(引っ張り中), flying(飛行中)
    anchor: { x: LOGICAL_WIDTH / 2, y: 650 }, // 発射台の位置
    dragPos: { x: 0, y: 0 }
};

// 物理エンジンの初期化
function initMatter() {
    if (gameState.engine) {
        Runner.stop(gameState.runner);
        Engine.clear(gameState.engine);
    }
    
    gameState.engine = Engine.create();
    gameState.world = gameState.engine.world;
    gameState.engine.gravity.y = 1.0; // 重力

    // 床・壁の作成（透明な枠）
    const wallOpts = { isStatic: true, friction: 0.5, restitution: 0.2 };
    Composite.add(gameState.world, [
        Bodies.rectangle(LOGICAL_WIDTH/2, LOGICAL_HEIGHT + 25, LOGICAL_WIDTH + 100, 50, wallOpts), // 床
        Bodies.rectangle(-25, LOGICAL_HEIGHT/2, 50, LOGICAL_HEIGHT * 2, wallOpts), // 左壁
        Bodies.rectangle(LOGICAL_WIDTH + 25, LOGICAL_HEIGHT/2, 50, LOGICAL_HEIGHT * 2, wallOpts) // 右壁
    ]);

    // 発射台（スリングショットの土台）
    Composite.add(gameState.world, [
        Bodies.rectangle(LOGICAL_WIDTH/2, 725, 40, 150, { isStatic: true, label: 'slingshot_base' })
    ]);

    // ステージ構築（木箱と社員の塔）
    buildStage(LOGICAL_WIDTH / 2, 550);

    // 衝突イベント（ダメージ判定）
    Events.on(gameState.engine, 'collisionStart', function(event) {
        event.pairs.forEach(pair => {
            const bodyA = pair.bodyA;
            const bodyB = pair.bodyB;
            const relVel = Vector.magnitude(Vector.sub(bodyA.velocity, bodyB.velocity));

            // 一定以上の衝撃で敵を倒す
            if (relVel > 3) {
                if (bodyA.label === 'employee') killEnemy(bodyA);
                if (bodyB.label === 'employee') killEnemy(bodyB);
                
                // 木箱の破壊音
                if ((bodyA.label === 'block' || bodyB.label === 'block') && typeof audio !== 'undefined' && audio.playBounce) {
                    audio.playBounce();
                }
            }
        });
    });

    gameState.runner = Runner.create();
    Runner.run(gameState.runner, gameState.engine);
}

// 塔の構築
function buildStage(cx, cy) {
    const blockOpts = { label: 'block', friction: 0.8, restitution: 0.1, density: 0.005 };
    const empOpts = { label: 'employee', restitution: 0.4, friction: 0.5, density: 0.002 };

    // 木箱
    Composite.add(gameState.world, [
        Bodies.rectangle(cx - 60, cy, 30, 80, blockOpts),
        Bodies.rectangle(cx + 60, cy, 30, 80, blockOpts),
        Bodies.rectangle(cx, cy - 50, 180, 20, blockOpts), // 1階の天井
        
        Bodies.rectangle(cx - 30, cy - 90, 30, 60, blockOpts),
        Bodies.rectangle(cx + 30, cy - 90, 30, 60, blockOpts),
        Bodies.rectangle(cx, cy - 130, 100, 20, blockOpts) // 2階の天井
    ]);

    // 敵（社員）
    const e1 = Bodies.circle(cx, cy + 10, 20, empOpts); // 1階
    const e2 = Bodies.circle(cx, cy - 80, 20, empOpts); // 2階
    const e3 = Bodies.circle(cx, cy - 160, 20, empOpts); // 屋上
    
    gameState.enemies.push(e1, e2, e3);
    Composite.add(gameState.world, [e1, e2, e3]);
}

// ボス（弾）のセット
function loadBoss() {
    if (gameState.bossBody) Composite.remove(gameState.world, gameState.bossBody);
    
    // ドラッグ中は重力の影響を受けないように isStatic を一時的に true にする
    gameState.bossBody = Bodies.circle(gameState.anchor.x, gameState.anchor.y, 22, { 
        label: 'boss', 
        restitution: 0.5, 
        density: 0.02,
        isStatic: true 
    });
    
    Composite.add(gameState.world, gameState.bossBody);
    gameState.state = 'idle';
}

function killEnemy(body) {
    if (gameState.enemies.includes(body)) {
        gameState.enemies = gameState.enemies.filter(e => e !== body);
        Composite.remove(gameState.world, body);
        
        document.getElementById('escaped-count').innerText = gameState.enemies.length;
        if(typeof audio !== 'undefined' && audio.playStamp) audio.playStamp();

        // 敵が全滅したら少し待ってクリア画面へ
        if (gameState.enemies.length <= 0) {
            setTimeout(() => endGame(true), 1500);
        }
    }
}

// ==================== ドラッグ（引っ張り）操作の完全自作 ====================

let isInputSetup = false;
function setupInput() {
    if (isInputSetup) return;
    isInputSetup = true;

    // CSSのサイズ変更に影響されない正確な座標取得
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const scaleX = LOGICAL_WIDTH / rect.width;
        const scaleY = LOGICAL_HEIGHT / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    const onPointerDown = (e) => {
        if (gameState.state !== 'idle' || !gameState.bossBody) return;
        const pos = getPos(e);
        
        // ボスとの距離を計算（当たり判定を広めにとる）
        const dx = pos.x - gameState.bossBody.position.x;
        const dy = pos.y - gameState.bossBody.position.y;
        if (Math.sqrt(dx*dx + dy*dy) < 50) {
            gameState.state = 'dragging';
            gameState.dragPos = pos;
        }
    };

    const onPointerMove = (e) => {
        if (gameState.state !== 'dragging') return;
        const pos = getPos(e);
        
        // 引っ張れる最大距離を制限
        const maxDrag = 120;
        const dx = pos.x - gameState.anchor.x;
        const dy = pos.y - gameState.anchor.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist > maxDrag) {
            gameState.dragPos = {
                x: gameState.anchor.x + (dx / dist) * maxDrag,
                y: gameState.anchor.y + (dy / dist) * maxDrag
            };
        } else {
            gameState.dragPos = pos;
        }
        
        // ボスの位置を手動で強制更新
        Matter.Body.setPosition(gameState.bossBody, gameState.dragPos);
    };

    const onPointerUp = (e) => {
        if (gameState.state !== 'dragging') return;
        
        const dx = gameState.anchor.x - gameState.bossBody.position.x;
        const dy = gameState.anchor.y - gameState.bossBody.position.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        // 少しでも引っ張られていたら発射
        if (dist > 10) {
            gameState.state = 'flying';
            
            // 物理挙動を有効化（固定解除）
            Matter.Body.setStatic(gameState.bossBody, false);
            
            // 引っ張った量に応じた力を加える（アングリーバードの挙動）
            const forceMultiplier = 0.00035; 
            Matter.Body.applyForce(gameState.bossBody, gameState.bossBody.position, {
                x: dx * forceMultiplier,
                y: dy * forceMultiplier
            });

            if(typeof audio !== 'undefined' && audio.playShoot) audio.playShoot();

            gameState.shotsLeft--;
            document.getElementById('shots-count').innerText = gameState.shotsLeft;

            // 弾切れ・次弾装填チェック
            setTimeout(() => {
                if (gameState.enemies.length > 0) {
                    if (gameState.shotsLeft > 0) {
                        loadBoss();
                    } else {
                        endGame(false);
                    }
                }
            }, 5000); // 5秒後に次をセット
        } else {
            // 引っ張りが弱ければ元に戻す
            Matter.Body.setPosition(gameState.bossBody, gameState.anchor);
            gameState.state = 'idle';
        }
    };

    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onPointerDown(e); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); onPointerMove(e); }, { passive: false });
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); onPointerUp(e); }, { passive: false });
    
    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
}

// ==================== メイン描画ループ ====================

function drawGame() {
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // 1. リッチな背景
    drawBackground();

    if (!gameState.world) return;

    // 2. スリングショットの奥のゴム
    if (gameState.state === 'dragging') {
        ctx.beginPath();
        ctx.moveTo(gameState.anchor.x - 20, gameState.anchor.y);
        ctx.lineTo(gameState.bossBody.position.x, gameState.bossBody.position.y);
        ctx.strokeStyle = '#1e293b'; // 暗いゴム色
        ctx.lineWidth = 6;
        ctx.stroke();
    }

    // 3. 物理オブジェクトの描画
    const bodies = Composite.allBodies(gameState.world);
    bodies.forEach(body => {
        if (body.label === 'slingshot_base') {
            // パチンコの支柱
            ctx.fillStyle = '#78350f';
            ctx.fillRect(body.bounds.min.x, body.bounds.min.y, body.bounds.max.x - body.bounds.min.x, body.bounds.max.y - body.bounds.min.y);
        }
        else if (body.label === 'block') {
            const w = body.bounds.max.x - body.bounds.min.x;
            const h = body.bounds.max.y - body.bounds.min.y;
            drawWoodenCrate(body.position.x, body.position.y, w, h, body.angle);
        }
        else if (body.label === 'employee') {
            ctx.save();
            ctx.translate(body.position.x, body.position.y);
            ctx.rotate(body.angle);
            // 体
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath(); ctx.arc(0, 0, body.circleRadius, 0, Math.PI * 2); ctx.fill();
            // 絵文字で顔を描画（画像がなくても高クオリティ）
            ctx.font = '24px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('😨', 0, 0);
            ctx.restore();
        }
        else if (body.label === 'boss') {
            ctx.save();
            ctx.translate(body.position.x, body.position.y);
            ctx.rotate(body.angle);
            // 体
            ctx.fillStyle = '#ef4444';
            ctx.beginPath(); ctx.arc(0, 0, body.circleRadius, 0, Math.PI * 2); ctx.fill();
            // 絵文字で顔
            ctx.font = '28px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('😡', 0, 0);
            ctx.restore();
        }
    });

    // 4. スリングショットの手前のゴム
    if (gameState.state === 'dragging') {
        ctx.beginPath();
        ctx.moveTo(gameState.bossBody.position.x, gameState.bossBody.position.y);
        ctx.lineTo(gameState.anchor.x + 20, gameState.anchor.y);
        ctx.strokeStyle = '#ef4444'; // 手前は赤っぽいゴム
        ctx.lineWidth = 4;
        ctx.stroke();
    }
}

function gameLoop() {
    if (gameState.running) {
        drawGame();
        requestAnimationFrame(gameLoop);
    }
}

// ==================== ゲーム進行制御 ====================

function startGame() {
    if(typeof audio !== 'undefined' && audio.unlock) {
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
    if(typeof audio !== 'undefined' && audio.stopBGM) audio.stopBGM();

    document.getElementById('play-ui').classList.add('hidden');
    const resultScreen = document.getElementById('result-screen');
    resultScreen.classList.remove('hidden');

    const title = document.getElementById('result-title');
    const desc = document.getElementById('result-desc');

    if (isClear) {
        title.innerText = "残業取締 完了！";
        title.className = "text-4xl font-black text-yellow-400 mb-2 tracking-widest";
        desc.innerText = "見事だ！ 物理法則をもねじ伏せ、全ての社員を定時退社から引き戻した！";
    } else {
        title.innerText = "定時退社 発生";
        title.className = "text-4xl font-black text-red-500 mb-2 tracking-widest";
        desc.innerText = "弾（局長）が尽きてしまった。社員どもは全員家に帰ってしまったぞ。";
    }
}

// 初期描画
drawBackground();

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('result-screen').classList.add('hidden');
    startGame(); 
});