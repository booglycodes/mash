const lightning_noise = new Audio('sounds/honour_shall_prevail.mp3')
const magic_noise = new Audio('sounds/magic_sir.mp3')
const sword_slash_noises = [new Audio('sounds/sirr.mp3'), new Audio('sounds/so_honourable.mp3')]
const bigly_knight_noises = [new Audio('sounds/sir_i_voted_for_trump.mp3'), new Audio('sounds/i_voted_for_trump_sir.mp3')]
const physics_noise = new Audio('sounds/ready_to_study_physics.mp3')

let knigh_skins = {
    knigh : new Skin('images/knight.png', new Vector2(1, 1))
}

let honour_sword = new Image()
honour_sword.src = 'images/honoursword.png'

let fireball = new Image()
fireball.src = 'images/fireball.png'

let snowball = new Image()
snowball.src = 'images/snowflake.png'

let lightning_cloud = new Image()
lightning_cloud.src = 'images/lightning_cloud.png'

class KnighManaComponent {
    constructor(max_mana, fire_cost, ice_cost, mana_recovery_factor) {
        this.max_mana = max_mana
        this.mana = max_mana
        this.fire_cost = fire_cost
        this.ice_cost = ice_cost
        this.mana_recovery_factor = mana_recovery_factor // recovers this fraction of damage dealt
        this.current_mode = 'fire' // 'fire' or 'ice'
    }

    draw() {
        let draw_location = this.gameobject.components.controller.ability_draw_location.add(new Vector2(100, 0))
        // Mana bar background
        let barWidth = 150
        let barHeight = 16
        let barX = draw_location.x
        let barY = draw_location.y - 10
        drawRect(barX, barY, barWidth, barHeight, '#1a1a2e')
        // Mana bar fill
        let fillWidth = (this.mana / this.max_mana) * barWidth
        let barColor = this.current_mode === 'fire' ? '#f97316' : '#38bdf8'
        drawRect(barX, barY, fillWidth, barHeight, barColor)
        // Mode label
        let modeText = this.current_mode === 'fire' ? '🔥 FIRE' : '❄️ ICE'
        drawText(modeText, 'white', '20px serif', barX + barWidth / 2, barY - 8, 'center')
        // Mana text
        drawText(Math.floor(this.mana) + '/' + this.max_mana, 'white', '14px serif', barX + barWidth / 2, barY + barHeight + 14, 'center')
    }

    recover(damage_dealt) {
        // damage_dealt is positive (the raw damage amount)
        this.mana = Math.min(this.max_mana, this.mana + damage_dealt * this.mana_recovery_factor)
    }

    can_cast() {
        let cost = this.current_mode === 'fire' ? this.fire_cost : this.ice_cost
        return this.mana >= cost
    }

    consume() {
        let cost = this.current_mode === 'fire' ? this.fire_cost : this.ice_cost
        this.mana -= cost
    }
}

const we_have_this_chance = 0.05

function honour_slash(player) {
    let bigly = Math.random() <= we_have_this_chance
    if (bigly) {
        bigly_knight_noises[Math.floor(Math.random() * bigly_knight_noises.length)].play()
    } else {
        sword_slash_noises[Math.floor(Math.random() * sword_slash_noises.length)].play()
    }
    let attack = new Attack(
        player,
        (attack) => {
            attack.player.physical_properties.velocity = new Vector2(0, 0)
            let angle = attack.frame * 3 - 120
            let x = Math.cos(degrees_to_radians(angle))
            let y = Math.sin(degrees_to_radians(angle))
            attack.gameobject.components.draw.flipped = !player.components.controller.flip 
            let posn = new Vector2(
                (player.components.controller.flip ? 1 : -1) * player.physical_properties.dimensions.x * x,
                player.physical_properties.dimensions.y * y
            )
            if (player.components.controller.flip) {
                attack.gameobject.components.draw.angle = -45 - angle
            } else {
                attack.gameobject.components.draw.angle = angle + 45
            }
            attack.gameobject.position = posn.scale(1.75).add(player.position)
        }, 
        [
            new Effect(
                [
                    damage(-20 * (bigly ? 2 : 1)),
                    knockback_angled(20, 7.5),
                    (attack, _) => {
                        // Recover mana: 0.5x of damage dealt
                        let dmg = 20 * (bigly ? 2 : 1)
                        attack.player.components.knigh_mana.recover(dmg)
                    }
                ],
                and_filters([filter_by_can_damage(), filter_by_hit])
            ),
            new Effect(
                [(attack, obj) => obj.physical_properties.velocity.x = (attack.player.components.controller.flip ? 1 : -1) * 10],
                filter_by_tag('projectile')
            )
        ]
    )
    let image = new ImageComponent(
        honour_sword,
        new Vector2(0, 0),
        !player.components.controller.flip
    )
    let sword = attatched_hitbox(attack, image, 50, 1.5)
    sword.add_component('reflect', new Reflect(player))
    all_objects.push(sword)
}

