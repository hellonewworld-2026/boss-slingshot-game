const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    const container = document.getElementById('game-container');
    let cw = container.clientWidth;
    let ch = container.clientHeight;
    if (cw === 0 || ch === 0) {
        cw = Math.min(window.innerWidth, 450);
        ch = Math.min(window.innerHeight, 800);
    }
    canvas.width = cw;
    canvas.height = ch;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ==================== 演出システム（カメラ揺れ・紙吹雪） ====================
const camera = { x: 0, y: 0, shakeTime: 0, shakeIntensity: 0 };

function shakeScreen(intensity, time) {
    camera.shakeIntensity = intensity;
    camera.shakeTime = time;
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 10;
        this.vy = (Math.random() - 0.5) * 10;
        this.size = Math.random() * 4 + 2;
        this.life = 1.0;
        this.color = color;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= 0.03;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = Math.max(this.life, 0);
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.restore();
    }
}

// ==================== ゲーム内の各Entity ====================

class Boss {
    constructor() {
        this.radius = 24; // 少し小さくしてスピード感アップ
        this.reset();
        this.img = new Image();
        this.imgLoaded = false;
        this.imgError = false;
        this.img.onload = () => { this.imgLoaded = true; };
        this.img.onerror = () => { this.imgError = true; };
        this.img.src = 'assets/images/boss.png';
    }

    reset() {
        this.x = canvas.width / 2;
        this.y = canvas.height - 100;
        this.vx = 0;
        this.vy = 0;
        this.rebound = 1.0; // 完全反射（減速しない！）
        this.isMoving = false;
        this.trail = [];
    }

    update() {
        if (this.isMoving) {
            this.x += this.vx;
            this.y += this.vy;

            // コンボが繋がるほど摩擦が減る（止まらない）
            const friction = Math.max(0.97, 0.99 - (gameState.currentCombo * 0.002));
            this.vx *= friction;
            this.vy *= friction;

            this.trail.push({ x: this.x, y: this.y });
            if (this.trail.length > 10) this.trail.shift();

            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (speed < 0.5) {
                this.vx = 0;
                this.vy = 0;
                this.isMoving = false;
                this.trail = [];
                gameState.currentCombo = 0;
            }
        }
    }

    draw() {
        // コンボによるオーラ（威圧感）エフェクト
        if (gameState.currentCombo > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 10 + Math.sin(Date.now()/50)*5, 0, Math.PI*2);
            ctx.fillStyle = `rgba(239, 68, 68, ${Math.min(gameState.currentCombo * 0.1, 0.5)})`;
            ctx.fill();
            ctx.restore();
        }

