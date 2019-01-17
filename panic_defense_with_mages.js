'use strict';

var SPECS = {"COMMUNICATION_BITS":16,"CASTLE_TALK_BITS":8,"MAX_ROUNDS":1000,"TRICKLE_FUEL":25,"INITIAL_KARBONITE":100,"INITIAL_FUEL":500,"MINE_FUEL_COST":1,"KARBONITE_YIELD":2,"FUEL_YIELD":10,"MAX_TRADE":1024,"MAX_BOARD_SIZE":64,"MAX_ID":4096,"CASTLE":0,"CHURCH":1,"PILGRIM":2,"CRUSADER":3,"PROPHET":4,"PREACHER":5,"RED":0,"BLUE":1,"CHESS_INITIAL":100,"CHESS_EXTRA":20,"TURN_MAX_TIME":200,"MAX_MEMORY":50000000,"UNITS":[{"CONSTRUCTION_KARBONITE":null,"CONSTRUCTION_FUEL":null,"KARBONITE_CAPACITY":null,"FUEL_CAPACITY":null,"SPEED":0,"FUEL_PER_MOVE":null,"STARTING_HP":100,"VISION_RADIUS":100,"ATTACK_DAMAGE":null,"ATTACK_RADIUS":null,"ATTACK_FUEL_COST":null,"DAMAGE_SPREAD":null},{"CONSTRUCTION_KARBONITE":50,"CONSTRUCTION_FUEL":200,"KARBONITE_CAPACITY":null,"FUEL_CAPACITY":null,"SPEED":0,"FUEL_PER_MOVE":null,"STARTING_HP":50,"VISION_RADIUS":100,"ATTACK_DAMAGE":null,"ATTACK_RADIUS":null,"ATTACK_FUEL_COST":null,"DAMAGE_SPREAD":null},{"CONSTRUCTION_KARBONITE":10,"CONSTRUCTION_FUEL":50,"KARBONITE_CAPACITY":20,"FUEL_CAPACITY":100,"SPEED":4,"FUEL_PER_MOVE":1,"STARTING_HP":10,"VISION_RADIUS":100,"ATTACK_DAMAGE":null,"ATTACK_RADIUS":null,"ATTACK_FUEL_COST":null,"DAMAGE_SPREAD":null},{"CONSTRUCTION_KARBONITE":20,"CONSTRUCTION_FUEL":50,"KARBONITE_CAPACITY":20,"FUEL_CAPACITY":100,"SPEED":9,"FUEL_PER_MOVE":1,"STARTING_HP":40,"VISION_RADIUS":36,"ATTACK_DAMAGE":10,"ATTACK_RADIUS":[1,16],"ATTACK_FUEL_COST":10,"DAMAGE_SPREAD":0},{"CONSTRUCTION_KARBONITE":25,"CONSTRUCTION_FUEL":50,"KARBONITE_CAPACITY":20,"FUEL_CAPACITY":100,"SPEED":4,"FUEL_PER_MOVE":2,"STARTING_HP":20,"VISION_RADIUS":64,"ATTACK_DAMAGE":10,"ATTACK_RADIUS":[16,64],"ATTACK_FUEL_COST":25,"DAMAGE_SPREAD":0},{"CONSTRUCTION_KARBONITE":30,"CONSTRUCTION_FUEL":50,"KARBONITE_CAPACITY":20,"FUEL_CAPACITY":100,"SPEED":4,"FUEL_PER_MOVE":3,"STARTING_HP":60,"VISION_RADIUS":16,"ATTACK_DAMAGE":20,"ATTACK_RADIUS":[1,16],"ATTACK_FUEL_COST":15,"DAMAGE_SPREAD":3}]};

function insulate(content) {
    return JSON.parse(JSON.stringify(content));
}

class BCAbstractRobot {
    constructor() {
        this._bc_reset_state();
    }

    // Hook called by runtime, sets state and calls turn.
    _do_turn(game_state) {
        this._bc_game_state = game_state;
        this.id = game_state.id;
        this.karbonite = game_state.karbonite;
        this.fuel = game_state.fuel;
        this.last_offer = game_state.last_offer;

        this.me = this.getRobot(this.id);

        if (this.me.turn === 1) {
            this.map = game_state.map;
            this.karbonite_map = game_state.karbonite_map;
            this.fuel_map = game_state.fuel_map;
        }

        try {
            var t = this.turn();
        } catch (e) {
            t = this._bc_error_action(e);
        }

        if (!t) t = this._bc_null_action();

        t.signal = this._bc_signal;
        t.signal_radius = this._bc_signal_radius;
        t.logs = this._bc_logs;
        t.castle_talk = this._bc_castle_talk;

        this._bc_reset_state();

        return t;
    }

    _bc_reset_state() {
        // Internal robot state representation
        this._bc_logs = [];
        this._bc_signal = 0;
        this._bc_signal_radius = 0;
        this._bc_game_state = null;
        this._bc_castle_talk = 0;
        this.me = null;
        this.id = null;
        this.fuel = null;
        this.karbonite = null;
        this.last_offer = null;
    }

    // Action template
    _bc_null_action() {
        return {
            'signal': this._bc_signal,
            'signal_radius': this._bc_signal_radius,
            'logs': this._bc_logs,
            'castle_talk': this._bc_castle_talk
        };
    }

    _bc_error_action(e) {
        var a = this._bc_null_action();
        
        if (e.stack) a.error = e.stack;
        else a.error = e.toString();

        return a;
    }

    _bc_action(action, properties) {
        var a = this._bc_null_action();
        if (properties) for (var key in properties) { a[key] = properties[key]; }
        a['action'] = action;
        return a;
    }

    _bc_check_on_map(x, y) {
        return x >= 0 && x < this._bc_game_state.shadow[0].length && y >= 0 && y < this._bc_game_state.shadow.length;
    }
    
    log(message) {
        this._bc_logs.push(JSON.stringify(message));
    }

    // Set signal value.
    signal(value, radius) {
        // Check if enough fuel to signal, and that valid value.

        if (this.fuel < radius) throw "Not enough fuel to signal given radius.";
        if (!Number.isInteger(value) || value < 0 || value >= Math.pow(2,SPECS.COMMUNICATION_BITS)) throw "Invalid signal, must be int within bit range.";
        if (radius > 2*Math.pow(SPECS.MAX_BOARD_SIZE-1,2)) throw "Signal radius is too big.";

        this._bc_signal = value;
        this._bc_signal_radius = radius;

        this.fuel -= radius;
    }

    // Set castle talk value.
    castleTalk(value) {
        // Check if enough fuel to signal, and that valid value.

        if (!Number.isInteger(value) || value < 0 || value >= Math.pow(2,SPECS.CASTLE_TALK_BITS)) throw "Invalid castle talk, must be between 0 and 2^8.";

        this._bc_castle_talk = value;
    }

    proposeTrade(karbonite, fuel) {
        if (this.me.unit !== SPECS.CASTLE) throw "Only castles can trade.";
        if (!Number.isInteger(karbonite) || !Number.isInteger(fuel)) throw "Must propose integer valued trade."
        if (Math.abs(karbonite) >= SPECS.MAX_TRADE || Math.abs(fuel) >= SPECS.MAX_TRADE) throw "Cannot trade over " + SPECS.MAX_TRADE + " in a given turn.";

        return this._bc_action('trade', {
            trade_fuel: fuel,
            trade_karbonite: karbonite
        });
    }

