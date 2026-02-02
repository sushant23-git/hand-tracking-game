/**
 * 🚀 ASTEROID DESTROYER - Finger Control Game
 * Use your finger tracked via webcam to destroy asteroids!
 * Powered by MediaPipe Hands
 */

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    // Game settings
    initialLives: 3,
    baseAsteroidSpeed: 1.5,
    asteroidSpawnInterval: 2000,
    minSpawnInterval: 500,
    difficultyRampTime: 30000,
    cursorRadius: 60,
    comboTimeout: 2000,

    // Visual settings
    particleCount: 20,
    trailLength: 15,

    // Hand tracking
    fingerSmoothing: 0.3
};

// ============================================
// GAME STATE
// ============================================
const state = {
    isPlaying: false,
    score: 0,
    highScore: parseInt(localStorage.getItem('asteroidHighScore')) || 0,
    lives: CONFIG.initialLives,
    combo: 1,
    lastDestroyTime: 0,
    fingerPosition: { x: 0, y: 0, detected: false },
    positionHistory: [],
    asteroids: [],
    particles: [],
    screenShake: { x: 0, y: 0, intensity: 0 },
    gameTime: 0,
    lastSpawnTime: 0,
    handsReady: false,
    debugMode: true
};

// ============================================
// DOM ELEMENTS
// ============================================
const elements = {
    gameCanvas: document.getElementById('gameCanvas'),
    webcamVideo: document.getElementById('webcamVideo'),
    trackingCanvas: document.getElementById('trackingCanvas'),
    startScreen: document.getElementById('startScreen'),
    gameOverScreen: document.getElementById('gameOverScreen'),
    cameraErrorScreen: document.getElementById('cameraErrorScreen'),
    scoreDisplay: document.getElementById('scoreDisplay'),
    comboDisplay: document.getElementById('comboDisplay'),
    highScoreDisplay: document.getElementById('highScoreDisplay'),
    livesPanel: document.getElementById('livesPanel'),
    finalScore: document.getElementById('finalScore'),
    newHighScore: document.getElementById('newHighScore'),
    startBtn: document.getElementById('startBtn'),
    restartBtn: document.getElementById('restartBtn'),
    retryBtn: document.getElementById('retryBtn'),
    starsContainer: document.getElementById('starsContainer'),
    webcamContainer: document.getElementById('webcamContainer'),
    loadingHint: document.getElementById('loadingHint')
};

// Canvas contexts
const gameCtx = elements.gameCanvas.getContext('2d');
const trackingCtx = elements.trackingCanvas.getContext('2d');

// ============================================
// INITIALIZATION
// ============================================
function init() {
    console.log('🚀 Asteroid Destroyer initializing...');
    resizeCanvas();
    createStars();
    updateHighScoreDisplay();
    setupEventListeners();

    // Hide webcam container initially
    elements.webcamContainer.style.display = 'none';
}

function resizeCanvas() {
    elements.gameCanvas.width = window.innerWidth;
    elements.gameCanvas.height = window.innerHeight;
    elements.trackingCanvas.width = 320;
    elements.trackingCanvas.height = 240;
}

function createStars() {
    const container = elements.starsContainer;
    container.innerHTML = '';
    const starCount = 150;

    for (let i = 0; i < starCount; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.left = `${Math.random() * 100}%`;
        star.style.top = `${Math.random() * 100}%`;
        star.style.setProperty('--opacity', Math.random() * 0.7 + 0.3);
        star.style.setProperty('--duration', `${Math.random() * 3 + 2}s`);
        container.appendChild(star);
    }
}

function setupEventListeners() {
    window.addEventListener('resize', resizeCanvas);

    elements.startBtn.addEventListener('click', startGame);
    elements.restartBtn.addEventListener('click', startGame);
    elements.retryBtn.addEventListener('click', () => {
        elements.cameraErrorScreen.classList.add('hidden');
        elements.startScreen.classList.remove('hidden');
    });
}

// ============================================
// WEBCAM & HAND TRACKING
// ============================================
async function initWebcam() {
    console.log('📷 Initializing webcam...');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            }
        });

        elements.webcamVideo.srcObject = stream;
        elements.webcamContainer.style.display = 'block';

        await new Promise((resolve, reject) => {
            elements.webcamVideo.onloadedmetadata = () => {
                console.log('✅ Webcam metadata loaded');
                elements.webcamVideo.play();
                resolve();
            };
            elements.webcamVideo.onerror = reject;
        });

        console.log('✅ Webcam ready, video dimensions:',
            elements.webcamVideo.videoWidth, 'x', elements.webcamVideo.videoHeight);

        return true;
    } catch (err) {
        console.error('❌ Webcam error:', err);
        return false;
    }
}

