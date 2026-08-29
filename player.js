Array.prototype.rotate = function(n) {
    n = n % this.length;change_approval
    while (this.length && n < 0) n += this.length;
    this.push.apply(this, this.splice(0, n));
    return this;
}

class GestureController {
    // Interprets raw touch data from NetworkControl into game gestures.
    // tap (quick release) = jump
    // hold + move direction = directional ability (fires once when threshold crossed)
    // hold + no move + release = hold ability
    // hold + move + release = holdswipe ability (e.g. teleport)
    constructor(networkControl) {
        this.nc = networkControl
        // Thresholds
        this.TAP_TIME = 10          // max frames for a tap
        this.SWIPE_THRESHOLD = 0.15 // normalized distance to trigger directional ability
        // Internal tracking
        this._touchFrames = 0
        this._gesture = null
        this._wasTouching = false
        this._directionFired = false  // already fired a directional ability this touch
        this._firedDirection = null   // which direction was fired
    }

    x_axis() { return this.nc.axes().x }
    y_axis() { return this.nc.axes().y }
    axes() { return this.nc.axes() }

    _swipeDir(dx, dy) {
        if (Math.abs(dx) > Math.abs(dy)) {
            return dx > 0 ? "right" : "left"
        }
        return dy > 0 ? "down" : "up"
    }

    // Call once per frame before reading gestures
    interpret() {
        this._gesture = null
        const touching = this.nc.touching
        const justReleased = this._wasTouching && !touching

        if (touching) {
            this._touchFrames += dt

            // Check if finger has moved past threshold while held
            if (!this._directionFired) {
                const dx = this.nc.rx - this.nc.startX
                const dy = this.nc.ry - this.nc.startY
                const dist = Math.sqrt(dx * dx + dy * dy)
                if (dist > this.SWIPE_THRESHOLD) {
                    // Hold + move → directional ability fires immediately
                    this._firedDirection = this._swipeDir(dx, dy)
                    this._directionFired = true
                    this._gesture = { type: "swipe", direction: this._firedDirection }
                }
            }
        }

        if (justReleased) {
            if (!this._directionFired && this._touchFrames < this.TAP_TIME) {
                // Quick tap, no movement → jump
                this._gesture = { type: "tap", direction: null }
            } else if (this._directionFired) {
                // Was holding + moved → holdswipe on release
                const dx = this.nc.rx - this.nc.startX
                const dy = this.nc.ry - this.nc.startY
                const dist = Math.sqrt(dx * dx + dy * dy)
                if (dist > this.SWIPE_THRESHOLD) {
                    this._gesture = { type: "holdswipe", direction: this._swipeDir(dx, dy) }
                }
            } else {
                // Held without moving → hold ability
                this._gesture = { type: "hold", direction: null }
            }
            // Reset
            this._touchFrames = 0
            this._directionFired = false
            this._firedDirection = null
        }

        this._wasTouching = touching
    }

    // Returns the gesture detected this frame, or null
    getGesture() { return this._gesture }

    // Tap with no direction = jump
    jump() { return this._gesture && this._gesture.type === "tap" && this._gesture.direction === null }
}

class Ability {
    constructor(func, name, cooldown, start_unlocked, num_uses, multi_use_cooldown) {
        this.func = func
        this.cooldown = cooldown
        this.name = name
        this.start_unlocked = start_unlocked === undefined ? false : start_unlocked
        this.num_uses = num_uses === undefined ? 1 : num_uses
        this.multi_use_cooldown = multi_use_cooldown === undefined ? 0 : multi_use_cooldown

        this.current_cooldown = this.start_unlocked ? cooldown : 0
        this.current_multi_use_cooldown = this.multi_use_cooldown
        this.num_used = 0
    }
    usable() {
        return this.current_cooldown >= this.cooldown && this.current_multi_use_cooldown >= this.multi_use_cooldown
    }
    update() {
        this.current_cooldown += dt
        this.current_multi_use_cooldown += dt
    }
    run(player) {
        if (this.num_used >= this.num_uses - 1) {
            this.use_all()
        } else {
            this.use_single()
        }
        this.func(player)
    }
    use_all() {
        this.current_cooldown = 0
        this.num_used = 0
        this.current_multi_use_cooldown = this.multi_use_cooldown
    }
    use_single() {
        this.num_used++
        this.current_multi_use_cooldown = 0
    }
    restore_all() {
        this.num_used = 0
        this.current_cooldown = this.cooldown
        this.current_multi_use_cooldown = this.multi_use_cooldown
    }
    restore_single() {
        if (this.num_used > 0) { this.num_used-- }
        this.current_cooldown = this.cooldown
        this.current_multi_use_cooldown = this.multi_use_cooldown
    }
}

