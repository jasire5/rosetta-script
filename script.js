let phaserGame;
let score = 0;
let hasLeveledUp = false;

class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    preload() {
        // Placeholder sounds - replace with your actual files
        this.load.audio('sword', 'sword.mp3');
        this.load.audio('hit', 'hit.mp3');
        this.load.audio('lose', 'lose.mp3');
    }

    create() {
        const { width, height } = this.scale;
        
        // 1. Player Setup (The Green Dot)
        this.player = this.add.circle(width / 2, height / 2, 10, 0x00ff00);
        this.player.setStrokeStyle(2, 0xffffff);
        this.physics.add.existing(this.player);
        this.player.body.setCollideWorldBounds(true);
        
        // Player Stats
        this.player.hp = 5;
        this.player.maxHp = 5;
        this.player.invulnerable = false;
        this.player.reloadModifier = 1;
        this.canFire = true;

        // 2. Enemy Group
        this.enemies = this.physics.add.group();

        // 3. Inputs
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys('W,A,S,D');

        // 4. Weapon Config
        this.currentWeapon = { range: 150, width: 1.2, reload: 400 };

        // 5. Interaction
        this.input.on('pointerdown', (pointer) => this.handleAttack(pointer));

        // 6. Collision: Enemy hits Player
        this.physics.add.overlap(this.player, this.enemies, (p, enemy) => {
            this.takeDamage();
        });
        
    }

    update() {
        if (!this.player || this.player.hp <= 0) return;

        // Movement Logic
        const speed = 200;
        this.player.body.setVelocity(0);

        if (this.keys.A.isDown || this.cursors.left.isDown) this.player.body.setVelocityX(-speed);
        if (this.keys.D.isDown || this.cursors.right.isDown) this.player.body.setVelocityX(speed);
        if (this.keys.W.isDown || this.cursors.up.isDown) this.player.body.setVelocityY(-speed);
        if (this.keys.S.isDown || this.cursors.down.isDown) this.player.body.setVelocityY(speed);

        // Enemy Spawning (Random chance per frame)
        if (Phaser.Math.Between(0, 100) > 97) {
            this.spawnEnemy();
        }

        // Enemy AI: Follow Player
        this.enemies.getChildren().forEach(enemy => {
            this.physics.moveToObject(enemy, this.player, 120);
        });
    }

    handleAttack(pointer) {
    if (!this.canFire) return;
    this.canFire = false;

    // 1. Direction & Sound
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
    this.sound.play('sword', { volume: 0.4, rate: 1.2 });

    // 2. Create the Sword Slash Visual
    const slash = this.add.graphics();
    slash.setDepth(6); // Above everything

    // Draw a sharp, tapered crescent blade
    const drawBlade = (alpha, scale) => {
        slash.clear();
        slash.fillStyle(0xffffff, alpha); // Core blade
        slash.lineStyle(3, 0x00ffff, alpha); // Glow edge
        
        slash.beginPath();
        // The "sharp" outer edge of the sword
        slash.arc(this.player.x, this.player.y, this.currentWeapon.range * scale, angle - 0.8, angle + 0.8);
        // The "inner" edge that tapers to points at the tips
        slash.arc(this.player.x, this.player.y, (this.currentWeapon.range - 25) * scale, angle + 0.8, angle - 0.8, true);
        slash.closePath();
        slash.fillPath();
        slash.strokePath();
    };

    drawBlade(1, 1);

    // 3. Precise Hit Detection
    this.enemies.getChildren().forEach(enemy => {
        if (!enemy) return;
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
        const angleToEnemy = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
        const diff = Math.abs(Phaser.Math.Angle.Wrap(angle - angleToEnemy));

        // Only hits enemies within the arc of the sword swing
        if (dist < this.currentWeapon.range + 15 && diff < 0.9) {
            // White flash on death
            const deathPulse = this.add.circle(enemy.x, enemy.y, 15, 0xffffff);
            this.tweens.add({
                targets: deathPulse,
                alpha: 0,
                scale: 2,
                duration: 100,
                onComplete: () => deathPulse.destroy()
            });

            enemy.destroy();
            score++;
            document.getElementById('killCount').innerText = score;
            if (score >= 50 && !hasLeveledUp) this.triggerLevelUp();
        }
    });

    // 4. Clean Slash Animation (Swift Arc)
    this.tweens.add({
        targets: slash,
        alpha: 0,
        duration: 200,
        ease: 'Cubic.easeOut',
        onUpdate: () => {
            // This makes the blade "swing" outward slightly as it fades
            // drawBlade(slash.alpha, 1 + (1 - slash.alpha) * 0.1); 
        },
        onComplete: () => slash.destroy()
    });

    // 5. Minimal Juice (Subtle "Impact" feel)
    this.cameras.main.shake(50, 0.002); // Much lighter shake

    // 6. Cooldown
    this.time.delayedCall(this.currentWeapon.reload * this.player.reloadModifier, () => {
        this.canFire = true;
    });
}

    spawnEnemy() {
        const spawnAngle = Math.random() * Math.PI * 2;
        const x = this.player.x + Math.cos(spawnAngle) * 400;
        const y = this.player.y + Math.sin(spawnAngle) * 400;
        
        const enemy = this.add.circle(x, y, 8, 0xff0033);
        this.enemies.add(enemy);
        this.physics.add.existing(enemy);
    }

    takeDamage() {
        if (this.player.invulnerable) return;
        this.sound.play('hit', { volume: 0.5 });
        this.player.hp--;
        this.player.invulnerable = true;
        
        // Update HTML Health Bar
        const healthPct = (this.player.hp / this.player.maxHp) * 100;
        document.getElementById('health-fill').style.width = healthPct + "%";

        // Red Flash Effect
        this.tweens.add({
            targets: this.player, alpha: 0.2, duration: 100, yoyo: true, repeat: 3,
            onComplete: () => { this.player.invulnerable = false; this.player.alpha = 1; }
        });
        if (this.player.hp <= 0) {
            alert("DEFEATED. KILLS: " + score);
            location.reload();
            this.sound.play('lose', { volume: 0.5 });
        }
    }

    triggerLevelUp() {
        hasLeveledUp = true;
        this.scene.pause();
        document.getElementById('levelUpScreen').classList.remove('hidden');
    }
}

// Global Config
const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    backgroundColor: '#050505',
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [GameScene]
};

// Bridge functions
function startGame() {
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    phaserGame = new Phaser.Game(config);
}

function applyPowerUp(type) {
    const scene = phaserGame.scene.scenes[0];
    if (type === 'heal') {
        scene.player.hp = scene.player.maxHp;
        document.getElementById('health-fill').style.width = "100%";
    } else if (type === 'speed') {
        scene.player.reloadModifier *= 0.8;
    }
    
    document.getElementById('levelUpScreen').classList.add('hidden');
    scene.scene.resume();
}