async function initHandTracking() {
    console.log('🖐️ Initializing MediaPipe Hands...');

    if (elements.loadingHint) {
        elements.loadingHint.style.display = 'block';
    }

    try {
        // Check if Hands is available
        if (typeof Hands === 'undefined') {
            console.error('❌ MediaPipe Hands not loaded!');
            throw new Error('MediaPipe Hands not loaded');
        }

        const hands = new Hands({
            locateFile: (file) => {
                console.log('📦 Loading MediaPipe file:', file);
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 0, // Use simpler model for faster loading
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        hands.onResults((results) => {
            onHandResults(results);
        });

        // Initialize camera
        if (typeof Camera === 'undefined') {
            console.error('❌ Camera utils not loaded!');
            throw new Error('Camera utils not loaded');
        }

        const camera = new Camera(elements.webcamVideo, {
            onFrame: async () => {
                if (state.handsReady) {
                    await hands.send({ image: elements.webcamVideo });
                }
            },
            width: 640,
            height: 480
        });

        await camera.start();
        state.handsReady = true;

        console.log('✅ Hand tracking ready!');

        if (elements.loadingHint) {
            elements.loadingHint.style.display = 'none';
        }

        return true;
    } catch (err) {
        console.error('❌ Hand tracking error:', err);

        if (elements.loadingHint) {
            elements.loadingHint.textContent = '⚠️ Hand tracking failed. Using fallback mode...';
        }

        // Start fallback tracking loop
        startFallbackTracking();
        return true; // Continue with fallback
    }
}

// Fallback: Simple skin color detection
function startFallbackTracking() {
    console.log('🔄 Using fallback skin color tracking...');
    state.handsReady = true;

    function trackLoop() {
        if (!state.isPlaying) return;

        trackSkinColor();
        requestAnimationFrame(trackLoop);
    }

    requestAnimationFrame(trackLoop);
}

function trackSkinColor() {
    const video = elements.webcamVideo;
    const canvas = elements.trackingCanvas;
    const ctx = trackingCtx;

    if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

    // Draw video frame (mirrored)
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Find skin-colored pixels
    let sumX = 0, sumY = 0, count = 0;

    for (let y = 0; y < canvas.height; y += 2) { // Skip pixels for speed
        for (let x = 0; x < canvas.width; x += 2) {
            const i = (y * canvas.width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Simple skin color detection in RGB
            if (isSkinColor(r, g, b)) {
                sumX += x;
                sumY += y;
                count++;

                // Highlight detected pixels
                data[i] = 255;
                data[i + 1] = 0;
                data[i + 2] = 255;
            }
        }
    }

    // Update tracking canvas
    ctx.putImageData(imageData, 0, 0);

    // Calculate position
    if (count > 50) {
        const centerX = sumX / count;
        const centerY = sumY / count;

        // Map to game canvas
        const gameX = (centerX / canvas.width) * elements.gameCanvas.width;
        const gameY = (centerY / canvas.height) * elements.gameCanvas.height;

        // Smooth position
        if (state.fingerPosition.detected) {
            state.fingerPosition.x = lerp(state.fingerPosition.x, gameX, CONFIG.fingerSmoothing);
            state.fingerPosition.y = lerp(state.fingerPosition.y, gameY, CONFIG.fingerSmoothing);
        } else {
            state.fingerPosition.x = gameX;
            state.fingerPosition.y = gameY;
        }
        state.fingerPosition.detected = true;

        // Add to trail
        state.positionHistory.push({ x: state.fingerPosition.x, y: state.fingerPosition.y });
        if (state.positionHistory.length > CONFIG.trailLength) {
            state.positionHistory.shift();
        }

        // Draw detection marker
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 20, 0, Math.PI * 2);
        ctx.stroke();
    } else {
        state.fingerPosition.detected = false;
    }
}

function isSkinColor(r, g, b) {
    // Multiple skin color detection rules
    // Rule 1: RGB ratio based
    const rule1 = r > 95 && g > 40 && b > 20 &&
        r > g && r > b &&
        Math.abs(r - g) > 15 &&
        r - b > 15;

    // Rule 2: Normalized RGB
    const sum = r + g + b;
    if (sum === 0) return false;
    const nr = r / sum;
    const ng = g / sum;
    const rule2 = nr > 0.35 && nr < 0.6 && ng > 0.25 && ng < 0.4;

    return rule1 || rule2;
}

function onHandResults(results) {
    const ctx = trackingCtx;
    const canvas = elements.trackingCanvas;

    // Draw video frame (mirrored)
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(elements.webcamVideo, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];

        // Draw hand skeleton
        drawHandSkeleton(ctx, landmarks, canvas);

        // Get index finger tip (landmark 8)
        const indexTip = landmarks[8];

        // Map to game canvas (mirrored)
        const gameX = (1 - indexTip.x) * elements.gameCanvas.width;
        const gameY = indexTip.y * elements.gameCanvas.height;

        // Smooth position
        if (state.fingerPosition.detected) {
            state.fingerPosition.x = lerp(state.fingerPosition.x, gameX, CONFIG.fingerSmoothing);
            state.fingerPosition.y = lerp(state.fingerPosition.y, gameY, CONFIG.fingerSmoothing);
        } else {
            state.fingerPosition.x = gameX;
            state.fingerPosition.y = gameY;
        }
        state.fingerPosition.detected = true;

        // Add to position history for trail
        state.positionHistory.push({ x: state.fingerPosition.x, y: state.fingerPosition.y });
        if (state.positionHistory.length > CONFIG.trailLength) {
            state.positionHistory.shift();
        }

        if (state.debugMode) {
            console.log('👆 Finger detected at:', Math.round(gameX), Math.round(gameY));
        }
    } else {
        state.fingerPosition.detected = false;
        if (state.debugMode && Math.random() < 0.01) {
            console.log('❌ No hand detected');
        }
    }
}

function drawHandSkeleton(ctx, landmarks, canvas) {
    // Connection pairs for hand skeleton
    const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [0, 9], [9, 10], [10, 11], [11, 12],
        [0, 13], [13, 14], [14, 15], [15, 16],
        [0, 17], [17, 18], [18, 19], [19, 20],
        [5, 9], [9, 13], [13, 17]
    ];

    // Draw connections
    ctx.strokeStyle = 'rgba(0, 245, 255, 0.8)';
    ctx.lineWidth = 2;

    connections.forEach(([i, j]) => {
        const start = landmarks[i];
        const end = landmarks[j];
        ctx.beginPath();
        ctx.moveTo((1 - start.x) * canvas.width, start.y * canvas.height);
        ctx.lineTo((1 - end.x) * canvas.width, end.y * canvas.height);
        ctx.stroke();
    });

    // Draw landmarks
    landmarks.forEach((landmark, i) => {
        const x = (1 - landmark.x) * canvas.width;
        const y = landmark.y * canvas.height;

        // Highlight index finger tip (landmark 8)
        if (i === 8) {
            ctx.fillStyle = '#ff00ff';
            ctx.shadowColor = '#ff00ff';
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(x, y, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Add label
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px Arial';
            ctx.fillText('INDEX', x + 15, y);
        } else {
            ctx.fillStyle = '#00f5ff';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

// ============================================
// ASTEROID MANAGEMENT
// ============================================
function spawnAsteroid() {
    const canvas = elements.gameCanvas;
    const side = Math.floor(Math.random() * 4);
    let x, y;

    switch (side) {
        case 0: x = Math.random() * canvas.width; y = -50; break;
        case 1: x = canvas.width + 50; y = Math.random() * canvas.height; break;
        case 2: x = Math.random() * canvas.width; y = canvas.height + 50; break;
        case 3: x = -50; y = Math.random() * canvas.height; break;
    }

    const centerX = canvas.width / 2 + (Math.random() - 0.5) * 200;
    const centerY = canvas.height / 2 + (Math.random() - 0.5) * 200;
    const dx = centerX - x;
    const dy = centerY - y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const difficultyMultiplier = Math.min(2, 1 + state.gameTime / CONFIG.difficultyRampTime);
    const speed = CONFIG.baseAsteroidSpeed * difficultyMultiplier * (0.8 + Math.random() * 0.4);

    state.asteroids.push({
        x, y,
        vx: (dx / dist) * speed,
        vy: (dy / dist) * speed,
        radius: 30 + Math.random() * 30,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.05,
        vertices: generateAsteroidShape(),
        hue: 20 + Math.random() * 20
    });
}

function generateAsteroidShape() {
    const vertices = [];
    const numVertices = 8 + Math.floor(Math.random() * 5);

    for (let i = 0; i < numVertices; i++) {
        const angle = (i / numVertices) * Math.PI * 2;
        const radius = 0.7 + Math.random() * 0.3;
        vertices.push({ angle, radius });
    }

    return vertices;
}

function updateAsteroids(deltaTime) {
    const canvas = elements.gameCanvas;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    for (let i = state.asteroids.length - 1; i >= 0; i--) {
        const asteroid = state.asteroids[i];

        asteroid.x += asteroid.vx;
        asteroid.y += asteroid.vy;
        asteroid.rotation += asteroid.rotationSpeed;

        // Check collision with finger cursor
        if (state.fingerPosition.detected) {
            const dx = asteroid.x - state.fingerPosition.x;
            const dy = asteroid.y - state.fingerPosition.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < asteroid.radius + CONFIG.cursorRadius) {
                createExplosion(asteroid.x, asteroid.y, asteroid.radius);
                state.asteroids.splice(i, 1);

                const now = Date.now();
                if (now - state.lastDestroyTime < CONFIG.comboTimeout) {
                    state.combo = Math.min(10, state.combo + 1);
                } else {
                    state.combo = 1;
                }
                state.lastDestroyTime = now;

                const points = Math.round(10 * state.combo * (asteroid.radius / 30));
                state.score += points;
                updateScoreDisplay();

                state.screenShake.intensity = 10;
                continue;
            }
        }

        const distToCenter = Math.sqrt(
            Math.pow(asteroid.x - centerX, 2) +
            Math.pow(asteroid.y - centerY, 2)
        );

        if (distToCenter < 50) {
            state.asteroids.splice(i, 1);
            loseLife();
            state.screenShake.intensity = 20;
        }
    }
}

// ============================================
// PARTICLE EFFECTS
// ============================================
function createExplosion(x, y, size) {
    const particleCount = Math.floor(CONFIG.particleCount * (size / 30));

    for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 5;
        const hue = Math.random() * 60 + 10;

        state.particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: 3 + Math.random() * 5,
            life: 1,
            decay: 0.02 + Math.random() * 0.02,
            hue
        });
    }
}

function updateParticles() {
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];

        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.life -= p.decay;
        p.radius *= 0.97;

        if (p.life <= 0 || p.radius < 0.5) {
            state.particles.splice(i, 1);
        }
    }
}

