const default_stocks = 3
const arena_width = 2000
const arena_height = 1100
const deathfloor = 2000

const urlSearchParams = new URLSearchParams(window.location.search);
const params = Object.fromEntries(urlSearchParams.entries());

const weed_bg = new Image()
weed_bg.src = 'images/whoaaaadude.webp'

let character_roster = {
    trump: { create: create_trump, skins: trump_skins },
    stoner: { create: create_stoner, skins: stoner_skins },
    faceman: { create: create_faceman, skins: faceman_skins },
    knigh: { create: create_knigh, skins: knigh_skins },
    utopian: { create: create_utopian, skins: utopian_skins },
    shrek: { create: create_shrek, skins: shrek_skins },
    monke: { create: create_monke, skins: monke_skins },
}

let spawn_positions = [new Vector2(500, 0), new Vector2(1500, 0), new Vector2(1000, 0), new Vector2(750, 0)]
let ability_draw_locations = [new Vector2(200, 100), new Vector2(1000, 100), new Vector2(1800, 100), new Vector2(600, 100)]

class PlayerMetadata {
    constructor(stocks, player, control, char_name, skin_name) {
        this.stocks = stocks
        this.player = player
        this.control = control
        this.char_name = char_name
        this.skin_name = skin_name
    }
}

var keys = {};
window.addEventListener("keydown", function(e) { keys[e.code] = true; }, false)
window.addEventListener('keyup', function(e){ keys[e.code] = false; }, false)
function is_key_down(key) { return key in keys && keys[key] }

let max_num_players = 0
let players = []
let gameRunning = false
let gameLoopId = null

let map = null
let map_names = ['default', 'weedopolis']
let maps = {
    default : new GameMap([
        platform(1400, 1000, new Vector2(arena_width / 2, arena_height + 350)),
        platform_semisolid(300, 25, new Vector2(arena_width / 4, arena_height - 300)),
        platform_semisolid(300, 25, new Vector2(arena_width - arena_width / 4, arena_height - 300))
    ]),
    weedopolis : new GameMap([
        platform_semisolid(450, 25, new Vector2(arena_width / 2, arena_height - 200), 'purple'),
        platform_semisolid(300, 25, new Vector2(arena_width / 4, arena_height - 300), 'purple'),
        platform_semisolid(300, 25, new Vector2(arena_width - arena_width / 4, arena_height - 300), 'purple'),
        platform_semisolid(300, 25, new Vector2(arena_width / 8, arena_height - 250), 'purple'),
        platform_semisolid(300, 25, new Vector2(arena_width - arena_width / 8, arena_height - 250), 'purple')
    ], weed_bg)
}

function platform(width, height, position, color) {
    if (color === undefined) { color = 'black' }
    let rect = new RectComponent(new Vector2(0, 0), color)
    let platform_physical_properties = new PhysicalProperties(new Vector2(0, 0), Infinity, 0, new Vector2(width, height), 1, false)
    return new GameObject(position, platform_physical_properties, ["ground"], {display : rect})
}

function platform_semisolid(width, height, position, color) {
    if (color === undefined) { color = 'black' }
    let rect = new RectComponent(new Vector2(0, 0), color)
    let platform_physical_properties = new PhysicalProperties(new Vector2(0, 0), Infinity, 0, new Vector2(width, height), 1, false, true)
    return new GameObject(position, platform_physical_properties, ["ground"], {display : rect})
}

function create_player(char_name, skin_name, gamepad, spawn_position, ability_draw_location) {
    let player = character_roster[char_name].create(gamepad, spawn_position, ability_draw_location, skin_name)
    all_objects.push(player)
    return player
}