function ice_projectile(player, position, velocity, time_alive) {
    let attack = new Attack(
        player,
        undefined,
        [
            new Effect(
                [
                    damage(-10),
                    delete_self(),
                    (_, player) => {
                        player.physical_properties.velocity = new Vector2(0, 0)
                        player.components.controller.stun(90)
                    }
                ],
                filter_by_can_damage()
            )
        ]
    )

    let snowflake = new ImageComponent(snowball, new Vector2(0, 0), false)

    let physics = new PhysicalProperties(
        velocity, 
        100,
        0,
        new Vector2(75, 75),
        0,
        true
    )

    return projectile(position, attack, snowflake, physics, time_alive)
}

function fire_projectile(player, position, velocity, time_alive) {
    let attack = new Attack(
        player,
        undefined,
        [
            new Effect(
                [damage_over_time(-1.5)],
                filter_by_can_damage()
            )
        ]
    )

    let fire = new ImageComponent(fireball, new Vector2(0, 0), player.components.controller.flip)

    let physics = new PhysicalProperties(
        velocity, 
        100,
        0,
        new Vector2(150, 75),
        0,
        true
    )

    return projectile(position, attack, fire, physics, time_alive)
}

function physics_homework(player) {
    physics_noise.play()
    for (let i = 0; i < 100; i++) {
        let position = new Vector2(Math.floor(Math.random() * arena_width), -Math.floor(Math.random() * 500))
        let velocity = new Vector2(0, -Math.floor(Math.random() * 50));
        all_objects.push(spawn_math(Math.round(Math.random() *  100), position, velocity))
    }
    let prev = player.components.stats.input_damage_scale
    player.components.stats.input_damage_scale = 0
    setTimeout(function () {
        player.components.stats.input_damage_scale = prev
    }, 7500)
}


function spawn_math(number, position, velocity) {
    let text = new TextComponent(
        number + '',
        'white',
        Math.round(Math.random() * 30 + 20) + 'px serif'
    )

    let physics = new PhysicalProperties(
        velocity, 
        30,
        0.25,
        new Vector2(40, 40),
        0,
        true
    )

    return new GameObject(
        position,
        physics,
        ['math'],
        {
            draw : text
        }
    )
}

function knigh_toggle_mode(player) {
    magic_noise.play()
    let mana = player.components.knigh_mana
    mana.current_mode = mana.current_mode === 'fire' ? 'ice' : 'fire'
}

function knigh_cast(player) {
    let mana = player.components.knigh_mana
    if (!mana.can_cast()) return

    magic_noise.play()
    mana.consume()

    let dir = (player.components.controller.flip ? 1 : -1)
    let posn = new Vector2(player.physical_properties.dimensions.x, 0).scale(dir).add(player.position)
    let velocity = new Vector2(1, 0).scale(dir)

    if (mana.current_mode === 'fire') {
        all_objects.push(fire_projectile(player, posn, velocity, 5000))
    } else {
        all_objects.push(ice_projectile(player, posn, velocity, 5000))
    }
}

function knigh_lightning(player) {
    lightning_noise.play()
    player.components.stats.apply_damage(-20)
    let lightning = new GameObject(
        new Vector2(player.position.x, 200),
        new PhysicalProperties(new Vector2(0, 0), Infinity, 0, new Vector2(350, 350), 0, true),
        ['lightning'],
        {
            lightning : new LightningComponent(player, 30, 30, {min : 10, max : 50}, {min : -70, max : 70}, 90, 'yellow', new Vector2(200, 0), Infinity, -2),
            draw : new AnimatedImageComponent(lightning_cloud, 64, 7, 4, new Vector2(0, 0), false, true),
            del : new TimedDelete(1000)
        }
    )
    all_objects.push(lightning)
}

function create_knigh(gamepad, position, ability_draw_location, skin_name, gestureMapping) {
    let abilities = [
        new Ability(honour_slash, "honour slash", 110),
        new Ability(knigh_toggle_mode, "toggle fire/ice", 30, true),
        new Ability(knigh_cast, "cast projectile", 60, true),
        new Ability(knigh_lightning, "lightning magic", 1500, true),
        new Ability(physics_homework, "physics homework", 1750, true)
    ]

    return new GameObject(
        position,
        new PhysicalProperties(new Vector2(0, 0), 150, 0.25, new Vector2(90, 90), 0, false),
        ['knigh', 'player', 'grabbable'],
        {
            controller : new PlayerControllerComponent(
                knigh_skins[skin_name],
                ability_draw_location, 
                gamepad, 
                abilities, 
                new PlayerControllerProperties(-26, 25, 8, 2), 
                false,
                gestureMapping
            ), 
            stats : new PlayerStatsComponent(250),
            knigh_mana : new KnighManaComponent(100, 20, 40, 0.5)
        }
    )
}