        this.trail.forEach((t, index) => {
            ctx.save();
            ctx.globalAlpha = (index / this.trail.length) * 0.3;
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(t.x, t.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        ctx.save();
        if (this.imgLoaded && !this.imgError) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(this.img, this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
        } else {
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('ボス', this.x, this.y + 4);
        }
        ctx.restore();
    }
}

class Employee {
    constructor(type = 'normal') {
        this.radius = 18;
        this.x = Math.random() * (canvas.width - 60) + 30;
        this.y = canvas.height - 50; // 下から湧いてくる
        this.type = type;
        
        // 種類によってスピードや挙動を変える
        let speedMult = 1.0;
        if (type === 'dash') speedMult = 1.8;
        if (type === 'manager') speedMult = 0.6;

        this.vx = (Math.random() - 0.5) * 3.0 * speedMult;
        this.vy = -(Math.random() * 2.0 + 1.0) * speedMult; 
        
        this.hp = (type === 'manager') ? 2 : 1; // 中間管理職は2回ぶつかる必要がある
        this.isStamped = false;
        this.stampScale = 0;

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
            if (this.x - this.radius < 0 || this.x + this.radius > canvas.width) {
                this.vx = -this.vx;
            }
        } else {
            if (this.stampScale < 1) this.stampScale += 0.2;
        }
    }

    draw() {
        ctx.save();
        if (this.imgLoaded && !this.imgError && this.type === 'normal') {
            ctx.drawImage(this.img, this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
        } else {
            // フォールバック（種類によって色を変える）
            ctx.fillStyle = this.type === 'dash' ? '#f59e0b' : (this.type === 'manager' ? '#64748b' : '#3b82f6');
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            let label = '社員';
            if (this.type === 'dash') label = '急ぎ';
            if (this.type === 'manager') label = `管理(${this.hp})`;
            ctx.fillText(label, this.x, this.y + 3);
        }

        if (this.isStamped) {
            ctx.globalAlpha = Math.min(this.stampScale, 1.0);
            ctx.strokeStyle = '#ef4444';
            ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 1.5 * this.stampScale, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#ef4444';
            ctx.font = '900 18px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('残業', this.x, this.y + 6);
        }
        ctx.restore();
    }
}

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
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        
        // 丸角描画（クラッシュ回避版）
        const r = 4;
        ctx.beginPath();
        ctx.moveTo(this.x + r, this.y);
        ctx.lineTo(this.x + this.width - r, this.y);
        ctx.arcTo(this.x + this.width, this.y, this.x + this.width, this.y + r, r);
        ctx.lineTo(this.x + this.width, this.y + this.height - r);
        ctx.arcTo(this.x + this.width, this.y + this.height, this.x + this.width - r, this.y + this.height, r);
        ctx.lineTo(this.x + r, this.y + this.height);
        ctx.arcTo(this.x, this.y + this.height, this.x, this.y + this.height - r, r);
        ctx.lineTo(this.x, this.y + r);
        ctx.arcTo(this.x, this.y, this.x + r, this.y, r);
        ctx.closePath();
        
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}

// ==================== ゲーム管理システム ====================

const gameState = {
    running: false,
    boss: null,
    employees: [],
    desks: [],
    particles: [],
    stampedCount: 0,
    escapedCount: 0,
    currentCombo: 0,
    dragStart: { x: 0, y: 0 },
    dragCurrent: { x: 0, y: 0 },
    isDragging: false,
    startTime: null,
    totalSeconds: 0,
    doubleTapTimer: 0,
    bombCount: 1 // 手榴弾の使用回数
};

function initStage() {
    gameState.boss = new Boss();
    gameState.employees = [];
    gameState.particles = [];
    
    // デスクを小さく、配置を左右に寄せて中央を広く空ける！
    gameState.desks = [
        new Desk(20, 200, 60, 30),
        new Desk(canvas.width - 80, 200, 60, 30),
        new Desk(canvas.width / 2 - 30, 400, 60, 30),
        new Desk(20, 550, 60, 30),
        new Desk(canvas.width - 80, 550, 60, 30)
    ];

    for (let i = 0; i < 5; i++) {
        gameState.employees.push(new Employee());
    }

    gameState.stampedCount = 0;
    gameState.escapedCount = 0;
    gameState.currentCombo = 0;
    gameState.bombCount = 1; // 1ゲーム1回は手榴弾を使える
    gameState.startTime = Date.now();
    gameState.totalSeconds = 0;

    document.getElementById('stamped-count').innerText = '0';
    document.getElementById('escaped-count').innerText = '0';
    document.getElementById('game-clock').innerText = '17:00';
}

// パーティクル発生関数
function spawnParticles(x, y, count) {
    const colors = ['#ffffff', '#cbd5e1', '#ef4444']; // 書類と血飛沫の色
    for(let i=0; i<count; i++){
        gameState.particles.push(new Particle(x, y, colors[Math.floor(Math.random() * colors.length)]));
    }
}

function updateGame() {
    if (!gameState.running) return;

    // カメラ揺れの更新
    if (camera.shakeTime > 0) {
        camera.shakeTime--;
        camera.x = (Math.random() - 0.5) * camera.shakeIntensity;
        camera.y = (Math.random() - 0.5) * camera.shakeIntensity;
    } else {
        camera.x = 0;
        camera.y = 0;
    }

    gameState.boss.update();

    if(typeof Physics !== 'undefined') {
        // 壁にぶつかったら音を鳴らす
        if (Physics.checkWallCollision(gameState.boss, canvas.width, canvas.height)) {
            if (audio) audio.playBounce();
        }
        
        gameState.desks.forEach(desk => {
            if (Physics.resolveObstacleCollision(gameState.boss, desk)) {
                if (audio) audio.playBounce();
            }
        });
    }

    // 敵の無限補充ロジック（時間が経つほど最大数が増える）
    const maxEnemies = Math.min(10, 5 + Math.floor(gameState.totalSeconds / 10));
    if (gameState.employees.length < maxEnemies && Math.random() < 0.08) {
        let type = 'normal';
        if (gameState.totalSeconds > 15 && Math.random() < 0.3) type = 'dash';
        if (gameState.totalSeconds > 30 && Math.random() < 0.2) type = 'manager';
        gameState.employees.push(new Employee(type));
    }

    for (let i = gameState.employees.length - 1; i >= 0; i--) {
        const emp = gameState.employees[i];
        emp.update();

        if (!emp.isStamped && emp.y - emp.radius < 50) {
            gameState.escapedCount++;
            document.getElementById('escaped-count').innerText = gameState.escapedCount;
            gameState.employees.splice(i, 1);
            if (gameState.escapedCount >= 5) {
                endGame(false);
            }
            continue;
        }

        // 体当たり（決裁）判定
        if (typeof Physics !== 'undefined' && !emp.isStamped && Physics.checkCircleCollision(gameState.boss, emp)) {
            // 反射させる（爽快感のため少しだけ）
            const dx = gameState.boss.x - emp.x;
            const dy = gameState.boss.y - emp.y;
            const angle = Math.atan2(dy, dx);
            gameState.boss.vx += Math.cos(angle) * 2;
            gameState.boss.vy += Math.sin(angle) * 2;

            emp.hp--;
            if (emp.hp <= 0) {
                emp.isStamped = true;
                gameState.stampedCount++;
                gameState.currentCombo++;
                document.getElementById('stamped-count').innerText = gameState.stampedCount;
                
                if(audio) audio.playStamp(gameState.currentCombo);
                shakeScreen(5 + Math.min(gameState.currentCombo, 10), 10); // コンボで揺れが激しくなる
                spawnParticles(emp.x, emp.y, 15); // 紙吹雪が飛ぶ

                setTimeout(() => {
                    if (gameState.running) {
                        gameState.employees = gameState.employees.filter(e => e !== emp);
                    }
                }, 600);
            } else {
                if(audio) audio.playBounce(); // 硬い敵に弾かれた音
            }
        }
    }

    // パーティクルの更新
    for (let i = gameState.particles.length - 1; i >= 0; i--) {
        const p = gameState.particles[i];
        p.update();
        if (p.life <= 0) gameState.particles.splice(i, 1);
    }

    const elapsed = Math.floor((Date.now() - gameState.startTime) / 1000);
    if (elapsed !== gameState.totalSeconds) {
        gameState.totalSeconds = elapsed;
        const currentMinutes = elapsed % 60;
        const padMinutes = String(currentMinutes).padStart(2, '0');
        document.getElementById('game-clock').innerText = `17:${padMinutes}`;

        if (gameState.totalSeconds >= 60) endGame(true);
    }

    if (gameState.doubleTapTimer > 0) gameState.doubleTapTimer -= 16.67;
}

function drawGame() {
    // カメラの揺れを適用
    ctx.save();
    ctx.translate(camera.x, camera.y);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, 50);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 50); ctx.lineTo(canvas.width, 50); ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('↓↓↓ 定時退社口 (エレベーター) ↓↓↓', canvas.width / 2, 32);

    gameState.desks.forEach(desk => desk.draw());
    gameState.particles.forEach(p => p.draw());
    gameState.employees.forEach(emp => emp.draw());
    if(gameState.boss) gameState.boss.draw();

    if (gameState.isDragging && gameState.boss && !gameState.boss.isMoving) {
        const dx = gameState.dragStart.x - gameState.dragCurrent.x;
        const dy = gameState.dragStart.y - gameState.dragCurrent.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 10) {
            const maxDrag = 150;
            const powerRatio = Math.min(dist / maxDrag, 1.0);
            
            ctx.save();
            ctx.lineWidth = 4;
            const endX = gameState.boss.x + (dx * 1.5);
            const endY = gameState.boss.y + (dy * 1.5);

            const r = Math.floor(255 * powerRatio);
            const g = Math.floor(255 * (1 - powerRatio));
            ctx.strokeStyle = `rgb(${r}, ${g}, 0)`;
            ctx.setLineDash([8, 6]);

            ctx.beginPath();
            ctx.moveTo(gameState.boss.x, gameState.boss.y);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            ctx.restore();
        }
    }

    ctx.restore(); // カメラ揺れリセット
}