// Called by network.js startGame() when all players lock in
function initGame() {
    // Reset game state
    all_objects = []
    players = []
    max_num_players = 0
    gameRunning = false

    // Load map
    if (params['map'] === undefined) {
        map = maps[map_names[Math.floor(Math.random() * map_names.length)]]
    } else {
        map = maps[params['map']]
    }

    for (let i = 0; i < map.objects_to_spawn.length; i++) {
        all_objects.push(map.objects_to_spawn[i])
    }

    // Create players from connected peers
    let stocks = params['stocks'] === undefined ? default_stocks : parseInt(params['stocks'])

    for (let i = 0; i < connectedPeers.length; i++) {
        const peer = connectedPeers[i]
        const ctrl = networkControls.get(peer.peerId)
        if (!ctrl) continue

        let char_name = peer.selectedChar
        let skin_name = peer.selectedSkin || Object.keys(character_roster[char_name].skins)[0]
        if (!character_roster[char_name]) char_name = Object.keys(character_roster)[0]

        let player = create_player(
            char_name,
            skin_name,
            ctrl,
            spawn_positions[i % spawn_positions.length],
            ability_draw_locations[i % ability_draw_locations.length]
        )
        players.push(new PlayerMetadata(stocks, player, ctrl, char_name, skin_name))
        max_num_players++
    }

    // Start game loop
    gameRunning = true
    gameloop()
}

function draw_win_screen(winner) {
    drawText(winner.tags[0].toUpperCase() + ' WINS!', 'red', '100px serif', arena_width / 2, arena_height / 2, 'center')
}

function drawImageScaled(img, ctx) {
    var canvas = ctx.canvas;
    var hRatio = canvas.width / img.width;
    var vRatio = canvas.height / img.height;
    var ratio = Math.max(hRatio, vRatio);
    var centerShift_x = (canvas.width - img.width * ratio) / 2;
    var centerShift_y = (canvas.height - img.height * ratio) / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, img.width, img.height, centerShift_x, centerShift_y, img.width * ratio, img.height * ratio);
}

function gameloop() {
    if (!gameRunning || gamePhase !== PHASE_PLAYING) return
    update_dt()

    let current_players = []
    for (let i = 0; i < all_objects.length; i++) {
        if (all_objects[i].tags.includes('player')) {
            current_players.push(all_objects[i])
        }
    }

    for (let i = 0; i < players.length; i++) {
        let player_alive = false
        for (let j = 0; j < current_players.length; j++) {
            if (players[i].player == current_players[j]) {
                player_alive = true
                break
            }
        }
        if (!player_alive && players[i].stocks > 0) {
            players[i].player = create_player(
                players[i].char_name,
                players[i].skin_name,
                players[i].control,
                spawn_positions[i % spawn_positions.length],
                ability_draw_locations[i % ability_draw_locations.length]
            )
            players[i].stocks--
        }
    }

    let num_players_alive = 0
    for (let i = 0; i < all_objects.length; i++) {
        if (all_objects[i].tags.includes('player')) {
            num_players_alive++
        }
    }

    if (num_players_alive === 1 && num_players_alive < max_num_players) {
        gameRunning = false
        let winnerIndex = -1
        for (let i = 0; i < players.length; i++) {
            if (players[i].player == current_players[0]) {
                winnerIndex = i
                break
            }
        }
        onGameOver(current_players[0].tags[0], winnerIndex + 1)
        return
    }

    requestAnimationFrame(gameloop)

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (map.background_image !== undefined) {
        drawImageScaled(map.background_image, ctx)
    }

    let remaining_objects = []
    for (let i = 0; i < all_objects.length; i++) {
        let delete_object = component => component.should_delete !== undefined && component.should_delete()
        if (Object.values(all_objects[i].components).find(delete_object) === undefined && all_objects[i].position.y < deathfloor) {
            remaining_objects.push(all_objects[i])
        }
    }
    all_objects = remaining_objects

    handle_gravity()
    handle_collisions()

    for (let i = 0; i < all_objects.length; i++) {
        Object.values(all_objects[i].components).forEach(component => {
            if (component.update !== undefined) component.update()
            if (component.draw !== undefined) component.draw()
        })
    }

    handle_position_update()

    for (let i = 0; i < players.length; i++) {
        let draw_loc = ability_draw_locations[i % ability_draw_locations.length].add(new Vector2(0, 50))
        drawText(players[i].stocks + '', 'white', '50px serif', draw_loc.x, draw_loc.y, 'left')
    }

    // Draw FPS and object count overlay
    if (typeof window._gameFpsDisplay !== 'undefined') {
        ctx.save()
        ctx.fillStyle = "lime"
        ctx.font = "bold 24px monospace"
        ctx.textAlign = "left"
        ctx.textBaseline = "top"
        ctx.fillText("FPS: " + window._gameFpsDisplay + "  |  Objects: " + all_objects.length, 12, 12)
        ctx.restore()
    }
}
