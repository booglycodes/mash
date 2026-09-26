// Forest stage — falling branches (knockback) and floating leaves (heal)

let branch_img = new Image()
branch_img.src = 'images/branch.png'

let leaf_img = new Image()
leaf_img.src = 'images/leaf.png'

let forest_bg = new Image()
forest_bg.src = 'images/nike.webp'

let bark_img = new Image()
bark_img.src = 'images/bark.png'

// Draws a solid platform as a tree trunk: tiled bark, edge shading for roundness,
// a mossy top edge, and a few decorative stub branches. Collision box is unchanged.
class TreeTrunkComponent {
    constructor(seed) {
        let rng = mulberry32(seed)
        this.pattern = null
        this.moss_drips = []
        for (let i = 0; i < 7; i++) {
            this.moss_drips.push({ x: rng(), w: 0.04 + rng() * 0.08, h: 8 + rng() * 22 })
        }
        this.stubs = []
        let n = 2 + Math.floor(rng() * 2)
        for (let i = 0; i < n; i++) {
            this.stubs.push({
                side: rng() < 0.5 ? -1 : 1,
                dy: 60 + rng() * 260,             // px below the top edge
                scale: 0.35 + rng() * 0.25,       // relative to branch image
                angle: (rng() - 0.3) * 30         // degrees, mostly angled upward
            })
        }
    }

    draw() {
        let d = this.gameobject.physical_properties.dimensions
        let p = this.gameobject.position
        let x = p.x - d.x / 2
        let y = p.y - d.y / 2

        let bark_ready = bark_img.complete && bark_img.naturalWidth > 0
        ctx.save()
        ctx.translate(x, y)
        if (bark_ready) {
            if (this.pattern === null) this.pattern = ctx.createPattern(bark_img, 'repeat')
            ctx.fillStyle = this.pattern
        } else {
            ctx.fillStyle = '#4a3018'
        }
        ctx.fillRect(0, 0, d.x, d.y)

        // Shade the edges so the column reads as cylindrical
        let grad = ctx.createLinearGradient(0, 0, d.x, 0)
        grad.addColorStop(0.00, 'rgba(0,0,0,0.55)')
        grad.addColorStop(0.22, 'rgba(0,0,0,0)')
        grad.addColorStop(0.45, 'rgba(255,220,160,0.08)')
        grad.addColorStop(0.70, 'rgba(0,0,0,0)')
        grad.addColorStop(1.00, 'rgba(0,0,0,0.6)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, d.x, d.y)

        // Mossy top edge with a few drips
        ctx.fillStyle = '#4f7a2a'
        ctx.fillRect(0, 0, d.x, 10)
        for (let i = 0; i < this.moss_drips.length; i++) {
            let m = this.moss_drips[i]
            ctx.fillRect(m.x * d.x, 0, m.w * d.x, m.h)
        }
        ctx.fillStyle = '#7fb14a'
        ctx.fillRect(0, 0, d.x, 3)
        ctx.restore()

        // Stub branches poking out the sides
        if (branch_img.complete && branch_img.naturalWidth > 0) {
            for (let i = 0; i < this.stubs.length; i++) {
                let s = this.stubs[i]
                let w = branch_img.width * s.scale
                let h = branch_img.height * s.scale
                let edge_x = s.side < 0 ? x : x + d.x
                let cx = edge_x + s.side * w * 0.3
                // branch image points right; flip it for the left side
                drawImage(branch_img, cx, y + s.dy, w, h, s.side * s.angle, s.side < 0, false, true)
            }
        }
    }
}

// Small seeded PRNG so trunk decoration is stable across frames and rounds
function mulberry32(seed) {
    let a = seed >>> 0
    return function() {
        a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// A tall solid tree trunk whose top edge sits at `top_y`, reaching down past the death floor.
function trunk(width, center_x, top_y, seed) {
    let height = 1400
    let physics = new PhysicalProperties(new Vector2(0, 0), Infinity, 0, new Vector2(width, height), 1, false)
    return new GameObject(
        new Vector2(center_x, top_y + height / 2),
        physics,
        ['ground'],
        { display: new TreeTrunkComponent(seed) }
    )
}

// Wood cracking sound (CC0: "Cracking wood" by JappeHallunken, freesound.org/s/501302).
// A fresh Audio per play so two cracks close together can overlap instead of cutting each other off.
const branch_crack_src = 'sounds/branch_crack_1.mp3'
const branch_crack_preload = new Audio(branch_crack_src)
function play_wood_crack() {
    new Audio(branch_crack_src).play()
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
const BRANCH_CRACK_LEAD_FRAMES = 45          // 1.5s of cracking before the branch drops
const BRANCH_GAP_MIN_FRAMES = 30             // 1s
const BRANCH_GAP_MAX_FRAMES = 300            // 10s
class ForestHazardSpawner {
    constructor(leaf_interval) {
        this.leaf_interval = leaf_interval
        this.leaf_timer = leaf_interval / 2
        this.branch_timer = 0
        this.branch_interval = this.next_branch_gap()
        this.pending_branches = []            // countdowns for branches that have cracked but not yet dropped
    }

    next_branch_gap() {
        return Math.floor(rand_between(BRANCH_GAP_MIN_FRAMES, BRANCH_GAP_MAX_FRAMES))
    }

    update() {
        this.branch_timer++
        this.leaf_timer++

        // Gaps are measured crack-to-crack, so a new crack can start while an earlier branch is still pending
        if (this.branch_timer >= this.branch_interval) {
            this.branch_timer = 0
            this.branch_interval = this.next_branch_gap()
            play_wood_crack()
            this.pending_branches.push(BRANCH_CRACK_LEAD_FRAMES)
        }

        for (let i = this.pending_branches.length - 1; i >= 0; i--) {
            this.pending_branches[i]--
            if (this.pending_branches[i] <= 0) {
                this.pending_branches.splice(i, 1)
                spawn_branch()
            }
        }

        if (this.leaf_timer >= this.leaf_interval) {
            this.leaf_timer = 0
            this.leaf_interval = Math.floor(rand_between(90, 200))
            spawn_leaf()
        }
    }
}
