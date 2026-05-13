let phaserGame;
let score = 0;

const WAVE_CONFIG = [
    { round: 1, duration: 10000, spawnDelay: 1000, enemyMax: 8 },
    { round: 2, duration: 15000, spawnDelay: 800, enemyMax: 15 },
    { round: 3, duration: 20000, spawnDelay: 500, enemyMax: 30 }
];

class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    preload() {
        this.load.audio('ambience', 'ambience.mp3');
        this.load.audio('sword', 'sword.mp3');
        this.load.audio('hit', 'hit.mp3');
        this.load.audio('lose', 'lose.mp3');
    }

    create() {
        const { width, height } = this.scale;
        
        // --- Systems Setup ---
        this.sound.play('ambience', { volume: 0.7, loop: true });
        this.enemies = this.physics.add.group();
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys('W,A,S,D');

        // --- State Trackers ---
        this.currentRoundIndex = 0;
        this.isRoundActive = false;      // True while timer is running
        this.isWaitingForClear = false;  // True after timer ends, waiting for last kill
        this.spawnTimerEvent = null;

        // --- Player Setup ---
        this.player = this.add.circle(width / 2, height / 2, 10, 0x00ff00);
        this.player.setStrokeStyle(2, 0xffffff);
        this.physics.add.existing(this.player);
        this.player.body.setCollideWorldBounds(true);
        
        this.player.hp = 5;
        this.player.maxHp = 5;
        this.player.invulnerable = false;
        this.player.reloadModifier = 1;
        this.canFire = true;
        this.currentWeapon = { range: 150, reload: 400 };

        // --- Interactions ---
        this.input.on('pointerdown', (pointer) => this.handleAttack(pointer));
        this.physics.add.overlap(this.player, this.enemies, () => this.takeDamage());

        // --- Start Game ---
        this.showRoundAnnouncement();
    }

    // --- Wave Management ---

    showRoundAnnouncement() {
        const roundNum = this.currentRoundIndex + 1;
        const text = this.add.text(this.scale.width / 2, this.scale.height / 2, 
            `ROUND ${roundNum}`, { fontSize: '64px', fill: '#00ff00', fontStyle: 'bold' }
        ).setOrigin(0.5).setDepth(100);

        this.tweens.add({
            targets: text,
            alpha: { from: 0, to: 1 },
            duration: 800,
            yoyo: true,
            hold: 1000,
            onComplete: () => {
                text.destroy();
                this.startRound(this.currentRoundIndex);
            }
        });
    }

    startRound(index) {
        const config = WAVE_CONFIG[index];
        if (!config) {
            alert("ALL WAVES CLEARED! KILLS: " + score);
            location.reload();
            return;
        }

        this.isRoundActive = true;
        this.isWaitingForClear = false;

        // Start Spawning
        this.spawnTimerEvent = this.time.addEvent({
            delay: config.spawnDelay,
            callback: this.spawnEnemy,
            callbackScope: this,
            loop: true
        });

        // Set Round Timer
        this.time.delayedCall(config.duration, () => {
            this.endSpawning();
        });
    }

    endSpawning() {
        if (this.spawnTimerEvent) this.spawnTimerEvent.destroy();
        this.isRoundActive = false;
        this.isWaitingForClear = true; // Now we wait for enemies to reach 0
    }

    // --- Core Loops ---

    update() {
        if (!this.player || this.player.hp <= 0) return;

        // Movement
        const speed = 200;
        this.player.body.setVelocity(0);
        if (this.keys.A.isDown || this.cursors.left.isDown) this.player.body.setVelocityX(-speed);
        if (this.keys.D.isDown || this.cursors.right.isDown) this.player.body.setVelocityX(speed);
        if (this.keys.W.isDown || this.cursors.up.isDown) this.player.body.setVelocityY(-speed);
        if (this.keys.S.isDown || this.cursors.down.isDown) this.player.body.setVelocityY(speed);

        // Enemy AI
        this.enemies.getChildren().forEach(enemy => {
            this.physics.moveToObject(enemy, this.player, 120);
        });

        // Check for Round Clear (Isaac Style)
        if (this.isWaitingForClear && this.enemies.countActive() === 0) {
            this.isWaitingForClear = false;
            this.triggerLevelUp();
        }

        // Reload Bar Position
        this.updateReloadBarPosition();
    }

    spawnEnemy() {
        const config = WAVE_CONFIG[this.currentRoundIndex];
        if (this.enemies.countActive() < config.enemyMax) {
            const spawnAngle = Math.random() * Math.PI * 2;
            const x = this.player.x + Math.cos(spawnAngle) * 400;
            const y = this.player.y + Math.sin(spawnAngle) * 400;
            
            const enemy = this.add.circle(x, y, 8, 0xff0033);
            this.enemies.add(enemy);
            this.physics.add.existing(enemy);
        }
    }

    // --- Combat & Feedback ---

    handleAttack(pointer) {
        if (!this.canFire) return;
        this.canFire = false;

        const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
        this.sound.play('sword', { volume: 0.4, rate: 1.2 });

        // Slash Visual
        const slash = this.add.graphics().setDepth(6);
        slash.fillStyle(0xffffff, 1);
        slash.beginPath();
        slash.arc(this.player.x, this.player.y, this.currentWeapon.range, angle - 0.8, angle + 0.8);
        slash.arc(this.player.x, this.player.y, this.currentWeapon.range - 25, angle + 0.8, angle - 0.8, true);
        slash.closePath();
        slash.fillPath();

        // Hit Detection
        this.enemies.getChildren().forEach(enemy => {
            if (!enemy) return;
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            const angleToEnemy = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            const diff = Math.abs(Phaser.Math.Angle.Wrap(angle - angleToEnemy));

            if (dist < this.currentWeapon.range + 15 && diff < 0.9) {
                this.createDeathEffect(enemy.x, enemy.y);
                enemy.destroy();
                score++;
                document.getElementById('killCount').innerText = score;
            }
        });

        // Animation & Reload
        this.tweens.add({ targets: slash, alpha: 0, duration: 200, onComplete: () => slash.destroy() });
        this.cameras.main.shake(50, 0.002);
        this.handleReloadUI();
    }

    createDeathEffect(x, y) {
        const pulse = this.add.circle(x, y, 15, 0xffffff);
        this.tweens.add({ targets: pulse, alpha: 0, scale: 2, duration: 100, onComplete: () => pulse.destroy() });
    }

    handleReloadUI() {
        const reloadTime = this.currentWeapon.reload * this.player.reloadModifier;
        const barContainer = document.getElementById('reload-bar-container');
        const barFill = document.getElementById('reload-bar-fill');

        barContainer.classList.remove('hidden');
        barFill.style.transition = 'none';
        barFill.style.transform = 'scaleX(1)';
        barFill.offsetHeight; 
        barFill.style.transition = `transform ${reloadTime}ms linear`;
        barFill.style.transform = 'scaleX(0)';

        this.time.delayedCall(reloadTime, () => {
            this.canFire = true;
            barContainer.classList.add('hidden');
        });
    }

    updateReloadBarPosition() {
        const barContainer = document.getElementById('reload-bar-container');
        if (!barContainer.classList.contains('hidden')) {
            const cam = this.cameras.main;
            const x = (this.player.x - cam.scrollX) * cam.zoom;
            const y = (this.player.y - cam.scrollY) * cam.zoom;
            barContainer.style.left = `${x - 20}px`;
            barContainer.style.top = `${y + 30}px`;
        }
    }

    takeDamage() {
        if (this.player.invulnerable) return;
        this.player.hp--;
        this.player.invulnerable = true;
        this.sound.play('hit', { volume: 0.5 });
        
        document.getElementById('health-fill').style.width = (this.player.hp / this.player.maxHp) * 100 + "%";

        this.tweens.add({
            targets: this.player, alpha: 0.2, duration: 100, yoyo: true, repeat: 3,
            onComplete: () => { this.player.invulnerable = false; this.player.alpha = 1; }
        });

        if (this.player.hp <= 0) {
            alert("DEFEATED. KILLS: " + score);
            location.reload();
        }
    }

    triggerLevelUp() {
        this.scene.pause();
        this.physics.world.pause(); // Stop all movement
        document.getElementById('levelUpScreen').classList.remove('hidden');
    }
}

// --- Bridge Functions (Outside Class) ---

function applyPowerUp(type) {
    const scene = phaserGame.scene.scenes[0];
    if (type === 'heal') {
        scene.player.hp = scene.player.maxHp;
        document.getElementById('health-fill').style.width = "100%";
    } else if (type === 'speed') {
        scene.player.reloadModifier *= 0.8;
    }
    
    // Resume Game
    document.getElementById('levelUpScreen').classList.add('hidden');
    scene.physics.world.resume();
    scene.scene.resume();
    
    // Advance Wave
    scene.currentRoundIndex++;
    scene.showRoundAnnouncement();
}

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    backgroundColor: '#050505',
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [GameScene]
};

function startGame() {
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    phaserGame = new Phaser.Game(config);
}
document.getElementById('game-container').addEventListener('contextmenu', (e) => {
    e.preventDefault();
});