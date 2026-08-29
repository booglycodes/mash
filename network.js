// network.js — Trystero networking, game state machine, NetworkControl

const TRYSTERO_APP_ID = "supermashbruddas-phone"

// === GAME PHASES ===
const PHASE_LOBBY = "lobby"
const PHASE_SELECT = "select"
const PHASE_PLAYING = "playing"
const PHASE_GAMEOVER = "gameover"

let gamePhase = PHASE_LOBBY
let connectedPeers = [] // { peerId, selectedChar, locked }
let winnerName = null
let winnerPlayerNum = 0
let gameoverTimer = 0
const GAMEOVER_DURATION = 4000 // ms before auto-restart

// === CHARACTER DATA (derived from game.js character_roster) ===
let character_names_list = Object.keys(character_roster)

function getCharData() {
  const data = {}
  for (const [name, entry] of Object.entries(character_roster)) {
    const skins = {}
    for (const [skinName, skin] of Object.entries(entry.skins)) {
      skins[skinName] = new URL(skin.image.src).pathname.split('/').slice(-2).join('/')
    }
    data[name] = skins
  }
  return data
}

// Gesture-to-ability mapping per character
// Each gesture (up/down/left/right/hold) maps directly to an ability index, or -1 for none
const CHARACTER_MAPPINGS = {
  trump: {
    up: 0, left: 1, right: 1, down: 2, hold: 3,
    labels: { up: "BIGLY PUNCH", left: "THROW ORANGE", right: "THROW ORANGE", down: "BUILD WALL", hold: "RED STATE" }
  },
  stoner: {
    up: 2, left: 0, right: 3, down: 1, hold: 4,
    labels: { up: "HIGH LIFE", left: "DRUGS", right: "FREE WEED", down: "BIGBONGO", hold: "POT BROWNIE" }
  },
  faceman: {
    up: 0, left: 1, right: 1, down: 2, hold: -1,
    labels: { up: "EAT", left: "RUSHDOWN", right: "RUSHDOWN", down: "BELCH", hold: "" }
  },
  faceman_shaman: {
    up: 0, left: 1, right: 1, down: 2, hold: -1,
    labels: { up: "EAT", left: "RUSHDOWN", right: "RUSHDOWN", down: "BELCH", hold: "" }
  },
  knigh: {
    up: 3, left: 1, right: 2, down: 0, hold: 4,
    labels: { up: "LIGHTNING", left: "FIRE", right: "ICE", down: "HONOUR SLASH", hold: "PHYSICS HW" }
  },
  utopian: {
    up: 3, left: 1, right: 2, down: 0, hold: -1, holdswipe: 4,
    labels: { up: "TURRET", left: "GENERATOR", right: "DRONES", down: "SHOCK", hold: "", holdswipe: "TELEPORT" }
  },
  shrek: {
    up: 2, left: 3, right: 4, down: 0, hold: 1,
    labels: { up: "GRAB", left: "SHREKSTITUTION ←", right: "SHREKSTITUTION →", down: "SHREKDOWN", hold: "DONKEY" }
  },
  monke: {
    up: 0, left: 0, right: 0, down: 0, hold: -1,
    labels: { up: "GRAB", left: "GRAB", right: "GRAB", down: "GRAB", hold: "" }
  }
}

// === NETWORK CONTROL ===
// Stores raw touch data from controller.html:
//   { dx, dy, touching, rx, ry, startX, startY, startTime }
class NetworkControl {
  constructor() {
    this._axes = new Vector2(0, 0)
    // Raw right-side touch state
    this.touching = false
    this.rx = 0
    this.ry = 0
    this.startX = 0
    this.startY = 0
    this.startTime = 0
    this._prevTouching = false
  }

  updateInput(data) {
    this._prevTouching = this.touching
    this._axes = new Vector2(data.dx || 0, data.dy || 0)
    this.touching = !!data.touching
    this.rx = data.rx || 0
    this.ry = data.ry || 0
    this.startX = data.startX || 0
    this.startY = data.startY || 0
    this.startTime = data.startTime || 0
  }

  axes() { return this._axes }

  // Touch just started this frame
  justTouched() { return this.touching && !this._prevTouching }

  // Touch just released this frame
  justReleased() { return !this.touching && this._prevTouching }
}

// === ROOM MANAGEMENT ===
let room = null
let sendPhase = null
let sendCharInfo = null
let sendCharList = null
let receiveInput = null
let receiveSelect = null
const networkControls = new Map()

function getQRUrl(roomName) {
  const base = window.location.href.replace(/\/[^/]*$/, '/')
  return `${base}controller.html?room=${encodeURIComponent(roomName)}`
}

