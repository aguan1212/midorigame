// Matter.js aliases
const { Engine, Render, Runner, World, Bodies, Body, Events, Composite } = Matter;

// Game Config
const GAME_WIDTH = 360;
const GAME_HEIGHT = 600;

// Physics Config
const WALL_THICKNESS = 100;
const BOTTOM_OFFSET = 20;
const WARNING_Y = 100;
const SPAWN_Y = 60;
const GUIDE_COLOR = '#FF9800';

// Fruit Data
const FRUITS = [
    { name: 'cherry', radius: 11, score: 2, color: '#F00' },
    { name: 'strawberry', radius: 15, score: 4, color: '#F44' },
    { name: 'grape', radius: 19, score: 8, color: '#A0F' },
    { name: 'dekopon', radius: 22, score: 16, color: '#FA0' },
    { name: 'persimmon', radius: 27, score: 32, color: '#F80' },
    { name: 'apple', radius: 32, score: 64, color: '#F22' },
    { name: 'pear', radius: 37, score: 128, color: '#FF4' },
    { name: 'peach', radius: 46, score: 256, color: '#F88' },
    { name: 'pineapple', radius: 55, score: 512, color: '#FF0' },
    { name: 'melon', radius: 65, score: 1024, color: '#AF0' },
    { name: 'watermelon', radius: 75, score: 2048, color: '#0F0' }
];

class GameManager {
    constructor() {
        this.score = 0;
        this.highScore = Number(localStorage.getItem('suika_highscore')) || 0;
        this.queue = [];
        this.isPlaying = false;
        this.canDrop = true;
        this.isDragging = false;
        this.currentIdx = 0;
        this.mouseX = GAME_WIDTH / 2;
        this.images = {};

        // Combo/Kiriban State
        this.mergeCount = 0;
        this.lastScore = 0;

        // Debounce State
        this.isVideoPlaying = false;

        // Preload Images
        FRUITS.forEach((f, i) => {
            const img = new Image();
            img.src = `./images/${i}.png`;
            this.images[i] = img;
        });

        this.initDOM();
        this.initPhysics();
        this.initEvents();
    }

    initDOM() {
        this.ui = {
            score: document.getElementById('current-score'),
            best: document.getElementById('best-score'),
            next0: document.getElementById('next-0'),
            next1: document.getElementById('next-1'),
            next2: document.getElementById('next-2'),
            start: document.getElementById('start-screen'),
            result: document.getElementById('result-area'),
            final: document.getElementById('final-score'),
            warning: document.getElementById('warning-line')
        };

        this.ui.best.textContent = this.highScore;
        this.ui.warning.style.top = `${WARNING_Y}px`;

        document.getElementById('start-btn').onclick = () => this.startGame();
        document.getElementById('share-btn').onclick = () => this.share();

        // Audio
        this.bgm = new Audio('sounds/bgm.mp3');
        this.bgm.loop = true;
        this.bgm.volume = 0.5;
        this.bgmPlaying = true;
        document.getElementById('bgm-toggle').onclick = (e) => {
            if (this.bgmPlaying) { this.bgm.pause(); e.target.textContent = '🔇'; }
            else { this.bgm.play().catch(() => { }); e.target.textContent = '🔊'; }
            this.bgmPlaying = !this.bgmPlaying;
        };

        // Video Elements
        this.videoLayer = document.getElementById('video-layer');
        this.loopVideo = document.getElementById('loop-video');
        this.triggerVideo = document.getElementById('trigger-video');
        this.skipBtn = document.getElementById('skip-video-btn');

        this.skipBtn.onclick = () => {
            this.stopTriggerVideo();
        };

        this.triggerVideo.onended = () => {
            this.stopTriggerVideo();
        };

        this.triggerVideo.onplaying = () => {
            this.triggerVideo.classList.remove('hidden');
        };
    }

    stopTriggerVideo() {
        this.triggerVideo.pause();
        this.triggerVideo.classList.add('hidden');
        this.skipBtn.classList.add('hidden');
        this.isVideoPlaying = false;
        if (this.triggerCallback) { const f = this.triggerCallback; this.triggerCallback = null; f(); }
    }

