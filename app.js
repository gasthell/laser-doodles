/** @typedef {import('pear-interface')} */
/* global Pear */
import Hyperswarm from 'hyperswarm';
import crypto from 'hypercore-crypto';
import b4a from 'b4a';
const swarm = new Hyperswarm();
Pear.teardown(() => swarm.destroy());

swarm.on('connection', (peer) => {
  const name = b4a.toString(peer.remotePublicKey, 'hex').slice(0, 6);
  const game = document.querySelector('pear-game');
  if (!game.players.has(name)) {
    const player = new Player(name, game, peer);
    game.addPlayer(player);
  }

  peer.on('data', (message) => {
    let state = null;
    try {
      state = JSON.parse(message);
    } catch {
      console.error('bad incoming message', message);
      return;
    }
    const player = game.players.get(state.id);
    if (player) {
      player.position = state.position;
      player.velocity = state.velocity;
      player.blocks = state.blocks;
    }
  });

  peer.on('error', () => {
    const player = game.players.get(name);
    if (player) game.removePlayer(player);
  });
});

swarm.on('update', () => {
  document.querySelector('#peers-count').textContent = swarm.connections.size;
});

document.querySelector('#create-game').addEventListener('click', createGame);
document.querySelector('#join-form').addEventListener('submit', joinGame);

function loading() {
  document.querySelector('#setup').classList.add('hidden');
  document.querySelector('#loading').classList.remove('hidden');
}

function ready(topicBuffer) {
  const topic = b4a.toString(topicBuffer, 'hex');
  document.querySelector('#game-topic').innerText = topic;
  document.querySelector('#loading').classList.add('hidden');
  document.querySelector('#game').classList.remove('hidden');
}

async function createGame() {
  const topicBuffer = crypto.randomBytes(32);
  loading();
  await joinSwarm(topicBuffer);
  const game = document.querySelector('pear-game');
  const id = b4a.toString(swarm.keyPair.publicKey, 'hex').slice(0, 6);
  game.start(id, topicBuffer);
  ready(topicBuffer);
}

async function joinGame(e) {
  e.preventDefault();
  const topicStr = document.querySelector('#join-game-topic').value;
  const topicBuffer = b4a.from(topicStr, 'hex');
  loading();
  await joinSwarm(topicBuffer);
  const game = document.querySelector('pear-game');
  const id = b4a.toString(swarm.keyPair.publicKey, 'hex').slice(0, 6);
  game.start(id, topicBuffer);
  ready(topicBuffer);
}

async function joinSwarm(topicBuffer) {
  const discovery = swarm.join(topicBuffer, { client: true, server: true });
  await discovery.flushed();
}

class Player {
  constructor(id, game, peer = null) {
    this.id = id;
    this.game = game;
    this.position = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.jumpState = true;
    this.blocks = [];
    this.peer = peer;
    this.color = '#' + id.slice(0, 6);

    this.sprite = new Image();
    this.sprite.src = 'idle/player-idle_00.png';
    this.animations = {
      idle: ['idle/player-idle_00.png', 'idle/player-idle_01.png', 'idle/player-idle_02.png', 'idle/player-idle_03.png', 'idle/player-idle_04.png', 'idle/player-idle_05.png', 'idle/player-idle_06.png', 'idle/player-idle_07.png', 'idle/player-idle_08.png', 'idle/player-idle_09.png'],
      walk: ['walk/player_0.png', 'walk/player_1.png', 'walk/player_2.png', 'walk/player_3.png', 'walk/player_4.png', 'walk/player_5.png', 'walk/player_6.png', 'walk/player_7.png']
    };

    this.gunSprite = new Image();
    this.gunSprite.src = 'gun.png';

    this.currentAnimation = 'idle';
    this.frameIndex = 0;
    this.animationSpeed = 10;
    this.frameCounter = 0;

    this.pattern = [];
    this.finalpattern = [];
    this.maxPatternLength = 20;
    this.isDrawingPattern = false;
  }

  updateSprite(input) {
    if (input.left || input.right) {
      this.currentAnimation = 'walk';
    } else {
      this.currentAnimation = 'idle';
    }

    this.frameCounter++;
    if (this.frameCounter >= this.animationSpeed) {
      this.frameCounter = 0;
      this.frameIndex = (this.frameIndex + 1) % this.animations[this.currentAnimation].length;
      this.sprite.src = this.animations[this.currentAnimation][this.frameIndex];
    }
  }

  updateGunRotation(mouseX, mouseY) {
    const dx = mouseX - (this.position.x + 15);
    const dy = mouseY - (this.position.y - 20);
    this.gunRotation = Math.atan2(dy, dx);
  }

  applyGravity() {
    if (!this.onGround()){
      this.velocity.y += this.game.gravity;
      this.jumpState = true;
    }
    if (this.jumpState == true && this.onGround()){
      this.velocity.y = 0;
      this.jumpState = false;
    }
    this.position.y += this.velocity.y;
  }

