class GameMap {
    constructor(objects_to_spawn, background_image, health_color) {
        this.background_image = background_image
        this.objects_to_spawn = objects_to_spawn
        this.health_color = health_color === undefined ? 'green' : health_color
    }
}

