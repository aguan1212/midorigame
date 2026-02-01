// Matter.js aliases
const { Engine, Render, Runner, World, Bodies, Body, Events, Composite } = Matter;

// Game Config
const GAME_WIDTH = 360;  // Compact width
const GAME_HEIGHT = 600;

// Physics Config
const WALL_THICKNESS = 100;
const BOTTOM_OFFSET = 20;
const WARNING_Y = 100;    // Deadline
const SPAWN_Y = 60;       // Spawn height
const GUIDE_COLOR = '#FF9800'; // Orange

// Fruit Data (Scaled for 360 width)
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
        this.currentIdx = 0;
        this.mouseX = GAME_WIDTH / 2;
        this.images = {};

        // Preload
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

        // Video
        this.videoEl = document.getElementById('popup-video');
        this.videoOver = document.getElementById('video-overlay');
        document.getElementById('skip-video-btn').onclick = () => this.stopVideo();
        this.videoEl.onended = () => this.stopVideo();
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

        // Walls
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
            if (!this.isPlaying) return;
            // e.preventDefault(); // Removed to allow scrolling if needed, or keep if game absorbs all input
            const rect = canvas.getBoundingClientRect();
            // Handle both touch and mouse
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;

            const scale = GAME_WIDTH / rect.width;
            let x = (clientX - rect.left) * scale;

            const r = FRUITS[this.currentIdx].radius;
            if (x < r) x = r;
            if (x > GAME_WIDTH - r) x = GAME_WIDTH - r;

            this.mouseX = x;
        };

        // State for dragging/aiming
        this.isAiming = false;

        const startAim = (e) => {
            if (!this.isPlaying) return;
            e.preventDefault(); // Prevent default touch actions like scroll
            this.isAiming = true;
            updatePos(e);
        };

        const moveAim = (e) => {
            if (!this.isPlaying || !this.isAiming) return;
            e.preventDefault();
            updatePos(e);
        };

        const endAim = (e) => {
            if (!this.isPlaying || !this.isAiming) return;
            e.preventDefault();
            this.isAiming = false;
            // Drop where the aim ended
            this.attemptDrop();
        };

        // Mouse Events
        canvas.addEventListener('mousedown', startAim);
        canvas.addEventListener('mousemove', moveAim);
        window.addEventListener('mouseup', (e) => {
            if (this.isAiming) endAim(e);
        });

        // Touch Events
        canvas.addEventListener('touchstart', startAim, { passive: false });
        canvas.addEventListener('touchmove', moveAim, { passive: false });
        canvas.addEventListener('touchend', endAim, { passive: false });


        Events.on(this.render, 'afterRender', () => this.drawGuide());
        Events.on(this.engine, 'collisionStart', (e) => this.handleCollision(e));
        Events.on(this.engine, 'beforeUpdate', () => this.updateLoop());
    }

    fillQueue() {
        while (this.queue.length < 4) { // Keep 4 items (1 current + 3 next)
            this.queue.push(Math.floor(Math.random() * 5));
        }
    }

    updateNextUI() {
        // Queue[0] is current held fruit.
        // Queue[1, 2, 3] are next displayed.
        // Wait, standard design: Current is separate. Next queue shows upcoming.
        // Let's say: Next 3 are in queue. Current is detached.

        // This method updates the visually displayed 3 items
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
        this.ui.score.textContent = 0;
        this.ui.start.style.display = 'none';
        this.ui.result.classList.add('hidden');
        this.deadlineTimer = 0;

        Composite.allBodies(this.world).forEach(b => {
            if (b.label.startsWith('fruit')) World.remove(this.world, b);
        });

        Render.run(this.render);
        Runner.run(this.runner, this.engine);
        if (this.bgmPlaying) this.bgm.play().catch(() => { });
        this.stopVideo();

        // Initial queue
        this.queue = [];
        this.fillQueue(); // [0,1,2,3]
        this.newRound();
    }

    updateNextUI() {
        // Queue visual update
        // We want to show a shift. Ideally, we just update the images.
        // If we want a slide animation, we need CSS classes, BUT the user asked for:
        // "Next available ball flows from right to left properly and finally creates the held ball"

        // Let's implement this by:
        // 1. Updating the preview slots [0,1,2].
        // 2. When taking a turn, we animate slot 0 moving to spawn position?
        // Or simply shifting the DOM elements?

        // Simplest robust method for "Flow from Right to Left":
        // The queue is [Next, After1, After2]
        // DOM: #next-0 (Left/Current Next), #next-1 (Middle), #next-2 (Right)

        const setBg = (el, idx) => {
            el.style.backgroundImage = (idx !== undefined) ? `url(./images/${idx}.png)` : 'none';
        };

        setBg(this.ui.next0, this.queue[0]);
        setBg(this.ui.next1, this.queue[1]);
        setBg(this.ui.next2, this.queue[2]);
    }

    newRound() {
        if (!this.isPlaying) return;

        // Animate the transition
        // 1. Create a flying clone from "Next" slot to "Spawn" position?
        // OR just shift the queue visuals.

        if (this.queue.length === 0) {
            this.fillQueue();
            this.updateNextUI();
        }

        // Delay to allow previous drop animation/logic if any
        // But here we want the "Next" ball to appear as the "Held" ball.

        const nextFruitIdx = this.queue.shift();
        this.fillQueue();

        // Animate flow: 
        // We can just update UI now.
        this.updateNextUI();

        this.currentIdx = nextFruitIdx;
        this.canDrop = true;
    }

    attemptDrop() {
        if (!this.isPlaying || !this.canDrop) return;
        this.canDrop = false;

        const idx = this.currentIdx;
        const r = FRUITS[idx].radius;
        const x = this.mouseX;
        const y = SPAWN_Y;

        const body = Bodies.circle(x, y, r, {
            label: `fruit_${idx}`,
            restitution: 0.2, friction: 0.3,
            render: { sprite: { texture: `./images/${idx}.png`, xScale: 1, yScale: 1 } }
        });
        body.fruitIndex = idx;

        // Scale
        if (this.images[idx] && this.images[idx].complete) {
            const s = (r * 2) / Math.max(this.images[idx].width, this.images[idx].height);
            body.render.sprite.xScale = s;
            body.render.sprite.yScale = s;
        }

        World.add(this.world, body);
        setTimeout(() => this.newRound(), 600);
    }

    drawGuide() {
        if (!this.isPlaying || !this.canDrop || !this.isAiming) return;
        const ctx = this.render.context;
        const idx = this.currentIdx;
        const r = FRUITS[idx].radius;
        const x = this.mouseX;
        const y = SPAWN_Y;

        // 1. Ghost
        if (this.images[idx] && this.images[idx].complete) {
            const img = this.images[idx];
            const size = r * 2;
            const s = size / Math.max(img.width, img.height);
            ctx.save();
            ctx.globalAlpha = 0.6;
            ctx.translate(x, y);
            ctx.scale(s, s);
            ctx.drawImage(img, -img.width / 2, -img.height / 2);
            ctx.restore();
        } else {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = FRUITS[idx].color;
            ctx.globalAlpha = 0.6;
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // 2. Guide Line (Thick Orange)
        ctx.beginPath();
        ctx.moveTo(x, y + r);
        ctx.lineTo(x, GAME_HEIGHT - BOTTOM_OFFSET);
        ctx.lineWidth = 4;
        ctx.strokeStyle = GUIDE_COLOR; // Orange
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
        this.score += FRUITS[idx].score * 2;
        this.ui.score.textContent = this.score;
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
            const nb = Bodies.circle(mx, my, r, {
                label: `fruit_${next}`,
                restitution: 0.2, friction: 0.3,
                render: { sprite: { texture: `./images/${next}.png` } }
            });
            nb.fruitIndex = next;
            if (this.images[next]) {
                const s = (r * 2) / Math.max(this.images[next].width, this.images[next].height);
                nb.render.sprite.xScale = s;
                nb.render.sprite.yScale = s;
            }
            World.add(this.world, nb);
        }
    }

    updateLoop() {
        if (!this.isPlaying) return;
        let danger = false;
        Composite.allBodies(this.world).forEach(b => {
            if (b.label.startsWith('fruit') && !b.isStatic && !b.isSleeping) {
                // If velocity low and above line
                if (b.position.y < WARNING_Y && Math.abs(b.velocity.y) < 0.5) {
                    danger = true;
                }
            }
        });

        if (danger) {
            this.deadlineTimer += 16.6;
            this.ui.warning.querySelector('span').style.display = 'block';
            if (this.deadlineTimer > 2000) this.gameOver();
        } else {
            this.deadlineTimer = 0;
            this.ui.warning.querySelector('span').style.display = 'none'; // logic choice: hide text if safe
        }
    }

    gameOver() {
        this.isPlaying = false;
        Runner.stop(this.runner);
        this.playVideo('gameover', () => {
            this.ui.start.style.display = 'flex';
            this.ui.result.classList.remove('hidden');
            this.ui.final.textContent = this.score;
        });
    }

    share() {
        const t = `Score: ${this.score} - ミドリゲーム`;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}`, '_blank');
    }

    playVideo(n, cb) {
        if (!n) { if (cb) cb(); return; }
        this.videoCb = cb;
        this.videoOver.classList.remove('hidden');
        this.videoEl.src = `videos/${n}.mp4`;
        this.videoEl.play().catch(() => this.stopVideo());
    }
    stopVideo() {
        this.videoEl.pause();
        this.videoOver.classList.add('hidden');
        if (this.videoCb) { const f = this.videoCb; this.videoCb = null; f(); }
    }
}
window.onload = () => new GameManager();