  move(input) {
    if (input.left) this.velocity.x = -this.game.speed;
    if (input.right) this.velocity.x = this.game.speed;
    if (input.jump && this.onGround()) this.velocity.y = -this.game.jumpForce;
    this.position.x += this.velocity.x;
    if (this.velocity.x > 0) this.velocity.x -= 1;
    else if (this.velocity.x < 0) this.velocity.x += 1;
  }

  onGround() {
    return this.position.y >= this.game.groundLevel;
  }

  startDrawingPattern() {
    this.isDrawingPattern = true;
    this.pattern = [];
  }

  recordPatternPoint(x, y) {
    if (this.isDrawingPattern && this.pattern.length < this.maxPatternLength) {
      this.pattern.push({ x, y });
    }
  }

  stopDrawingPattern() {
    this.isDrawingPattern = false;
    setTimeout(() => {
      this.finalPattern = [...this.pattern];
      this.pattern = [];
    }, 100);
  }

  fireLaser(ctx) {
    if (this.pattern.length > 1) {
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(this.pattern[0].x, this.pattern[0].y);
      for (const point of this.pattern) {
        ctx.lineTo(point.x, point.y);
      }
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  finalfireLaser(ctx) {
    if (this.pattern.length > 1) {
      ctx.beginPath();
      ctx.moveTo(this.pattern[0].x, this.pattern[0].y);
      for (const point of this.pattern) {
        ctx.lineTo(point.x, point.y);
      }
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

class Game extends HTMLElement {
  static grid = 20
  static tiles = 30

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.players = new Map();
    this.gravity = 0.3;
    this.speed = 3;
    this.jumpForce = 7;
    this.groundLevel = 195;
    this.blocks = this.generateTerrain();
    this.shadowRoot.innerHTML = `
      <style> canvas { background: #87ceeb; display: block; margin: auto; } </style>
      <canvas></canvas>
    `;
    this.canvas = this.shadowRoot.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = 900;
    this.canvas.height = 250;

    this.backgroundImage = new Image();
    this.backgroundImage.src = 'background.png';

    this.keydown = (e) => this.handleInput(e, true);
    this.keyup = (e) => this.handleInput(e, false);

    this.mousedown = (e) => this.handleMouseDown(e);
    this.mousemove = (e) => this.handleMouseMove(e);
    this.mouseup = () => this.handleMouseUp();

    this.input = { left: false, right: false, jump: false };
    this.mousePosition = { x: 0, y: 0 };
  }

  generateTerrain() {
    const blocks = [];
    for (let i = 0; i < 20; i++) {
      blocks.push({ x: i * 40, y: this.groundLevel, width: 40, height: 40 });
    }
    return blocks;
  }

  start(playerId, topicBuffer) {
    this.player = new Player(playerId, this);
    this.addPlayer(this.player);
    this.loop();
    document.addEventListener('keydown', this.keydown);
    document.addEventListener('keyup', this.keyup);

    document.addEventListener('mousedown', this.mousedown);
    document.addEventListener('mousemove', this.mousemove);
    document.addEventListener('mouseup', this.mouseup);
  }

  handleInput(e, isDown) {
    if (e.key === 'ArrowLeft') this.input.left = isDown;
    if (e.key === 'ArrowRight') this.input.right = isDown;
    if (e.key === 'ArrowUp') this.input.jump = isDown;
  }

  handleMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.player.startDrawingPattern();
    this.player.recordPatternPoint(x, y);
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.mousePosition = { x, y };
    if (this.player.isDrawingPattern) {
      this.player.recordPatternPoint(x, y);
    }
  }

  handleMouseUp() {
    this.player.stopDrawingPattern();
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    this.update();
    this.render();
  }

  update() {
    for (const player of this.players.values()) {
      player.applyGravity();
      player.move(this.input);
      player.updateSprite(this.input);
      player.updateGunRotation(this.mousePosition.x, this.mousePosition.y);
      if (player.position.y > this.canvas.height) player.position.y = this.groundLevel;
    }
  }

  render() {
    this.ctx.drawImage(this.backgroundImage, 0, 0, this.canvas.width, this.canvas.height);

    this.ctx.fillStyle = 'none';

    for (const player of this.players.values()) {
      this.ctx.drawImage(
        player.sprite,
        player.position.x,
        player.position.y - 40,
        30,
        40
      );

      this.ctx.save();

      this.ctx.translate(player.position.x + 15, player.position.y - 20);
      this.ctx.rotate(player.gunRotation);

      this.ctx.drawImage(player.gunSprite, -10, -10, 40, 40);

      this.ctx.restore();
      player.fireLaser(this.ctx);
      player.finalfireLaser(this.ctx);
    }
  }

  addPlayer(player) {
    this.players.set(player.id, player);
  }

  removePlayer(player) {
    this.players.delete(player.id);
  }
}

customElements.define('pear-game', Game);