    buildUnit(unit, dx, dy) {
        if (this.me.unit !== SPECS.PILGRIM && this.me.unit !== SPECS.CASTLE && this.me.unit !== SPECS.CHURCH) throw "This unit type cannot build.";
        if (this.me.unit === SPECS.PILGRIM && unit !== SPECS.CHURCH) throw "Pilgrims can only build churches.";
        if (this.me.unit !== SPECS.PILGRIM && unit === SPECS.CHURCH) throw "Only pilgrims can build churches.";
        
        if (!Number.isInteger(dx) || !Number.isInteger(dx) || dx < -1 || dy < -1 || dx > 1 || dy > 1) throw "Can only build in adjacent squares.";
        if (!this._bc_check_on_map(this.me.x+dx,this.me.y+dy)) throw "Can't build units off of map.";
        if (this._bc_game_state.shadow[this.me.y+dy][this.me.x+dx] > 0) throw "Cannot build on occupied tile.";
        if (!this.map[this.me.y+dy][this.me.x+dx]) throw "Cannot build onto impassable terrain.";
        if (this.karbonite < SPECS.UNITS[unit].CONSTRUCTION_KARBONITE || this.fuel < SPECS.UNITS[unit].CONSTRUCTION_FUEL) throw "Cannot afford to build specified unit.";

        return this._bc_action('build', {
            dx: dx, dy: dy,
            build_unit: unit
        });
    }

    move(dx, dy) {
        if (this.me.unit === SPECS.CASTLE || this.me.unit === SPECS.CHURCH) throw "Churches and Castles cannot move.";
        if (!this._bc_check_on_map(this.me.x+dx,this.me.y+dy)) throw "Can't move off of map.";
        if (this._bc_game_state.shadow[this.me.y+dy][this.me.x+dx] === -1) throw "Cannot move outside of vision range.";
        if (this._bc_game_state.shadow[this.me.y+dy][this.me.x+dx] !== 0) throw "Cannot move onto occupied tile.";
        if (!this.map[this.me.y+dy][this.me.x+dx]) throw "Cannot move onto impassable terrain.";

        var r = Math.pow(dx,2) + Math.pow(dy,2);  // Squared radius
        if (r > SPECS.UNITS[this.me.unit]['SPEED']) throw "Slow down, cowboy.  Tried to move faster than unit can.";
        if (this.fuel < r*SPECS.UNITS[this.me.unit]['FUEL_PER_MOVE']) throw "Not enough fuel to move at given speed.";

        return this._bc_action('move', {
            dx: dx, dy: dy
        });
    }

    mine() {
        if (this.me.unit !== SPECS.PILGRIM) throw "Only Pilgrims can mine.";
        if (this.fuel < SPECS.MINE_FUEL_COST) throw "Not enough fuel to mine.";
        
        if (this.karbonite_map[this.me.y][this.me.x]) {
            if (this.me.karbonite >= SPECS.UNITS[SPECS.PILGRIM].KARBONITE_CAPACITY) throw "Cannot mine, as at karbonite capacity.";
        } else if (this.fuel_map[this.me.y][this.me.x]) {
            if (this.me.fuel >= SPECS.UNITS[SPECS.PILGRIM].FUEL_CAPACITY) throw "Cannot mine, as at fuel capacity.";
        } else throw "Cannot mine square without fuel or karbonite.";

        return this._bc_action('mine');
    }

    give(dx, dy, karbonite, fuel) {
        if (dx > 1 || dx < -1 || dy > 1 || dy < -1 || (dx === 0 && dy === 0)) throw "Can only give to adjacent squares.";
        if (!this._bc_check_on_map(this.me.x+dx,this.me.y+dy)) throw "Can't give off of map.";
        if (this._bc_game_state.shadow[this.me.y+dy][this.me.x+dx] <= 0) throw "Cannot give to empty square.";
        if (karbonite < 0 || fuel < 0 || this.me.karbonite < karbonite || this.me.fuel < fuel) throw "Do not have specified amount to give.";

        return this._bc_action('give', {
            dx:dx, dy:dy,
            give_karbonite:karbonite,
            give_fuel:fuel
        });
    }

    attack(dx, dy) {
        if (this.me.unit !== SPECS.CRUSADER && this.me.unit !== SPECS.PREACHER && this.me.unit !== SPECS.PROPHET) throw "Given unit cannot attack.";
        if (this.fuel < SPECS.UNITS[this.me.unit].ATTACK_FUEL_COST) throw "Not enough fuel to attack.";
        if (!this._bc_check_on_map(this.me.x+dx,this.me.y+dy)) throw "Can't attack off of map.";
        if (this._bc_game_state.shadow[this.me.y+dy][this.me.x+dx] === -1) throw "Cannot attack outside of vision range.";
        if (!this.map[this.me.y+dy][this.me.x+dx]) throw "Cannot attack impassable terrain.";

        var r = Math.pow(dx,2) + Math.pow(dy,2);
        if (r > SPECS.UNITS[this.me.unit]['ATTACK_RADIUS'][1] || r < SPECS.UNITS[this.me.unit]['ATTACK_RADIUS'][0]) throw "Cannot attack outside of attack range.";

        return this._bc_action('attack', {
            dx:dx, dy:dy
        });
        
    }


    // Get robot of a given ID
    getRobot(id) {
        if (id <= 0) return null;
        for (var i=0; i<this._bc_game_state.visible.length; i++) {
            if (this._bc_game_state.visible[i].id === id) {
                return insulate(this._bc_game_state.visible[i]);
            }
        } return null;
    }

    // Check if a given robot is visible.
    isVisible(robot) {
        return ('x' in robot);
    }

    // Check if a given robot is sending you radio.
    isRadioing(robot) {
        return robot.signal >= 0;
    }

    // Get map of visible robot IDs.
    getVisibleRobotMap() {
        return this._bc_game_state.shadow;
    }

    // Get boolean map of passable terrain.
    getPassableMap() {
        return this.map;
    }

    // Get boolean map of karbonite points.
    getKarboniteMap() {
        return this.karbonite_map;
    }

    // Get boolean map of impassable terrain.
    getFuelMap() {
        return this.fuel_map;
    }

    // Get a list of robots visible to you.
    getVisibleRobots() {
        return this._bc_game_state.visible;
    }

    turn() {
        return null;
    }
}

/*

Queue.js

A function to represent a queue

Created by Kate Morley - http://code.iamkate.com/ - and released under the terms
of the CC0 1.0 Universal legal code:

http://creativecommons.org/publicdomain/zero/1.0/legalcode

*/

/* Creates a new queue. A queue is a first-in-first-out (FIFO) data structure -
 * items are added to the end of the queue and removed from the front.
 */
function Queue() {

  // initialise the queue and offset
  var queue = [];
  var offset = 0;

  // Returns the length of the queue.
  this.getLength = function () {
    return (queue.length - offset);
  };

  // Returns true if the queue is empty, and false otherwise.
  this.isEmpty = function () {
    return (queue.length == 0);
  };

  /* Enqueues the specified item. The parameter is:
   *
   * item - the item to enqueue
   */
  this.enqueue = function (item) {
    queue.push(item);
  };

  /* Dequeues an item and returns it. If the queue is empty, the value
   * 'undefined' is returned.
   */
  this.dequeue = function () {

    // if the queue is empty, return immediately
    if (queue.length == 0) return undefined;

    // store the item at the front of the queue
    var item = queue[offset];

    // increment the offset and remove the free space if necessary
    if (++offset * 2 >= queue.length) {
      queue = queue.slice(offset);
      offset = 0;
    }

    // return the dequeued item
    return item;

  };

  /* Returns the item at the front of the queue (without dequeuing it). If the
   * queue is empty then undefined is returned.
   */
  this.peek = function () {
    return (queue.length > 0 ? queue[offset] : undefined);
  };

}

// var q = new Queue();

// q.enqueue('item');
// var x = q.dequeue();
// console.log(x);

// export default {Queue};

function addPair(a, b) {
    return {
        x: a.x + b.x,
        y: a.y + b.y
    };
}

function subtractPair(a, b) {
    return {
        x: a.x - b.x,
        y: a.y - b.y
    };
}

function sqDist(a, b) {
    return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
}

function pairEq(a, b) {
    return a.x === b.x && a.y === b.y;
}

function pairToString(p) {
    return "(" + p.x + ", " + p.y + ")";
}