async function initNetwork() {
  const { joinRoom } = await import("https://esm.run/trystero@0.24.0")

  const roomName = Math.random().toString(36).slice(2, 12)
  room = joinRoom({ appId: TRYSTERO_APP_ID }, roomName)

  const [_sendInput, _receiveInput] = room.makeAction("input")
  const [_sendPhase, _receivePhase] = room.makeAction("phase")
  const [_sendCharInfo, _receiveCharInfo] = room.makeAction("charinfo")
  const [_sendCharList, _receiveCharList] = room.makeAction("charlist")
  const [_sendSelect, _receiveSelect] = room.makeAction("select")

  sendPhase = _sendPhase
  sendCharInfo = _sendCharInfo
  sendCharList = _sendCharList
  receiveInput = _receiveInput
  receiveSelect = _receiveSelect

  _receivePhase(() => {})
  _receiveCharInfo(() => {})
  _receiveCharList(() => {})

  receiveInput((data, peerId) => {
    const ctrl = networkControls.get(peerId)
    if (ctrl) ctrl.updateInput(data)
  })

  _receiveSelect((data, peerId) => {
    if (gamePhase !== PHASE_SELECT) return
    const peer = connectedPeers.find(p => p.peerId === peerId)
    if (!peer) return

    if (data.type === "browse") {
      peer.selectedChar = data.char
      peer.selectedSkin = data.skin
    } else if (data.type === "lock") {
      peer.locked = true
      peer.selectedChar = data.char
      peer.selectedSkin = data.skin
      checkAllLocked()
    } else if (data.type === "unlock") {
      peer.locked = false
      peer.selectedChar = data.char
      peer.selectedSkin = data.skin
    }
  })

  room.onPeerJoin(peerId => {
    console.log("[network] peer joined:", peerId)
    const ctrl = new NetworkControl()
    networkControls.set(peerId, ctrl)
    connectedPeers.push({ peerId, selectedChar: character_names_list[0], selectedSkin: null, locked: false })

    // Send current phase and character list to new peer (slight delay for connection stability)
    setTimeout(() => {
      sendPhase({ phase: gamePhase }, peerId)
      sendCharList({ characters: character_names_list, charData: getCharData() }, peerId)
    }, 500)
  })

  room.onPeerLeave(peerId => {
    console.log("[network] peer left:", peerId)
    networkControls.delete(peerId)
    connectedPeers = connectedPeers.filter(p => p.peerId !== peerId)
  })

  return roomName
}

// === PHASE TRANSITIONS ===
function transitionTo(phase) {
  gamePhase = phase
  sendPhase({ phase })

  if (phase === PHASE_SELECT) {
    // Reset selections
    for (const p of connectedPeers) {
      p.locked = false
      p.selectedChar = character_names_list[0]
      p.selectedSkin = null
    }
    sendCharList({ characters: character_names_list, charData: getCharData() })
  }
}

function checkAllLocked() {
  if (connectedPeers.length < 2) return
  if (connectedPeers.every(p => p.locked)) {
    startGame()
  }
}

function startGame() {
  // Reset all control state so nothing is stuck from previous round
  for (const ctrl of networkControls.values()) {
    ctrl._axes = new Vector2(0, 0)
    ctrl.touching = false
    ctrl._prevTouching = false
    ctrl.rx = 0; ctrl.ry = 0
    ctrl.startX = 0; ctrl.startY = 0
    ctrl.startTime = 0
  }

  // Send labels and player number to each phone
  for (let i = 0; i < connectedPeers.length; i++) {
    const peer = connectedPeers[i]
    const mapping = CHARACTER_MAPPINGS[peer.selectedChar] || CHARACTER_MAPPINGS.trump
    sendCharInfo({ labels: mapping.labels, phase: PHASE_PLAYING, playerNum: i + 1 }, peer.peerId)
  }

  transitionTo(PHASE_PLAYING)
  initGame() // defined in game.js
}

function onGameOver(winner, playerNum) {
  winnerName = winner
  winnerPlayerNum = playerNum
  transitionTo(PHASE_GAMEOVER)
  gameoverTimer = performance.now()
}

function checkGameoverTimeout() {
  if (gamePhase === PHASE_GAMEOVER && performance.now() - gameoverTimer > GAMEOVER_DURATION) {
    transitionTo(PHASE_SELECT)
  }
}

// Called from index.html after lobby
function startSelectPhase() {
  if (connectedPeers.length > 0) {
    transitionTo(PHASE_SELECT)
  }
}