    initPhysics() {
        this.engine = Engine.create();
        this.world = this.engine.world;

        this.render = Render.create({
            element: document.getElementById('game-container'),
            engine: this.engine,
            options: {
                width: GAME_WIDTH,
                height: GAME_HEIGHT,
                wireframes: false,
                background: 'transparent',
                pixelRatio: window.devicePixelRatio || 1
            }
        });

        const groundY = (GAME_HEIGHT - BOTTOM_OFFSET) + (WALL_THICKNESS / 2);
        const ground = Bodies.rectangle(GAME_WIDTH / 2, groundY, GAME_WIDTH, WALL_THICKNESS, {
            isStatic: true, render: { visible: true, fillStyle: '#8d6e63' }
        });
        const leftWall = Bodies.rectangle(0 - WALL_THICKNESS / 2, GAME_HEIGHT / 2, WALL_THICKNESS, GAME_HEIGHT * 2, {
            isStatic: true, render: { visible: false }, friction: 0
        });
        const rightWall = Bodies.rectangle(GAME_WIDTH + WALL_THICKNESS / 2, GAME_HEIGHT / 2, WALL_THICKNESS, GAME_HEIGHT * 2, {
            isStatic: true, render: { visible: false }, friction: 0
        });

        World.add(this.world, [ground, leftWall, rightWall]);
        this.runner = Runner.create();
    }

    initEvents() {
        const canvas = this.render.canvas;

        const updatePos = (e) => {
            if (!this.isPlaying || !this.canDrop) return;
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const cx = e.touches ? e.touches[0].clientX : e.clientX;
            const scale = GAME_WIDTH / rect.width;
            let x = (cx - rect.left) * scale;
            const r = FRUITS[this.currentIdx].radius;
            if (x < r) x = r;
            if (x > GAME_WIDTH - r) x = GAME_WIDTH - r;
            this.mouseX = x;
        };

        const onStart = (e) => {
            if (!this.isPlaying || !this.canDrop) return;
            this.isDragging = true;
            updatePos(e);
        };

        const onMove = (e) => {
            if (this.isDragging) {
                updatePos(e);
            }
        };

        const onEnd = (e) => {
            if (this.isDragging) {
                this.isDragging = false;
                this.attemptDrop();
            }
        };

        canvas.addEventListener('mousedown', onStart);
        canvas.addEventListener('touchstart', onStart, { passive: false });

        canvas.addEventListener('mousemove', onMove);
        canvas.addEventListener('touchmove', onMove, { passive: false });

        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchend', onEnd);

        // Custom Rendering Loop
        Events.on(this.render, 'afterRender', () => {
            // 【修正】drawGuide は renderCustomFruits 内でまとめて呼ぶように変更
            this.renderCustomFruits();
        });

        Events.on(this.engine, 'collisionStart', (e) => this.handleCollision(e));
        Events.on(this.engine, 'beforeUpdate', () => this.updateLoop());
    }

    renderCustomFruits() {
        const ctx = this.render.context;
        ctx.save();

        // すべての描画を一新する
        ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        const bodies = Composite.allBodies(this.world);

        // 1. 地面や壁などの静止オブジェクトを描画
        bodies.forEach(body => {
            if (body.isStatic && body.render.visible) {
                ctx.beginPath();
                const vertices = body.vertices;
                ctx.moveTo(vertices[0].x, vertices[0].y);
                for (let i = 1; i < vertices.length; i++) {
                    ctx.lineTo(vertices[i].x, vertices[i].y);
                }
                ctx.closePath();
                ctx.fillStyle = body.render.fillStyle || '#8d6e63';
                ctx.fill();
            }
        });

        // 2. ガイドラインの描画 (clearRect の後に実行)
        this.drawGuide();

        // 3. フルーツの描画
        bodies.forEach(body => {
            if (body.label.startsWith('fruit')) {
                const r = body.circleRadius;
                const idx = body.fruitIndex;
                const img = this.images[idx];

                // 画像が利用可能かチェック
                const isImageReady = img && (img instanceof HTMLImageElement) && img.complete && img.naturalWidth > 0;

                ctx.save();
                ctx.translate(body.position.x, body.position.y);
                ctx.rotate(body.angle);

                if (isImageReady) {
                    ctx.beginPath();
                    ctx.arc(0, 0, r, 0, Math.PI * 2);
                    ctx.closePath();
                    ctx.clip();
                    const size = r * 2;
                    ctx.drawImage(img, -r, -r, size, size);
                } else {
                    // 画像がない場合のフォールバック（色付きの円）
                    ctx.beginPath();
                    ctx.arc(0, 0, r, 0, Math.PI * 2);
                    ctx.fillStyle = FRUITS[idx].color;
                    ctx.fill();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }

                ctx.restore();
            }
        });

        ctx.restore();
    }