function empty(loc, map, robots = null) {
    if (loc.x < 0 || loc.y < 0 || loc.x >= map.length || loc.y >= map.length)
        return false;
    return map[loc.y][loc.x] && (robots === null || robots[loc.y][loc.x] <= 0);
}

// TODO: when stuck, perform full bfs treating robot positions as fixed
function bfs(start, map) {
    let q = new Queue();
    let visited = new Array(map.length);
    let dist = new Array(map.length);
    for (let i = 0; i < map.length; i++) {
        visited[i] = new Array(map.length).fill(false);
        dist[i] = new Array(map.length).fill(1000000);
    }
    q.enqueue(start);
    visited[start.y][start.x] = true;
    dist[start.y][start.x] = 0;
    while (!q.isEmpty()) {
        let v = q.dequeue();
        let adj = [[1, 0], [0, 1], [-1, 0], [0, -1]];
        for (let i = 0; i < 4; i++) {
            let u = { x: v.x + adj[i][0], y: v.y + adj[i][1] };
            if (empty(u, map) && !visited[u.y][u.x]) {
                q.enqueue(u);
                visited[u.y][u.x] = true;
                dist[u.y][u.x] = dist[v.y][v.x] + 1;
            }
        }
    }
    return dist;
}

function move(loc, bfsGrid, map, robots, speed, forceMove = false) {
    let minDist = 1000000;
    let minCost = 1000000;
    let bestMove = { x: -100, y: -100 };
    for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
            let next = { x: loc.x + dx, y: loc.y + dy };
            if (sqDist(loc, next) <= speed && (empty(next, map, robots) || (dx === 0 && dy === 0 && !forceMove))) {
                // prioritize fast over cost
                if (bfsGrid[next.y][next.x] < minDist || (bfsGrid[next.y][next.x] === minDist && sqDist(loc, next) < minCost)) {
                    minDist = bfsGrid[next.y][next.x];
                    minCost = sqDist(loc, next);
                    bestMove = { x: dx, y: dy };
                }
            }
        }
    }
    return bestMove;
}

function norm(v) {
    return v.x * v.x + v.y * v.y;
}

const shifts = [
    { x: -1, y: -1 },
    { x: -1, y: 0 },
    { x: -1, y: 1 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: 1, y: -1 },
    { x: 1, y: 0 },
    { x: 1, y: 1 }
];

function hashShift(shift) {
    for (let i = 0; i < 8; i++) {
        if (pairEq(shifts[i], shift)) {
            return i;
        }
    }
}

function unhashShift(hash) {
    return shifts[hash];
}

// for sorting targetKarb and targetFuel
function customSort(a, b) {
    if (a.dist !== b.dist)
        return a.dist - b.dist;
    else if (a.assignedCastle !== b.assignedCastle)
        return a.assignedCastle - b.assignedCastle;
    else if (a.pos.x !== b.pos.x)
        return a.pos.x - b.pos.x;
    else
        return a.pos.y - b.pos.y;
}

function compareDist(a, b){
    if (norm(a.relPos) !== norm(b.relPos))
        return a.relPos - b.relPos;
    else
        return b.unitType - a.unitType;
}

function copyPair(p) {
    return {x:p.x, y:p.y};
}

// export default { addPair, sqDist, findClosestKarbonite, findClosestFuel, findClosestPosition };

class MyRobot extends BCAbstractRobot {
    canBuild(unitType) {
        return (this.karbonite >= SPECS.UNITS[unitType].CONSTRUCTION_KARBONITE && this.fuel >= SPECS.UNITS[unitType].CONSTRUCTION_FUEL);
    }

