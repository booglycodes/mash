// Forest stage — falling branches (knockback) and floating leaves (heal)

let branch_img = new Image()
branch_img.src = 'images/branch.png'

let leaf_img = new Image()
leaf_img.src = 'images/leaf.png'

let forest_bg = new Image()
forest_bg.src = 'images/nike.webp'

// Programmatic wood crack sound. One shared AudioContext — browsers cap how many can exist.
let forest_audio_ctx = null
function play_wood_crack() {
    if (forest_audio_ctx === null) {
        forest_audio_ctx = new (window.AudioContext || window.webkitAudioContext)()
    }
    let audioCtx = forest_audio_ctx
    if (audioCtx.state === 'suspended') { audioCtx.resume() }

    // Layer 1: sharp noise burst (the crack)
    let duration = 0.15
    let buffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * duration), audioCtx.sampleRate)
    let data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
        let t = i / data.length
        let envelope = Math.exp(-t * 30) * (1 - t)
        data[i] = (Math.random() * 2 - 1) * envelope
    }
    let source = audioCtx.createBufferSource()
    source.buffer = buffer
    let filter = audioCtx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 800
    filter.Q.value = 1.5
    source.connect(filter)
    filter.connect(audioCtx.destination)
    source.start()

    // Layer 2: low thump underneath so it sounds like a heavy branch, not a twig
    let osc = audioCtx.createOscillator()
    let gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(160, audioCtx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.5, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15)
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.15)
}

// Branch hazard — falls from above, knocks players up and away
function spawn_branch() {
    let x = rand_between(100, arena_width - 100)
    let start_y = -60

    play_wood_crack()

    let branch_attack = new Attack(
        null, // no owner player
        undefined,
        [
            new Effect(
                [
                    // Knock player up and away from branch center
                    (attack, obj) => {
                        let dir_x = obj.position.x > attack.gameobject.position.x ? 1 : -1
                        obj.physical_properties.add_force(new Vector2(dir_x * 20, -35).scale(obj.physical_properties.mass))
                    },
                    // Small damage
                    (_, obj) => {
                        if (obj.components.stats !== undefined) {
                            obj.components.stats.apply_damage(-5)
                        } else if (obj.components.health !== undefined) {
                            obj.components.health.apply_damage(-5)
                        }
                    }
                ],
                and_filters([
                    filter_by_tag('player'),
                    filter_by_hit
                ])
            )
        ]
    )

    // Null owner — override collision to not skip anyone
    branch_attack.collision = function(obj) {
        for (let i = 0; i < this.effects.length; i++) {
            this.effects[i].run(this, obj)
        }
    }

    let image = new ImageComponent(branch_img, new Vector2(0, 0), false)

    let physics = new PhysicalProperties(
        new Vector2(rand_between(-2, 2), rand_between(5, 10)),
        80,
        0.5,
        new Vector2(140, 50),
        0.3,
        false
    )

    let branch = new GameObject(
        new Vector2(x, start_y),
        physics,
        ['hazard'],
        {
            attack: branch_attack,
            draw: image,
            delete: new TimedDelete(600),           // safety net if it never lands
            landing: new DeleteAfterLanding(15),    // normal path: vanish shortly after hitting ground
            hit_data: new HitData()
        }
    )

    all_objects.push(branch)
}

// Deletes the object a few frames after it touches something tagged 'ground'.
// Without this a landed branch sits around as a landmine that launches anyone who walks into it.
class DeleteAfterLanding {
    constructor(delay_frames) {
        this.delay_frames = delay_frames
        this.landed = false
        this.frames_since_landing = 0
    }

    collision(obj) {
        if (obj.tags.includes('ground')) {
            this.landed = true
        }
    }

    update() {
        if (this.landed) {
            this.frames_since_landing++
        }
    }

    should_delete() {
        return this.landed && this.frames_since_landing >= this.delay_frames
    }
}

// Leaf pickup — floats down slowly, heals player for 2 HP on contact
function spawn_leaf() {
    let x = rand_between(100, arena_width - 100)
    let start_y = -30

    let image = new ImageComponent(leaf_img, new Vector2(0, 0), false)

    let physics = new PhysicalProperties(
        new Vector2(0, 0),
        5,
        0,        // no gravity — LeafDrift sets velocity directly each frame
        new Vector2(30, 20),
        0,
        true      // kinematic so it passes through platforms and doesn't shove players
    )

    let leaf = new GameObject(
        new Vector2(x, start_y),
        physics,
        ['pickup'],
        {
            draw: image,
            delete: new TimedDelete(900),
            drift: new LeafDrift(),
            heal_on_touch: new HealOnTouch(2)
        }
    )

    all_objects.push(leaf)
}

// Makes leaves float down with a gentle side-to-side drift
class LeafDrift {
    constructor() {
        this.time = 0
        this.drift_speed = rand_between(0.5, 1.5)
        this.drift_amplitude = rand_between(1, 3)
        this.fall_speed = rand_between(1.5, 3)
    }

    update() {
        this.gameobject.physical_properties.velocity = new Vector2(
            Math.sin(this.time * 0.05 * this.drift_speed) * this.drift_amplitude,
            this.fall_speed
        )
        this.time++
    }
}

// Heals player on contact then deletes itself
class HealOnTouch {
    constructor(heal_amount) {
        this.heal_amount = heal_amount
        this.used = false
    }

    collision(obj) {
        if (this.used) return
        if (!obj.tags.includes('player')) return

        if (obj.components.stats !== undefined) {
            obj.components.stats.apply_damage(this.heal_amount)
        } else if (obj.components.health !== undefined) {
            obj.components.health.apply_damage(this.heal_amount)
        }
        this.used = true
    }

    should_delete() {
        return this.used
    }
}

// Spawner component — attached to an invisible map object
class ForestHazardSpawner {
    constructor(branch_interval, leaf_interval) {
        this.branch_interval = branch_interval
        this.leaf_interval = leaf_interval
        this.branch_timer = 0               // first branch comes after a full interval, not on frame 1
        this.leaf_timer = leaf_interval / 2  // offset so they don't all come at once
    }

    update() {
        this.branch_timer++
        this.leaf_timer++

        if (this.branch_timer >= this.branch_interval) {
            this.branch_timer = 0
            // Randomize a bit so it's not perfectly periodic
            this.branch_interval = Math.floor(rand_between(180, 400))
            spawn_branch()
        }

        if (this.leaf_timer >= this.leaf_interval) {
            this.leaf_timer = 0
            this.leaf_interval = Math.floor(rand_between(90, 200))
            spawn_leaf()
        }
    }
}