    fillQueue() {
        while (this.queue.length < 4) {
            this.queue.push(Math.floor(Math.random() * 5));
        }
    }

    updateNextUI() {
        const setBg = (el, idx) => {
            el.style.backgroundImage = (idx !== undefined) ? `url(./images/${idx}.png)` : 'none';
        };
        setBg(this.ui.next0, this.queue[0]);
        setBg(this.ui.next1, this.queue[1]);
        setBg(this.ui.next2, this.queue[2]);
    }

    startGame() {
        this.isPlaying = true;
        this.score = 0;
        this.lastScore = 0;
        this.ui.score.textContent = 0;
        this.ui.start.style.display = 'none';
        this.ui.result.classList.add('hidden');
        this.deadlineTimer = 0;
        this.warningPlaying = false;
        this.isDragging = false;

        Composite.allBodies(this.world).forEach(b => {
            if (b.label.startsWith('fruit')) World.remove(this.world, b);
        });

        Render.run(this.render);
        Runner.run(this.runner, this.engine);
        if (this.bgmPlaying) this.bgm.play().catch(() => { });

        this.loopVideo.pause();
        this.loopVideo.classList.add('hidden');
        this.stopTriggerVideo();
        this.videoLayer.classList.remove('blocking');
        this.isVideoPlaying = false;

        this.queue = [];
        this.fillQueue();
        this.newRound();
    }

    newRound() {
        if (!this.isPlaying) return;
        this.currentIdx = this.queue.shift();
        this.fillQueue();
        this.updateNextUI();
        this.canDrop = true;
    }

    attemptDrop() {
        if (!this.isPlaying || !this.canDrop) return;
        this.canDrop = false;
        this.mergeCount = 0;

        const idx = this.currentIdx;
        const r = FRUITS[idx].radius;
        const x = this.mouseX;
        const y = SPAWN_Y;

        const body = Bodies.circle(x, y, r, {
            label: `fruit_${idx}`,
            restitution: 0.2, friction: 0.3,
            render: { visible: false }
        });
        body.fruitIndex = idx;
        body.circleRadius = r;

        World.add(this.world, body);
        setTimeout(() => this.newRound(), 600);
    }