function gameLoop() {
    updateGame();
    drawGame();
    if (gameState.running) {
        requestAnimationFrame(gameLoop);
    }
}

function setupInput() {
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const onStart = (e) => {
        if (!gameState.running || !gameState.boss || gameState.boss.isMoving) return;
        const pos = getPos(e);
        
        if (gameState.doubleTapTimer > 0) {
            if(gameState.bombCount > 0) {
                triggerBomb();
                gameState.bombCount--;
            }
            gameState.doubleTapTimer = 0;
            return;
        }
        gameState.doubleTapTimer = 250;

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

        if (dist > 15) {
            const maxDrag = 150;
            const power = Math.min(dist / maxDrag, 1.0) * 30; // 射出速度アップ！
            const angle = Math.atan2(dy, dx);

            gameState.boss.vx = Math.cos(angle) * power;
            gameState.boss.vy = Math.sin(angle) * power;
            gameState.boss.isMoving = true;

            if(audio) audio.playShoot(); // 射出音
        }
    };

    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onStart(e); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); onMove(e); }, { passive: false });
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); onEnd(); }, { passive: false });
    canvas.addEventListener('mousedown', onStart);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
}

function triggerBomb() {
    if(audio) audio.playBomb();
    shakeScreen(20, 20); // 大揺れ
    
    gameState.employees.forEach(emp => {
        if (!emp.isStamped) {
            emp.isStamped = true;
            gameState.stampedCount++;
            document.getElementById('stamped-count').innerText = gameState.stampedCount;
            spawnParticles(emp.x, emp.y, 20);
        }
    });

    const originalBg = canvas.style.backgroundColor;
    canvas.style.backgroundColor = '#ffffff';
    setTimeout(() => { canvas.style.backgroundColor = originalBg; }, 100);
}

function startGame() {
    if(typeof audio !== 'undefined') {
        audio.unlock();
        audio.playBGM();
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

initStage();
drawGame();

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('result-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
});