class PlayerControllerProperties {
    constructor(jump_speed, accel, friction, num_jumps) {
        this.jump_speed = jump_speed
        this.accel = accel
        this.friction = friction
        this.num_jumps = num_jumps
    }
}

const out_of_bounds_dpf = 0.0005
class PlayerControllerComponent {
    constructor(skin, ability_draw_location, controller, abilities, properties, flipped, gestureMapping) {
        this.controller = new GestureController(controller)
        this.abilities = abilities
        this.properties = properties
        this.gestureMapping = gestureMapping || { up: -1, down: -1, left: -1, right: -1, hold: -1 }
        this.jumps_left = 0
        this.jump_was_pressed = false
        this.flip = false
        this.skin = skin
        this.touching_ground = false
        this.speed_factor = 1
        this.flipped = flipped === undefined ? false : flipped
        this.frozen_velocity = new Vector2(0, 0)
        this.ability_draw_location = ability_draw_location
        this.freeze_time = 0
        this.stun_time = 0
        this.tint_time = 0
        this.tint_color = null
        this.charging = false
    }

    draw() {
        ctx.textAlign = 'center'
        ctx.font = "20px serif"
        for(let i = 0; i < this.abilities.length; i++) {
            if (this.abilities[i].usable()) {   
                ctx.fillStyle = 'white';
            } else {
                ctx.fillStyle = 'red';
            }
            ctx.fillText(
                this.abilities[i].name,
                this.ability_draw_location.x,
                this.ability_draw_location.y - i * 20
            )
        }

        let actual_size = this.gameobject.physical_properties.dimensions.vector_scale(this.skin.proportions)
        let actual_position = actual_size.vector_scale(this.skin.offset).add(this.gameobject.position)
        drawImage(
            this.skin.image,
            actual_position.x, 
            actual_position.y,
            actual_size.x,
            actual_size.y,
            0,
            this.flip ^ this.flipped,
            false,
            true
        )

        if (this.freeze_time > 0 || this.stun_time > 0) {
            drawRect(
                this.gameobject.position.x - this.gameobject.physical_properties.dimensions.x / 2,
                this.gameobject.position.y - this.gameobject.physical_properties.dimensions.y / 2,
                this.gameobject.physical_properties.dimensions.x,
                this.gameobject.physical_properties.dimensions.y,
                'rgba(0, 100, 100, 0.5)'
            )
        }

        if (this.tint_time > 0) {
            drawRect(
                this.gameobject.position.x - this.gameobject.physical_properties.dimensions.x / 2,
                this.gameobject.position.y - this.gameobject.physical_properties.dimensions.y / 2,
                this.gameobject.physical_properties.dimensions.x,
                this.gameobject.physical_properties.dimensions.y,
                this.tint_color
            )
        }

        // Charging glow
        if (this.charging) {
            let pulse = 0.3 + 0.2 * Math.sin(performance.now() / 80)
            let dim = this.gameobject.physical_properties.dimensions
            let cx = this.gameobject.position.x
            let cy = this.gameobject.position.y
            let radius = Math.max(dim.x, dim.y) * 0.7
            ctx.save()
            ctx.beginPath()
            ctx.arc(cx, cy, radius, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(100, 180, 255, ' + pulse + ')'
            ctx.fill()
            ctx.restore()
        }

        let circleX = Math.min(Math.max(this.gameobject.position.x, 0), 2000)
        let circleY = Math.min(Math.max(this.gameobject.position.y, 0), 1000)
        if (circleX !== this.gameobject.position.x || circleY !==  this.gameobject.position.y) {
            drawCircle(circleX, circleY, 20, 'white', 'white', 2)
            this.gameobject.components.stats.apply_damage(-out_of_bounds_dpf * this.gameobject.components.health.max_health * dt)
        }
    }

    update() {
        if (this.tint_time > 0) {
            this.tint_time -= dt
        }
        if (this.freeze_time > 0) {
            this.freeze_time -= dt
            this.gameobject.physical_properties.velocity = this.frozen_velocity
            return
        }
        this.gameobject.physical_properties.add_force(this.gameobject.physical_properties.velocity.scale(-this.properties.friction))
        if (this.stun_time > 0) {
            this.stun_time -= dt
            return
        }

        // Interpret raw touch data into gestures
        this.controller.interpret()

        // Charging: finger is down and hasn't fired a directional ability yet
        let nc = this.controller.nc
        this.charging = nc.touching && !this.controller._directionFired

        // Slow down while charging
        if (this.charging) {
            this.gameobject.physical_properties.velocity.x *= 0.85
            this.gameobject.physical_properties.velocity.y *= 0.9
        }

        this.jumped = false
        if (this.controller.jump() && !this.jump_was_pressed && this.jumps_left > 0) {
            this.gameobject.physical_properties.velocity.y = this.properties.jump_speed
            this.gameobject.position.y -= 5
            this.jump_was_pressed = true
            this.jumps_left--
            this.jumped = true
        } else if (!this.controller.jump()) {
            this.jump_was_pressed = false
        }

        if (this.controller.x_axis() < -0.5) {
            this.gameobject.physical_properties.add_force(new Vector2(-this.properties.accel * this.speed_factor, 0))
            this.flip = false
        } 
        if (this.controller.x_axis() > 0.5) {
            this.gameobject.physical_properties.add_force(new Vector2(this.properties.accel * this.speed_factor, 0))
            this.flip = true
        }

        let gesture = this.controller.getGesture()
        if (gesture) {
            let abilityIndex = -1
            if (gesture.type === "swipe" && gesture.direction) {
                // Directional swipe → mapped ability
                abilityIndex = this.gestureMapping[gesture.direction]
            } else if (gesture.type === "hold") {
                // Stationary hold → hold ability
                abilityIndex = this.gestureMapping.hold
            } else if (gesture.type === "holdswipe" && gesture.direction) {
                // Hold then swipe → holdswipe ability (falls back to hold)
                abilityIndex = this.gestureMapping.holdswipe !== undefined
                    ? this.gestureMapping.holdswipe
                    : this.gestureMapping.hold
            }
            if (abilityIndex >= 0 && abilityIndex < this.abilities.length && this.abilities[abilityIndex].usable()) {
                this.abilities[abilityIndex].run(this.gameobject)
            }
        }
        
        for(let i = 0; i < this.abilities.length; i++) {
            this.abilities[i].update()
        }
        if (this.touching_ground) {
            this.jumps_left = this.properties.num_jumps
        }
        this.touching_ground = false
    }

    collision(obj, coll) {
        if ((obj.tags.includes("ground") || obj.tags.includes("player")) && coll.y && obj.position.y >this.gameobject.position.y) {
            this.touching_ground = true
        }
    }

    freeze(time) {
        this.frozen_velocity = this.gameobject.physical_properties.velocity.add(new Vector2(0, 0))
        this.freeze_time += time
    }

    stun(time) {
        this.stun_time += time
    }

    apply_tint(time, tint) {
        this.tint_time = time
        this.tint_color = tint
    }

    get_ability(name) {
        for (let i = 0; i < this.abilities.length; i++) {
            if (this.abilities[i].name === name) {
                return this.abilities[i]
            }
        }
        return null
    }
}

class PlayerStatsComponent {
    constructor(max_health) {
        this.input_damage_scale = 1
        this.output_damage_scale = 1
        this.health_component = new HealthComponent(max_health)
    }

    init() {
        this.gameobject.add_component('health', this.health_component)
    }

    apply_damage(damage) {
        this.health_component.apply_damage(damage * this.input_damage_scale)
    }

    calculate_damage(damage) {
        return damage * this.output_damage_scale
    }
}

class HealthComponent {
    constructor(max_health, display) {
        this.max_health = max_health
        this.health = max_health
        this.display = this.display === undefined ? true : display
    }

    draw() {
        if (this.display) {
            ctx.textAlign = 'left'
            ctx.fillStyle = 'green'
            ctx.font = '30px serif'
            let x = this.gameobject.position.x - this.gameobject.physical_properties.dimensions.x / 2
            let y = this.gameobject.position.y - this.gameobject.physical_properties.dimensions.y
            ctx.fillText(this.health.toFixed(1), x, y)
        }
    }

    apply_damage(damage, input_damage_scale) {
        if (input_damage_scale !== undefined) {
            this.health += damage * input_damage_scale
        } else {
            this.health += damage
        }
        
        if (this.health > this.max_health) {
            this.health = this.max_health
        }
    }

    should_delete() {
        return this.health <= 0
    }
}