// ============================================
// RENDERING
// ============================================
function render() {
    const ctx = gameCtx;
    const canvas = elements.gameCanvas;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    if (state.screenShake.intensity > 0) {
        const shakeX = (Math.random() - 0.5) * state.screenShake.intensity;
        const shakeY = (Math.random() - 0.5) * state.screenShake.intensity;
        ctx.translate(shakeX, shakeY);
        state.screenShake.intensity *= 0.9;
    }

    drawCenterZone(ctx, canvas);
    drawAsteroids(ctx);
    drawParticles(ctx);

    if (state.fingerPosition.detected) {
        drawFingerCursor(ctx);
    } else {
        // Draw "No hand detected" message
        drawNoHandMessage(ctx, canvas);
    }

    ctx.restore();
}

function drawNoHandMessage(ctx, canvas) {
    ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
    ctx.font = 'bold 24px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('👆 Show your hand to the camera!', canvas.width / 2, 100);
}

function drawCenterZone(ctx, canvas) {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const pulse = Math.sin(Date.now() / 500) * 0.2 + 0.8;

    ctx.strokeStyle = `rgba(255, 100, 100, ${0.3 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 60, 0, Math.PI * 2);
    ctx.stroke();

    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 50);
    gradient.addColorStop(0, `rgba(255, 50, 50, ${0.3 * pulse})`);
    gradient.addColorStop(1, 'rgba(255, 50, 50, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 50, 0, Math.PI * 2);
    ctx.fill();
}

function drawAsteroids(ctx) {
    state.asteroids.forEach(asteroid => {
        ctx.save();
        ctx.translate(asteroid.x, asteroid.y);
        ctx.rotate(asteroid.rotation);

        ctx.beginPath();
        asteroid.vertices.forEach((v, i) => {
            const r = asteroid.radius * v.radius;
            const x = Math.cos(v.angle) * r;
            const y = Math.sin(v.angle) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();

        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, asteroid.radius);
        gradient.addColorStop(0, `hsl(${asteroid.hue}, 50%, 40%)`);
        gradient.addColorStop(1, `hsl(${asteroid.hue}, 60%, 20%)`);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.strokeStyle = `hsl(${asteroid.hue}, 40%, 60%)`;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    });
}

function drawParticles(ctx) {
    state.particles.forEach(p => {
        ctx.fillStyle = `hsla(${p.hue}, 100%, 60%, ${p.life})`;
        ctx.shadowColor = `hsl(${p.hue}, 100%, 50%)`;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.shadowBlur = 0;
}

function drawFingerCursor(ctx) {
    const { x, y } = state.fingerPosition;

    // Draw trail
    ctx.shadowBlur = 20;
    state.positionHistory.forEach((pos, i) => {
        const alpha = (i / state.positionHistory.length) * 0.5;
        const radius = CONFIG.cursorRadius * (i / state.positionHistory.length) * 0.5;

        ctx.fillStyle = `rgba(255, 0, 255, ${alpha})`;
        ctx.shadowColor = 'rgba(255, 0, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
    });

    // Main cursor
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, CONFIG.cursorRadius);
    gradient.addColorStop(0, 'rgba(255, 0, 255, 0.8)');
    gradient.addColorStop(0.5, 'rgba(255, 0, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(255, 0, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.shadowColor = '#ff00ff';
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(x, y, CONFIG.cursorRadius, 0, Math.PI * 2);
    ctx.fill();

    // Inner ring
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, CONFIG.cursorRadius * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    // Finger icon
    ctx.fillStyle = '#ffffff';
    ctx.font = '28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👆', x, y);

    ctx.shadowBlur = 0;
}

// ============================================
// GAME LOGIC
// ============================================
async function startGame() {
    console.log('🎮 Starting game...');

    elements.startScreen.classList.add('hidden');
    elements.gameOverScreen.classList.add('hidden');

    // Show loading
    if (elements.loadingHint) {
        elements.loadingHint.style.display = 'block';
        elements.loadingHint.textContent = '⏳ Initializing camera...';
    }

    const webcamReady = await initWebcam();

    if (!webcamReady) {
        elements.cameraErrorScreen.classList.remove('hidden');
        return;
    }

    if (elements.loadingHint) {
        elements.loadingHint.textContent = '⏳ Loading hand tracking...';
    }

    await initHandTracking();

    // Reset game state
    state.isPlaying = true;
    state.score = 0;
    state.lives = CONFIG.initialLives;
    state.combo = 1;
    state.asteroids = [];
    state.particles = [];
    state.gameTime = 0;
    state.lastSpawnTime = 0;
    state.fingerPosition = { x: 0, y: 0, detected: false };
    state.positionHistory = [];
    state.debugMode = false; // Disable debug after first confirmation

    updateLivesDisplay();
    updateScoreDisplay();

    console.log('✅ Game started!');

    // Start game loop
    lastFrameTime = performance.now();
    requestAnimationFrame(gameLoop);
}

let lastFrameTime = 0;

function gameLoop(currentTime) {
    if (!state.isPlaying) return;

    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;

    state.gameTime += deltaTime;

    // Spawn asteroids
    const spawnInterval = Math.max(
        CONFIG.minSpawnInterval,
        CONFIG.asteroidSpawnInterval - state.gameTime / 100
    );

    if (currentTime - state.lastSpawnTime > spawnInterval) {
        spawnAsteroid();
        state.lastSpawnTime = currentTime;
    }

    updateAsteroids(deltaTime);
    updateParticles();

    // Check combo timeout
    if (Date.now() - state.lastDestroyTime > CONFIG.comboTimeout && state.combo > 1) {
        state.combo = 1;
        updateScoreDisplay();
    }

    render();
    requestAnimationFrame(gameLoop);
}

function loseLife() {
    state.lives--;
    updateLivesDisplay();

    if (state.lives <= 0) {
        gameOver();
    }
}

function gameOver() {
    state.isPlaying = false;

    if (state.score > state.highScore) {
        state.highScore = state.score;
        localStorage.setItem('asteroidHighScore', state.highScore);
        elements.newHighScore.classList.remove('hidden');
    } else {
        elements.newHighScore.classList.add('hidden');
    }

    elements.finalScore.textContent = state.score.toLocaleString();
    updateHighScoreDisplay();

    setTimeout(() => {
        elements.gameOverScreen.classList.remove('hidden');
    }, 500);
}

// ============================================
// UI UPDATES
// ============================================
function updateScoreDisplay() {
    elements.scoreDisplay.textContent = state.score.toLocaleString();
    elements.comboDisplay.textContent = `x${state.combo}`;

    elements.scoreDisplay.style.transform = 'scale(1.2)';
    setTimeout(() => {
        elements.scoreDisplay.style.transform = 'scale(1)';
    }, 100);
}

function updateHighScoreDisplay() {
    elements.highScoreDisplay.textContent = state.highScore.toLocaleString();
}

function updateLivesDisplay() {
    const hearts = elements.livesPanel.querySelectorAll('.lives-icon');
    hearts.forEach((heart, i) => {
        if (i >= state.lives) {
            heart.classList.add('lost');
        } else {
            heart.classList.remove('lost');
        }
    });
}

// ============================================
// START
// ============================================
init();

// Log helpful debug info
console.log('📋 Debug info:');
console.log('  - Hands available:', typeof Hands !== 'undefined');
console.log('  - Camera available:', typeof Camera !== 'undefined');
