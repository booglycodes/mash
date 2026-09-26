// Forest stage — falling branches (knockback) and floating leaves (heal)

let branch_img = new Image()
branch_img.src = 'images/branch.png'

let leaf_img = new Image()
leaf_img.src = 'images/leaf.png'

let forest_bg = new Image()
forest_bg.src = 'images/nike.webp'

// Wood cracking sounds (CC0, see sounds/CREDITS.md). Picked at random per branch.
const branch_crack_sounds = [
    new Audio('sounds/branch_crack_1.mp3'),
    new Audio('sounds/branch_crack_2.mp3'),
]
function play_wood_crack() {
    let snd = branch_crack_sounds[Math.floor(Math.random() * branch_crack_sounds.length)]
    snd.currentTime = 0
    snd.play()
}

// Image is 210x75; drawn scaled to these dimensions
const BRANCH_WIDTH = 300
const BRANCH_HEIGHT = 107
// No damage — the launch is the punishment.
const BRANCH_KNOCKBACK_X = 40
const BRANCH_KNOCKBACK_Y = -45

// Branch hazard — falls from above, knocks players up and away
function spawn_branch() {
    let x = rand_between(150, arena_width - 150)
    let start_y = -BRANCH_HEIGHT

    let branch_attack = new Attack(
        null, // no owner player
        undefined,
        [
            new Effect(
                [
                    // Knock player up and away — full horizontal force toward whichever side of the branch they're on
                    (attack, obj) => {
                        let dir_x = obj.position.x > attack.gameobject.position.x ? 1 : -1
                        obj.physical_properties.add_force(
                            new Vector2(dir_x * BRANCH_KNOCKBACK_X, BRANCH_KNOCKBACK_Y).scale(obj.physical_properties.mass)
                        )
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
        new Vector2(rand_between(-2, 2), rand_between(8, 14)),
        150,
        0.6,
        new Vector2(BRANCH_WIDTH, BRANCH_HEIGHT),
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
const BRANCH_CRACK_LEAD_FRAMES = 18   // ~0.6s: crack sound plays, then the branch falls
class ForestHazardSpawner {
    constructor(branch_interval, leaf_interval) {
        this.branch_interval = branch_interval
        this.leaf_interval = leaf_interval
        this.branch_timer = 0               // first branch comes after a full interval, not on frame 1
        this.leaf_timer = leaf_interval / 2  // offset so they don't all come at once
        this.branch_pending = -1            // frames until the cracked branch actually drops; -1 = none pending
    }

    update() {
        this.branch_timer++
        this.leaf_timer++

        if (this.branch_pending >= 0) {
            this.branch_pending--
            if (this.branch_pending < 0) {
                spawn_branch()
            }
        } else if (this.branch_timer >= this.branch_interval) {
            this.branch_timer = 0
            this.branch_interval = Math.floor(rand_between(180, 400))
            play_wood_crack()
            this.branch_pending = BRANCH_CRACK_LEAD_FRAMES
        }

        if (this.leaf_timer >= this.leaf_interval) {
            this.leaf_timer = 0
            this.leaf_interval = Math.floor(rand_between(90, 200))
            spawn_leaf()
        }
    }
}