    hasSpaceAround() {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (empty({ x: this.loc.x + dx, y: this.loc.y + dy }, this.map, this.getVisibleRobotMap())) {
                    return true;
                }
            }
        }
        return false;
    }

    // buildAround(unitType) {
    //     for (let dx = -1; dx <= 1; dx++) {
    //         for (let dy = -1; dy <= 1; dy++) {
    //             if (empty({ x: this.loc.x + dx, y: this.loc.y + dy }, this.map, this.getVisibleRobotMap())) {
    //                 return this.buildUnit(unitType, dx, dy);
    //             }
    //         }
    //     }
    // }

    findSymmetry() {
        for (let x = 0; x < this.map.length; x++) {
            for (let y = 0; y < this.map.length; y++) {
                if (this.map[y][x] !== this.map[y][this.map.length - x - 1]
                    || this.karbonite_map[y][x] !== this.karbonite_map[y][this.map.length - x - 1]
                    || this.fuel_map[y][x] !== this.fuel_map[y][this.map.length - x - 1]) {
                    this.symmetry = "y";
                    return;
                }
            }
        }
        for (let x = 0; x < this.map.length; x++) {
            for (let y = 0; y < this.map.length; y++) {
                if (this.map[y][x] !== this.map[this.map.length - y - 1][x]
                    || this.karbonite_map[y][x] !== this.karbonite_map[this.map.length - y - 1][x]
                    || this.fuel_map[y][x] !== this.fuel_map[this.map.length - y - 1][x]) {
                    this.symmetry = "x";
                    return;
                }
            }
        }
        // should also check if two of your castles are reflections of each other
        this.symmetry = "xy";
    }

    reflect(pt) {
        if (this.symmetry === "x" || this.symmetry === "xy") {
            return { x: pt.x, y: this.map.length - pt.y - 1 };
        }
        else {
            return { x: this.map.length - pt.x - 1, y: pt.y };
        }
    }

    assignAreaToCastles() {
        let area = [];
        for (let x = 0; x < this.map.length; x++)
            area.push(new Array(this.map.length));
        this.castleBFS = [];
        this.enemyCastleBFS = [];
        for (let i = 0; i < this.castles.length; i++) {
            this.castleBFS.push(bfs(this.castlePos[i], this.map));
            this.enemyCastleBFS.push(bfs(this.enemyCastlePos[i], this.map));
        }
        for (let x = 0; x < this.map.length; x++) {
            for (let y = 0; y < this.map.length; y++) {
                let yourMinDist = 1000000;
                let yourBestCastle = -1;
                for (let i = 0; i < this.castles.length; i++) {
                    if (this.castleBFS[i][y][x] < yourMinDist) {
                        yourBestCastle = i;
                        yourMinDist = this.castleBFS[i][y][x];
                    }
                }
                let enemyMinDist = 1000000;
                let enemyBestCastle = -1;
                for (let i = 0; i < this.enemyCastlePos.length; i++) {
                    if (this.enemyCastleBFS[i][y][x] < enemyMinDist) {
                        enemyBestCastle = i;
                        enemyMinDist = this.enemyCastleBFS[i][y][x];
                    }
                }
                if (yourMinDist < enemyMinDist) {
                    area[y][x] = { team: this.me.team, castle: yourBestCastle, dist: yourMinDist };
                }
                else if (enemyMinDist < yourMinDist) {
                    area[y][x] = { team: this.me.team ^ 1, castle: enemyBestCastle, dist: enemyMinDist }; // combine into -enemyBestCastle?
                }
                else {
                    area[y][x] = { team: -1, castle: yourBestCastle, dist: yourMinDist };
                }
            }
        }
        return area;
    }

    // information taken from lastCreated
    queueInitSignal(priority = false) {
        if (this.lastCreated === null) {
            return;
        }
        if (this.lastCreated[0] === SPECS.PILGRIM) {
            let hash = 1 << 15; // meant for newest robot
            let shift = this.lastCreated[1];
            hash |= hashShift(shift) << 12; // bits 12-14 specify position relative to castle
            hash |= this.castles.length << 10; // bits 10-11 say how many castles there are, so the new unit knows how long to stay
            hash |= (this.castleNumber + 1) << 8; // bits 8-9 say which castle this is. extra castle positions are listed in increasing order of castle number
            hash |= this.churches.length << 6; // bits 6-7 say how many churches there are. Note that we can't have over 3 churches.
            // specify pilgrim goal
            if (this.lastCreated[2] === "fuel") {
                hash |= 1 << 4;
            }
            hash |= this.lastCreated[3];
            if (priority) {
                this.prioritySignalQueue.enqueue({ signal: hash, dist: norm(shift) });
            }
            else {
                this.signalQueue.enqueue({ signal: hash, dist: norm(shift) });
            }

            for (let i = 0; i < this.castles.length; i++) {
                if (i === this.castleNumber)
                    continue;
                hash = 1 << 15;
                hash |= hashShift(shift) << 12;
                hash |= this.castlePos[i].x << 6;
                hash |= this.castlePos[i].y;
                if (priority)
                    this.prioritySignalQueue.enqueue({ signal: hash, dist: norm(shift) });
                else
                    this.signalQueue.enqueue({ signal: hash, dist: norm(shift) });
            }
        }
        else if (this.lastCreated[0] === SPECS.PREACHER) {
            this.log("Queueing mage init signal");
            let hash = 1 << 15; // meant for newest robot
            let shift = this.lastCreated[1];
            this.log("Shift: " + pairToString(shift));
            this.log("Distance: " + norm(shift));
            hash |= hashShift(shift) << 12; // bits 12-14 specify position relative to castle
            if (this.lastCreated[2] === "defense") {
                hash |= 1 << 11; // bit 11 specifies whether mage should defend or attack
            }
            hash |= Number(this.lastCreated[3]) << 10; // bit 10 says whether mage should go fast or not
            hash |= (this.lastCreated[4].x + 16) << 5; // specify shifted relative x-coord of enemy
            hash |= this.lastCreated[4].y + 16; // specify shifted relative y-coord of enemy
            if (priority)
                this.prioritySignalQueue.enqueue({ signal: hash, dist: norm(shift) });
            else
                this.signalQueue.enqueue({ signal: hash, dist: norm(shift) });
        }
    }

    sendSignal() {
        if (this.alreadySignaled) {
            this.log("ERROR! Tried to signal twice in the same turn");
            return;
        }
        if (this.prioritySignalQueue.isEmpty() && this.signalQueue.isEmpty())
            return;

        let message = 0; // will be overwritten
        if (!this.prioritySignalQueue.isEmpty()) {
            if (this.fuel < this.prioritySignalQueue.peek().dist) {
                this.log("Not enough fuel to send message of distance " + this.prioritySignalQueue.peek().dist);
                return; // must save up fuel
            }
            message = this.prioritySignalQueue.dequeue();
        }
        else {
            if (this.fuel < this.signalQueue.peek().dist) {
                this.log("Not enough fuel to send message of distance " + this.signalQueue.peek().dist);
                return; // must save up fuel
            }
            message = this.signalQueue.dequeue();
        }
        this.log("Sending signal " + message.signal);
        this.signal(message.signal, message.dist);
        this.alreadySignaled = true;
    }

    // consider sorting by sqDist if bfsDist is equal, to reduce travel cost
    // need to update all targetKarb for new structure
    initResourceList() {
        this.targetKarb = [];
        this.targetFuel = [];
        for (let x = 0; x < this.map.length; x++) {
            for (let y = 0; y < this.map.length; y++) {
                if (this.karbonite_map[y][x]) {
                    if (this.assignedArea[y][x].team === this.me.team) {
                        this.targetKarb.push({
                            dist: this.assignedArea[y][x].dist,
                            assignedCastle: this.assignedArea[y][x].castle,
                            pos: { x: x, y: y },
                            assignedWorker: -1 // only used for castles, not pilgrims
                        });
                    }
                }
                if (this.fuel_map[y][x]) {
                    if (this.assignedArea[y][x].team === this.me.team) {
                        this.targetFuel.push({
                            dist: this.assignedArea[y][x].dist,
                            assignedCastle: this.assignedArea[y][x].castle,
                            pos: { x: x, y: y },
                            assignedWorker: -1
                        });
                    }
                }
            }
        }

        this.targetKarb.sort(customSort);
        this.targetFuel.sort(customSort);
        while (this.targetKarb.length > this.maxKarbPilgrims) {
            this.targetKarb.pop();
        }
        while (this.targetFuel.length > this.maxFuelPilgrims) {
            this.targetFuel.pop();
        }
    }

    karbGoalStatus(goal) {
        let goalReached = true;
        let canHelp = false;
        for (let i = 0; i < Math.min(this.targetKarb.length, goal); i++) {
            if (this.targetKarb[i].assignedWorker === -1) {
                goalReached = false;
                if (this.targetKarb[i].assignedCastle === this.castleNumber)
                    canHelp = true;
            }
        }
        return { reached: goalReached, canHelp: canHelp };
    }

    fuelGoalStatus(goal) {
        let goalReached = true;
        let canHelp = false;
        for (let i = 0; i < Math.min(this.targetFuel.length, goal); i++) {
            if (this.targetFuel[i].assignedWorker === -1) {
                goalReached = false;
                if (this.targetFuel[i].assignedCastle === this.castleNumber)
                    canHelp = true;
            }
        }
        return { reached: goalReached, canHelp: canHelp };
    }

    canMaintainBuffer(unitType) {
        return (this.karbonite - SPECS.UNITS[unitType].CONSTRUCTION_KARBONITE >= this.karbBuffer
            && this.fuel - SPECS.UNITS[unitType].CONSTRUCTION_FUEL >= this.fuelBuffer);
    }

    // for castles only
    // for addNewUnits
    knownID(id) {
        return (this.castles.includes(id) || this.churches.includes(id)
            || this.karbPilgrims.includes(id) || this.fuelPilgrims.includes(id)
            || this.crusaders.includes(id) || this.prophets.includes(id) || this.preachers.includes(id));
    }

    // for castles only
    addNewUnits(visible) {
        for (let i = 0; i < visible.length; i++) {
            let r = visible[i];
            if (r.team === this.me.team && (r.castle_talk >> 7)) {
                if (this.knownID(r.id))
                    continue;
                // newly created robot
                this.log("Notified of a new robot!");
                let message = r.castle_talk;
                let unitType = ((message >> 5) & ((1 << 2) - 1)) + 2;
                if (unitType === SPECS.PILGRIM) {
                    if ((message >> 4) & 1) { // fuel pilgrim
                        this.log("It's a fuel pilgrim with id " + r.id);
                        this.fuelPilgrims.push(r.id);
                        let fuelID = message & ((1 << 4) - 1);
                        this.log("It targets fuel #" + fuelID);
                        this.targetFuel[fuelID].assignedWorker = r.id;
                    }
                    else {
                        this.log("It's a karb pilgrim with id " + r.id);
                        this.karbPilgrims.push(r.id);
                        let karbID = message & ((1 << 4) - 1);
                        this.log("It targets karb #" + karbID);
                        this.targetKarb[karbID].assignedWorker = r.id;
                    }
                }
                else if (unitType === SPECS.CRUSADER) {
                    this.crusaders.push(r.id);
                }
                else if (unitType === SPECS.PROPHET) {
                    this.prophets.push(r.id);
                }
                else if (unitType === SPECS.PREACHER) {
                    this.preachers.push(r.id);
                }
                else {
                    this.log("ERROR! When adding new unit, unitType is invalid");
                }
            }
        }
    }

    updateUnitList(unitList, visible) {
        unitList = unitList.filter((id) => {
            for (let i = 0; i < visible.length; i++) {
                if (id === visible[i].id)
                    return true;
            }
            return false;
        });
    }

    updateAllUnitLists(visible) {
        // check deaths
        let updatedKarbPilgrims = [];
        for (let i = 0; i < this.targetKarb.length; i++) {
            let id = this.targetKarb[i].assignedWorker;
            if (id > 0) {
                let stillAlive = false;
                for (let j = 0; j < visible.length; j++) {
                    if (id === visible[j].id) {
                        stillAlive = true;
                    }
                }
                if (stillAlive) {
                    updatedKarbPilgrims.push(id);
                }
                else {
                    this.targetKarb[i].assignedWorker = -1;
                }
            }
        }
        this.karbPilgrims = updatedKarbPilgrims;

        let updatedFuelPilgrims = [];
        for (let i = 0; i < this.targetFuel.length; i++) {
            let id = this.targetFuel[i].assignedWorker;
            if (id > 0) {
                let stillAlive = false;
                for (let j = 0; j < visible.length; j++) {
                    if (id === visible[j].id) {
                        stillAlive = true;
                    }
                }
                if (stillAlive) {
                    updatedFuelPilgrims.push(id);
                }
                else {
                    this.targetFuel[i].assignedWorker = -1;
                }
            }
        }
        this.FuelPilgrims = updatedFuelPilgrims;

        this.updateUnitList(this.churches, visible);
        this.updateUnitList(this.crusaders, visible);
        this.updateUnitList(this.prophets, visible);
        this.updateUnitList(this.preachers, visible);

        // check new units
        this.addNewUnits(visible);

        // add new way of finding newly build churches via pilgrim castleTalk
    }

    // TODO: if new unit gets killed when assignedWorker = 0, need to replace 
    buildKarbPilgrim() {
        // is min necessary when desired is always at most targetKarb.length?
        for (let i = 0; i < Math.min(this.targetKarb.length, this.desiredKarbPilgrims); i++) {
            if (this.targetKarb[i].assignedCastle === this.castleNumber
                && this.targetKarb[i].assignedWorker === -1) {
                // found first needed karb pilgrim
                this.targetKarb[i].assignedWorker = 0; // 0 means pilgrim exists but id unknown

                // make clone instead of reference
                let destination = copyPair(this.targetKarb[i].pos);

                // choose best starting placement around castle
                let minDist = 1000000;
                let bestShift = { x: -100, y: -100 };
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        let shift = { x: dx, y: dy };
                        let pos = addPair(this.loc, shift);
                        if (empty(pos, this.map, this.getVisibleRobotMap())) {
                            if (sqDist(pos, destination) < minDist) {
                                minDist = sqDist(pos, destination);
                                bestShift = shift;
                            }
                        }
                    }
                }

                this.log("Buliding Karb Pilgrim at " + pairToString(addPair(this.loc, bestShift))
                    + " to target karb #" + i + " at " + pairToString(destination));

                this.lastCreated = [SPECS.PILGRIM, bestShift, "karb", i];
                this.queueInitSignal();
                this.sendSignal();
                return this.buildUnit(SPECS.PILGRIM, bestShift.x, bestShift.y);
            }
        }
        this.log("ERROR! Tried to build karb pilgrim when desired number is already reached");
    }

    // TODO: if new unit gets killed when assignedWorker = 0, need to replace 
    buildFuelPilgrim() {
        // is min necessary when desired is always at most targetFuel.length?
        for (let i = 0; i < Math.min(this.targetFuel.length, this.desiredFuelPilgrims); i++) {
            if (this.targetFuel[i].assignedCastle === this.castleNumber
                && this.targetFuel[i].assignedWorker === -1) {
                // found first needed fuel pilgrim
                this.targetFuel[i].assignedWorker = 0; // 0 means pilgrim exists but id unknown

                // make clone instead of reference
                let destination = copyPair(this.targetFuel[i].pos);

                // choose best starting placement around castle
                let minDist = 1000000;
                let bestPos = { x: -1, y: -1 };
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        let pos = { x: this.loc.x + dx, y: this.loc.y + dy };
                        // this.log("Starting placement in consideration: " + pairToString(pos));
                        if (empty(pos, this.map, this.getVisibleRobotMap())) {
                            if (sqDist(pos, destination) < minDist) {
                                minDist = sqDist(pos, destination);
                                bestPos = pos;
                            }
                        }
                    }
                }

                this.log("Buliding Fuel Pilgrim at " + pairToString(bestPos)
                    + " to target fuel #" + i + " at " + pairToString(destination));
                let shift = subtractPair(bestPos, this.loc);
                this.lastCreated = [SPECS.PILGRIM, shift, "fuel", i];
                this.queueInitSignal();
                this.sendSignal();
                return this.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
            }
        }
    }

    enoughFuelToMove(chosenMove) {
        return this.fuel >= norm(chosenMove) * SPECS.UNITS[this.me.unit].FUEL_PER_MOVE;
    }

    buildDefenseMage(enemy) { // enemy.relPos is relative position to castle
        this.log("Building defense mage to protect against enemy at "
            + pairToString(addPair(this.loc, enemy.relPos)));
        let minDist = 1000000;
        let bestShift = { x: -100, y: -100 };
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                let shift = { x: dx, y: dy };
                let pos = addPair(this.loc, shift);
                this.log("Considering position " + pairToString(pos));
                if (empty(pos, this.map, this.getVisibleRobotMap())) {
                    this.log("Not empty");
                    if (sqDist(shift, enemy.relPos) < minDist) {
                        this.log("Closest distance so far");
                        bestShift = shift;
                        minDist = sqDist(shift, enemy.relPos);
                    }
                }
            }
        }
        if (pairEq(bestShift, { x: -100, y: -100 })) {
            this.log("Nowhere to place new mage");
            return;
        }
        this.lastCreated = [
            SPECS.PREACHER,
            bestShift,
            "defense",
            (enemy.unitType === SPECS.PROPHET),
            copyPair(enemy.relPos)
        ];
        this.queueInitSignal(true);
        this.sendSignal();
        return this.buildUnit(SPECS.PREACHER, bestShift.x, bestShift.y);
    }

    pilgrimInit() {
        this.log("Initializing pilgrim");
        this.findSymmetry();
        this.enemyCastlePos = [];
        for (let i = 0; i < this.castles.length; i++) {
            this.enemyCastlePos.push(this.reflect(this.castlePos[i]));
        }
        this.assignedArea = this.assignAreaToCastles();
        this.initResourceList();
        // this.log("Target karb right after initializing it");
        // this.log(this.targetKarb);
        if (this.targetResource === "karb") {
            this.targetMine = copyPair(this.targetKarb[this.targetID].pos);
        }
        else {
            this.targetMine = copyPair(this.targetFuel[this.targetID].pos);
        }
        this.bfsFromBase = bfs(this.base, this.map);
        // this.log("Original target mine: " + pairToString(this.targetKarb[this.targetID].pos));
        // this.log("Target mine: " + pairToString(this.targetMine));
        this.bfsFromMine = bfs(this.targetMine, this.map);
        this.log("I am a pilgrim that just got initialized");
        this.log("Target Resource: " + this.targetResource);
        this.log("Base castle: " + pairToString(this.base));
        this.log("Target Mine: " + pairToString(this.targetMine));
    }

    hasUnit(x, y, unitType) {
        if (x < 0 || y < 0 || x >= this.map.length || y >= this.map.length)
            return false;
        if (this.getVisibleRobotMap()[y][x] > 0) {
            let r = this.getRobot(this.getVisibleRobotMap()[y][x]);
            if (r.team === this.me.team && r.unit === unitType)
                return true;
        }
        return false;
    }

    pilgrimDontDoNothing() {
        this.log("Trying to not do nothing");
        // if (this.karbonite_map[this.loc.y][this.loc.x]){
        //     this.log("I'm standing on a karb mine!");
        // }
        // if (this.fuel_map[this.loc.y][this.loc.x]) {
        //     this.log("I'm standing on a fuel mine!");
        //     if (this.me.fuel < SPECS.UNITS[this.me.unit].FUEL_CAPACITY)
        //         this.log("I'm not carrying my max fuel, so I should mine it");
        //     if (this.fuel >= SPECS.MINE_FUEL_COST) 
        //         this.log("My team has enough fuel for me to use this.mine()");
        // }
        if (this.karbonite_map[this.loc.y][this.loc.x]
            && this.me.karbonite < SPECS.UNITS[this.me.unit].KARBONITE_CAPACITY
            && this.fuel >= SPECS.MINE_FUEL_COST) {
            this.lastMoveNothing = false;
            this.log("Mining random karb mine");
            if (this.state !== "waiting for castle locations" && this.targetResource === "karb") {
                if (this.me.karbonite + SPECS.KARBONITE_YIELD >= SPECS.UNITS[this.me.unit].KARBONITE_CAPACITY) {
                    // accidentally mined all of target karb from another mine
                    this.state = "going to base";
                }
            }
            return this.mine();
        }
        if (this.fuel_map[this.loc.y][this.loc.x]
            && this.me.fuel < SPECS.UNITS[this.me.unit].FUEL_CAPACITY
            && this.fuel >= SPECS.MINE_FUEL_COST) {
            this.lastMoveNothing = false;
            this.log("Mining random fuel mine");
            if (this.state !== "waiting for castle locations" && this.targetResource === "fuel") {
                if (this.me.fuel + SPECS.FUEL_YIELD >= SPECS.UNITS[this.me.unit].FUEL_CAPACITY) {
                    // accidentally mined all of target fuel from another mine
                    this.state = "going to base";
                }
            }
            return this.mine();
        }
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (this.hasUnit(this.loc.x + dx, this.loc.y + dy, SPECS.CASTLE)
                    || this.hasUnit(this.loc.x + dx, this.loc.y + dy, SPECS.CHURCH)) {
                    if (this.me.karbonite > 0 || this.me.fuel > 0) {
                        this.lastMoveNothing = false;
                        this.log("Depositing resources at random castle/church");
                        return this.give(dx, dy, this.me.karbonite, this.me.fuel);
                    }
                }
            }
        }
        this.lastMoveNothing = true;
        this.log("I wasted my turn");
        return;
    }

    findEnemies(visible) {
        let enemyUnits = [];
        for (let i = 0; i < visible.length; i++) {
            let r = visible[i];
            if (r.team !== this.me.team) {
                enemyUnits.push({ unitType: r.unit, relPos: subtractPair({ x: r.x, y: r.y }, this.loc) });
            }
        }
        return enemyUnits;
    }

    inGrid(pos) {
        return pos.x >= 0 && pos.y >= 0 && pos.x < this.map.length && pos.y < this.map.length;
    }

    canAttack(pos) {
        return this.inGrid(pos)
            && sqDist(pos, this.loc) >= SPECS.UNITS[this.me.unit].ATTACK_RADIUS[0]
            && sqDist(pos, this.loc) <= SPECS.UNITS[this.me.unit].ATTACK_RADIUS[1];
    }

    turn() {
        this.log("START TURN " + this.me.turn);
        this.alreadySignaled = false;
        let visible = this.getVisibleRobots();

        if (this.me.unit === SPECS.PILGRIM) {
            this.loc = { x: this.me.x, y: this.me.y };
            this.log("Pilgrim Position: " + pairToString(this.loc));
            this.log("I have " + this.me.karbonite + " karb and " + this.me.fuel + " fuel");

            if (this.me.turn === 1) {
                this.receivedFirstMessage = false;
                this.state = "waiting for init messages";
            }

            if (this.state === "waiting for init messages") {
                this.log("Pilgrim state: " + this.state);
                let receivedMessage = false;
                for (let i = 0; i < visible.length; i++) {
                    let r = visible[i];
                    if (r.team === this.me.team && r.unit === SPECS.CASTLE && this.isRadioing(r)) {
                        let hash = r.signal;
                        if (hash >> 15) {
                            let shiftHash = (hash >> 12) & ((1 << 3) - 1);
                            let shift = unhashShift(shiftHash);
                            if (pairEq(subtractPair(this.loc, { x: r.x, y: r.y }), shift)) {
                                // signal is meant for me!
                                this.log("I got a message!");
                                receivedMessage = true;
                                if (!this.receivedFirstMessage) {
                                    this.log("This is my first message");
                                    this.receivedFirstMessage = true;

                                    this.castles = new Array((hash >> 10) & ((1 << 2) - 1));
                                    this.castlePos = new Array(this.castles.length);
                                    this.baseCastleNumber = ((hash >> 8) & ((1 << 2) - 1)) - 1;
                                    this.castles[this.baseCastleNumber] = r.id;
                                    this.castlePos[this.baseCastleNumber] = { x: r.x, y: r.y };

                                    this.log("Known castle locations:");
                                    this.log(this.castlePos);

                                    this.base = { x: r.x, y: r.y };
                                    this.churches = new Array((hash >> 6) & ((1 << 2) - 1));
                                    if (hash & (1 << 4))
                                        this.targetResource = "fuel";
                                    else
                                        this.targetResource = "karb";
                                    this.targetID = hash & ((1 << 4) - 1);

                                    // let other castles know that you're a newly created robot
                                    // 7th bit shows that you're new, 5-6 shows your type, 0-4 shows your job
                                    this.castleTalk((1 << 7) | ((this.me.unit - 2) << 5) | (hash & ((1 << 5) - 1)));

                                    if (this.castles.length === 1) {
                                        this.pilgrimInit();
                                        this.state = "going to mine"; // can start moving on the same turn
                                    }
                                    else {
                                        this.log("Must wait for more init messages");
                                        return this.pilgrimDontDoNothing();
                                    }
                                }
                                else {
                                    for (let j = 0; j < this.castles.length; j++) {
                                        if (this.castles[j] === undefined) {
                                            this.castles[j] = r.id;
                                            this.castlePos[j] = { x: (r.signal >> 6) & ((1 << 6) - 1), y: r.signal & ((1 << 6) - 1) };
                                            break;
                                        }
                                    }
                                    this.log("Known castle locations:");
                                    this.log(this.castlePos);

                                    for (let j = 0; j < this.castles.length; j++) {
                                        if (this.castles[j] === undefined) {
                                            this.log("Must wait for more init messages");
                                            return this.pilgrimDontDoNothing();
                                        }
                                    }
                                    this.pilgrimInit();
                                    this.state = "going to mine"; // can start moving on the same turn
                                }
                            }
                        }
                    }
                }
                if (!receivedMessage) {
                    this.log("No message received, state is still " + this.state);
                    return this.pilgrimDontDoNothing();
                }
            }

            if (this.state === "going to mine") {
                this.log("Pilgrim state: " + this.state);
                if (pairEq(this.loc, this.targetMine)) {
                    this.state = "mining"; // can start mining on the same turn
                    this.log("Already arrived at mine, state changed to " + this.state);
                }
                else {
                    let chosenMove = move(this.loc, this.bfsFromMine, this.map, this.getVisibleRobotMap(), SPECS.UNITS[this.me.unit].SPEED, this.lastMoveNothing);
                    this.log("Move: " + pairToString(chosenMove));
                    if (pairEq(chosenMove, { x: 0, y: 0 })) {
                        this.lastMoveNothing = true; // stuck
                        return this.pilgrimDontDoNothing();
                    }
                    else {
                        this.lastMoveNothing = false;
                        if (pairEq(addPair(this.loc, chosenMove), this.targetMine) && this.enoughFuelToMove(chosenMove))
                            this.state = "mining";
                        return this.move(chosenMove.x, chosenMove.y);
                    }
                }
            }

            if (this.state === "mining") {
                this.log("Pilgrim state: " + this.state);
                if (this.fuel >= SPECS.MINE_FUEL_COST) {
                    this.lastMoveNothing = false;
                    if (this.targetResource === "karb") {
                        if (this.me.karbonite + SPECS.KARBONITE_YIELD >= SPECS.UNITS[this.me.unit].KARBONITE_CAPACITY) {
                            this.log("Storage will be full next round, swiching state to go to base");
                            this.state = "going to base";
                        }
                    }
                    else {
                        this.log("Mining my target fuel");
                        if (this.me.fuel + SPECS.FUEL_YIELD >= SPECS.UNITS[this.me.unit].FUEL_CAPACITY) {
                            this.log("Storage will be full next round, swiching state to go to base");
                            this.state = "going to base";
                        }
                    }
                    return this.mine();
                }
                else {
                    this.log("Not enough fuel to mine");
                    this.lastMoveNothing = true;
                    return this.pilgrimDontDoNothing();
                }
            }

            if (this.state === "going to base") {
                this.log("Pilgrim state: " + this.state);
                if (sqDist(this.loc, this.base) <= 2) {
                    this.state = "depositing";
                    this.log("Already arrived at base, state switching to " + this.state);
                }
                else {
                    let chosenMove = move(this.loc, this.bfsFromBase, this.map, this.getVisibleRobotMap(), SPECS.UNITS[this.me.unit].SPEED, this.lastMoveNothing);
                    this.log("Move: " + pairToString(chosenMove));
                    if (pairEq(chosenMove, { x: 0, y: 0 })) {
                        this.lastMoveNothing = true;
                        return this.pilgrimDontDoNothing();
                    }
                    else {
                        this.lastMoveNothing = false;
                        if (sqDist(addPair(this.loc, chosenMove), this.base) <= 2 && this.enoughFuelToMove(chosenMove)) {
                            this.state = "depositing";
                            this.log("Will arrive at base next turn, state switching to " + this.state);
                        }
                        return this.move(chosenMove.x, chosenMove.y);
                    }
                }
            }

            if (this.state === "depositing") {
                this.log("Pilgrim state: " + this.state);
                if (this.me.karbonite > 0 || this.me.fuel > 0) {
                    this.log("Depositing resources at base");
                    this.lastMoveNothing = false;
                    this.state = "going to mine";
                    this.log("State for next round changed to " + this.state);
                    return this.give(this.base.x - this.loc.x, this.base.y - this.loc.y, this.me.karbonite, this.me.fuel);
                }
                else {
                    this.log("ERROR! pilgrim was in state deposit without any resources");
                    this.state = "going to mine";
                    return this.pilgrimDontDoNothing();
                }
            }

            this.log("ERROR! this is the end of pilgrim's turn(), it shouldn't get this far");
            return this.pilgrimDontDoNothing();
        }
        else if (this.me.unit === SPECS.CASTLE) {
            this.loc = { x: this.me.x, y: this.me.y }; // change to let loc
            this.log("Castle Position: " + pairToString(this.loc));

            if (this.me.turn === 1) {
                this.castles = [];
                this.castlePos = [];
                this.churches = [];
                for (let i = 0; i < visible.length; i++) {
                    let r = visible[i];
                    if (r.team === this.me.team) { // cannot check r.unit === SPECS.CASTLE because r.unit is undefined when r is not visible
                        this.castles.push(-1);
                        this.castlePos.push({ x: -1, y: -1 });
                    }
                }
                this.castleNumber = 0;
                for (let i = 0; i < visible.length; i++) {
                    let r = visible[i];
                    if (r.team === this.me.team && r.id !== this.me.id) {
                        if ((r.castle_talk >> 6) !== 0) {
                            let rCastleNumber = (r.castle_talk >> 6) - 1;
                            this.castles[rCastleNumber] = r.id;
                            this.castlePos[rCastleNumber].x = r.castle_talk & ((1 << 6) - 1);
                            this.castleNumber++;
                        }
                    }
                }
                this.castles[this.castleNumber] = this.me.id;
                this.castlePos[this.castleNumber] = { x: this.me.x, y: this.me.y };
                this.castleTalk(((this.castleNumber + 1) << 6) + this.me.x);

                // other init things
                this.lastCreated = null;
                this.prioritySignalQueue = new Queue();
                this.signalQueue = new Queue();
                return;
            }
            else if (this.me.turn === 2) {
                for (let i = 0; i < visible.length; i++) {
                    let r = visible[i];
                    if (r.team === this.me.team && r.id !== this.me.id) {
                        if ((r.castle_talk >> 6) !== 0) {
                            let rCastleNumber = (r.castle_talk >> 6) - 1;
                            if (rCastleNumber < this.castleNumber) { // r's second signal is y coordinate
                                this.castlePos[rCastleNumber].y = r.castle_talk & ((1 << 6) - 1);
                            }
                            else { // r's first signal is x coordinate
                                this.castles[rCastleNumber] = r.id;
                                this.castlePos[rCastleNumber].x = r.castle_talk & ((1 << 6) - 1);
                            }
                        }
                    }
                }
                this.castleTalk(((this.castleNumber + 1) << 6) + this.me.y);
                return;
            }
            else if (this.me.turn === 3) {
                for (let i = 0; i < visible.length; i++) {
                    let r = visible[i];
                    if (r.team === this.me.team && r.id !== this.me.id) {
                        if ((r.castle_talk >> 6) !== 0) {
                            let rCastleNumber = (r.castle_talk >> 6) - 1;
                            if (rCastleNumber > this.castleNumber) { // r's second signal is y coordinate
                                // this.log("Castle " + rCastleNumber + " sent castleTalk message " + r.castle_talk & ((1 << 6) - 1));
                                this.castlePos[rCastleNumber].y = r.castle_talk & ((1 << 6) - 1);
                            }
                        }
                    }
                }

                this.log("I am castle number " + this.castleNumber);
                // this.log("Castles IDs:");
                // this.log(this.castles);
                // this.log("is ID 438 new? " + this.isNewID(438));
                // this.log("Found castle positions");
                // this.log(this.castlePos);

                this.findSymmetry();
                this.enemyCastlePos = [];
                for (let i = 0; i < this.castles.length; i++) {
                    this.enemyCastlePos.push(this.reflect(this.castlePos[i]));
                }

                this.maxKarbPilgrims = 16;
                this.maxFuelPilgrims = 16;

                this.assignedArea = this.assignAreaToCastles();
                this.initResourceList();

                // this.log("Target karb:");
                // for (let i = 0; i<this.targetKarb.length; i++){
                //     this.log(JSON.stringify(this.targetKarb[i]));
                // }
                // this.log("Target fuel:");
                // for (let i = 0; i<this.targetFuel.length; i++){
                //     this.log(JSON.stringify(this.targetFuel[i]));
                // }

                this.churches = [];
                this.karbPilgrims = [];
                this.fuelPilgrims = [];
                this.crusaders = [];
                this.prophets = []; // rangers
                this.preachers = []; // mages/tanks

                this.desiredKarbPilgrims = Math.min(4, this.targetKarb.length);
                this.desiredFuelPilgrims = Math.min(4, this.targetFuel.length);
                this.karbBuffer = 60; // TODO: make it dynamic
                this.fuelBuffer = 300; // TODO: make it dynamic
            }

            this.updateAllUnitLists(visible);

            let karbGoal = this.karbGoalStatus(this.desiredKarbPilgrims);
            let fuelGoal = this.fuelGoalStatus(this.desiredFuelPilgrims);
            let visibleEnemies = this.findEnemies(visible);
            this.log("Karb goal: " + JSON.stringify(karbGoal));
            this.log("Fuel goal: " + JSON.stringify(fuelGoal));

            this.log(visibleEnemies);

            if (this.hasSpaceAround()) {
                if (visibleEnemies.length > 0) {
                    this.log("Under attack!");
                    visibleEnemies.sort(compareDist);
                    if (this.canBuild(SPECS.PREACHER)) {
                        return this.buildDefenseMage(visibleEnemies[0]);
                    }
                }
                else if (!karbGoal.reached) {
                    if (karbGoal.canHelp && this.canMaintainBuffer(SPECS.PILGRIM)) {
                        return this.buildKarbPilgrim();
                    }
                    else {
                        // wait for other castle to do it, if !canHelp
                        // or if it's my job, prioritize safety buffer
                        this.sendSignal();
                        return;
                    }
                }
                else if (!fuelGoal.reached) {
                    if (fuelGoal.canHelp && this.canMaintainBuffer(SPECS.PILGRIM)) {
                        return this.buildFuelPilgrim();
                    }
                    else {
                        // wait for other castle to do it, if !canHelp
                        // or if it's my job, prioritize safety buffer
                        this.sendSignal();
                        return;
                    }
                }
                // else if (this.canMaintainBuffer(SPECS.CRUSADER)) {
                //     this.log("Building crusader");
                //     this.sendSignal();
                //     return this.buildAround(SPECS.CRUSADER);
                // }
                else {
                    this.lastCreated = null;
                }
            }
            // this.log("Current number of karb pilgrims: " + this.karbPilgrims.length);
            // this.log("Current number of fuel pilgrims: " + this.fuelPilgrims.length);

            this.sendSignal();
        }
        else if (this.me.unit === SPECS.PREACHER) {
            this.loc = { x: this.me.x, y: this.me.y };
            this.log("Mage Position: " + pairToString(this.loc));

            if (this.me.turn === 1) {
                this.receivedFirstMessage = false;
                this.state = "waiting for init messages";
            }

            if (this.state === "waiting for init messages") {
                this.log("Mage state: " + this.state);
                let receivedMessage = false;
                for (let i = 0; i < visible.length; i++) {
                    let r = visible[i];
                    if (r.team === this.me.team && r.unit === SPECS.CASTLE && this.isRadioing(r)) {
                        let hash = r.signal;
                        if (hash >> 15) {
                            let shiftHash = (hash >> 12) & ((1 << 3) - 1);
                            let shift = unhashShift(shiftHash);
                            if (pairEq(subtractPair(this.loc, { x: r.x, y: r.y }), shift)) {
                                // signal is meant for me!
                                this.log("I got a message!");
                                receivedMessage = true;

                                this.baseCastle = { x: r.x, y: r.y };
                                this.bfsFromBase = bfs(this.baseCastle, this.map);

                                if ((hash >> 11) & 1) {
                                    this.state = "defense";
                                    if ((hash >> 10) & 1)
                                        this.maxAdvanceSpeed = 4;
                                    else
                                        this.maxAdvanceSpeed = 2;
                                    let enemyShiftX = ((hash >> 5) & ((1 << 5) - 1)) - 16;
                                    let enemyShiftY = (hash & ((1 << 5) - 1)) - 16;
                                    this.enemy = addPair(this.baseCastle, { x: enemyShiftX, y: enemyShiftY });
                                    this.bfsFromEnemy = bfs(this.enemy, this.map);
                                    this.log("I'm a defense mage that just got initialized");
                                    this.log("Base castle: " + pairToString(this.baseCastle));
                                    this.log("Heading to enemy at " + pairToString(this.enemy));
                                }
                                else {
                                    this.state = "attack";
                                    this.findSymmetry();
                                    this.enemyCastle = this.reflect(this.baseCastle);
                                    this.bfsFromEnemy = bfs(this.enemyCastle, this.map);
                                    this.log("I'm an attack mage that just got initialized");
                                    this.log("Base castle: " + pairToString(this.baseCastle));
                                    this.log("Heading to enemy at " + pairToString(this.enemyCastle));
                                }
                            }
                        }
                    }
                }
                if (!receivedMessage) {
                    this.log("No message received, state is still " + this.state);
                }
            }

            let visibleMap = this.getVisibleRobotMap();
            if (this.findEnemies(visible).length > 0) {
                this.log("Mage sees enemies!");
                let bestShift = { x: -100, y: -100 };
                let maxHits = -100;
                let closestHit = 100;
                for (let dx = -4; dx <= 4; dx++) {
                    for (let dy = -4; dy <= 4; dy++) {
                        let shift = { x: dx, y: dy };
                        let targetSquare = addPair(this.loc, shift);
                        if (!this.canAttack(targetSquare))
                            continue;
                        // calculate splash result
                        let hits = 0;
                        let closestDist = 100;
                        for (let dx2 = -1; dx2 <= 1; dx2++) {
                            for (let dy2 = -1; dy2 <= 1; dy2++) {
                                let splashed = addPair(targetSquare, { x: dx2, y: dy2 });
                                if (!this.inGrid(splashed))
                                    continue;
                                let id = visibleMap[splashed.y][splashed.x];
                                if (id > 0) {
                                    if (this.getRobot(id).team !== this.me.team) {
                                        hits++;
                                        closestDist = Math.min(closestDist, norm({ x: dx + dx2, y: dy + dy2 }));
                                    }
                                    else {
                                        hits--;
                                    }
                                }
                            }
                        }
                        if (hits > maxHits) {
                            bestShift = shift;
                            maxHits = hits;
                            closestHit = closestDist;
                        }
                        else if (hits === maxHits) {
                            if (closestDist < closestHit) {
                                bestShift = shift;
                                maxHits = hits;
                                closestHit = closestDist;
                            }
                        }
                    }
                }
                this.log("Attacking " + pairToString(addPair(this.loc, bestShift)));
                return this.attack(bestShift.x, bestShift.y);
            }

            if (this.state === "defense") {
                let chosenMove = move(this.loc, this.bfsFromEnemy, this.map, this.getVisibleRobotMap(), this.maxAdvanceSpeed);
                this.log("Move: " + pairToString(chosenMove));
                if (pairEq(addPair(this.loc, chosenMove), this.enemy) && this.enoughFuelToMove(chosenMove))
                    this.state = "returning";
                return this.move(chosenMove.x, chosenMove.y);
            }

            if (this.state === "attack") {
                if (sqDist(this.loc, this.enemyCastle) <= SPECS.UNITS[this.me.unit].VISION_RADIUS
                    && this.getRobot(visibleMap[this.enemyCastle.y][this.enemyCastle.x]).unit !== SPECS.CASTLE) {
                    this.log("Don't see an enemy castle in the expected location, must have been killed");
                    this.state = "returning";
                }
                let chosenMove = move(this.loc, this.bfsFromEnemyCastle, this.map, this.getVisibleRobotMap(), SPECS.UNITS[this.me.unit].SPEED);
                this.log("Move: " + pairToString(chosenMove));
                if (sqDist(addPair(this.loc, chosenMove), this.enemyCastle) && this.enoughFuelToMove(chosenMove))
                    this.state = "returning";
                return this.move(chosenMove.x, chosenMove.y);
            }

            if (this.state === "returning") {
                let chosenMove = move(this.loc, this.bfsFromBase, this.map, this.getVisibleRobotMap(), SPECS.UNITS[this.me.unit].SPEED); // slow retreat
                this.log("Move: " + pairToString(chosenMove));
                if (sqDist(addPair(this.loc, chosenMove), this.baseCastle) <= 16 && this.enoughFuelToMove(chosenMove))
                    this.state = "waiting";
                return this.move(chosenMove.x, chosenMove.y);
            }
        }
        else { // other attacking unit
            this.loc = { x: this.me.x, y: this.me.y };

            var self = this; // 'this' fails to properly identify MyRobot when used inside of anonymous function below :(

            // get attackable robots
            var attackable = visible.filter((r) => {
                if (!self.isVisible(r)) {
                    return false
                }
                var dist = (r.x - self.me.x) ** 2 + (r.y - self.me.y) ** 2;
                if (r.team !== self.me.team
                    && SPECS.UNITS[SPECS.CRUSADER].ATTACK_RADIUS[0] <= dist
                    && dist <= SPECS.UNITS[SPECS.CRUSADER].ATTACK_RADIUS[1]) {
                    return true
                }
                return false
            });
            // this.log(attackable)

            if (attackable.length > 0) {
                // attack first robot
                var r = attackable[0];
                this.log("" + r);
                this.log('attacking! ' + r + ' at loc ' + (r.x - this.me.x, r.y - this.me.y));
                return this.attack(r.x - this.me.x, r.y - this.me.y)
            }

            const choices = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
            const choice = choices[Math.floor(Math.random() * choices.length)];
            return this.move(...choice);
        }
    }
}

var robot = new MyRobot();

var robot = new MyRobot();