    drawGuide() {
        if (!this.isPlaying || !this.canDrop) return;
        const ctx = this.render.context;
        const idx = this.currentIdx;
        const r = FRUITS[idx].radius;
        const x = this.mouseX;
        const y = SPAWN_Y;

        const img = this.images[idx];
        const isImageReady = img && (img instanceof HTMLImageElement) && img.complete && img.naturalWidth > 0;

        if (isImageReady) {
            ctx.save();
            ctx.globalAlpha = 0.6;
            ctx.translate(x, y);
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(img, -r, -r, r * 2, r * 2);
            ctx.restore();
        } else {
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = FRUITS[idx].color;
            ctx.globalAlpha = 0.6;
            ctx.fill();
            ctx.restore();
        }

        ctx.beginPath();
        ctx.moveTo(x, y + r);
        ctx.lineTo(x, GAME_HEIGHT - BOTTOM_OFFSET);
        ctx.lineWidth = 4;
        ctx.strokeStyle = GUIDE_COLOR;
        ctx.setLineDash([8, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    handleCollision(e) {
        if (!this.isPlaying) return;
        e.pairs.forEach(p => {
            const a = p.bodyA; const b = p.bodyB;
            if (a.label.startsWith('fruit') && b.label.startsWith('fruit')) {
                if (a.fruitIndex === b.fruitIndex) this.merge(a, b);
            }
        });
    }

    merge(a, b) {
        if (a.isRemoved || b.isRemoved) return;
        a.isRemoved = b.isRemoved = true;
        World.remove(this.world, [a, b]);

        const idx = a.fruitIndex;

        this.mergeCount++;
        if (this.mergeCount === 3) {
            this.playTriggerVideo('combo');
        }

        const points = FRUITS[idx].score * 2;
        this.score += points;
        this.ui.score.textContent = this.score;

        if (Math.floor(this.score / 1000) > Math.floor(this.lastScore / 1000)) {
            this.playTriggerVideo('kiriban');
        }
        this.lastScore = this.score;

        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('suika_highscore', this.score);
            this.ui.best.textContent = this.highScore;
        }

        const next = idx + 1;
        if (next < FRUITS.length) {
            const mx = (a.position.x + b.position.x) / 2;
            const my = (a.position.y + b.position.y) / 2;
            const r = FRUITS[next].radius;

            if (next === 10) {
                this.playTriggerVideo('suika');
            }

            const nb = Bodies.circle(mx, my, r, {
                label: `fruit_${next}`,
                restitution: 0.2, friction: 0.3,
                render: { visible: false }
            });
            nb.fruitIndex = next;
            nb.circleRadius = r;

            World.add(this.world, nb);
        }
    }

    updateLoop() {
        if (!this.isPlaying) return;
        let danger = false;
        Composite.allBodies(this.world).forEach(b => {
            if (b.label.startsWith('fruit') && !b.isStatic && !b.isSleeping) {
                if (b.position.y < WARNING_Y && Math.abs(b.velocity.y) < 0.5) {
                    danger = true;
                }
            }
        });

        if (danger) {
            this.deadlineTimer += 16.6;
            this.ui.warning.querySelector('span').style.display = 'block';

            if (!this.warningPlaying) {
                this.loopVideo.src = 'videos/warning.mp4';
                this.loopVideo.play().catch(() => { });
                this.loopVideo.classList.remove('hidden');
                this.warningPlaying = true;
            }

            if (this.deadlineTimer > 2000) this.gameOver();
        } else {
            this.deadlineTimer = 0;
            this.ui.warning.querySelector('span').style.display = 'none';

            if (this.warningPlaying) {
                this.loopVideo.pause();
                this.loopVideo.classList.add('hidden');
                this.warningPlaying = false;
            }
        }
    }

    gameOver() {
        this.isPlaying = false;
        Runner.stop(this.runner);

        this.loopVideo.pause();
        this.loopVideo.classList.add('hidden');

        this.videoLayer.classList.add('blocking');
        this.isVideoPlaying = false;
        this.playTriggerVideo('gameover', () => {
            this.videoLayer.classList.remove('blocking');
            this.ui.start.style.display = 'flex';
            this.ui.result.classList.remove('hidden');
            this.ui.final.textContent = this.score;
        });
    }

    share() {
        const t = `Score: ${this.score} - ミドリゲーム`;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}`, '_blank');
    }

    playTriggerVideo(name, callback) {
        if (this.isVideoPlaying && name !== 'gameover') {
            if (callback) callback();
            return;
        }

        this.isVideoPlaying = true;
        this.triggerCallback = callback;

        this.triggerVideo.classList.add('hidden');
        this.triggerVideo.src = `videos/${name}.mp4`;
        this.triggerVideo.currentTime = 0;

        if (name === 'gameover') {
            this.skipBtn.classList.remove('hidden');
        } else {
            this.skipBtn.classList.add('hidden');
        }

        this.triggerVideo.play().catch(() => {
            this.stopTriggerVideo();
        });
    }
}

window.onload = () => new GameManager();
