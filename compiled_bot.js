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
        if (this._bc_game_state.shadow[this.me.y+dy][this.me.x+dx] === 0) throw "Cannot attack empty tile.";

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

const shifts = [
    {x:-1, y: -1},
    {x:-1, y: 0},
    {x:-1, y: 1},
    {x:0, y: -1},
    {x:0, y: 1},
    {x:1, y: -1},
    {x:1, y: 0},
    {x:1, y: 1}
];

function hashShift(shift) {
    for (let i = 0; i<8; i++){
        if (pairEq(shifts[i], shift)){
            return i;
        }
    }
}

function unhashShift(hash){
    return shifts[hash];
}

// export default { addPair, sqDist, findClosestKarbonite, findClosestFuel, findClosestPosition };

class MyRobot extends BCAbstractRobot {
    canBuild(unitType) {
        return this.karbonite >= SPECS.UNITS[unitType].CONSTRUCTION_KARBONITE && this.fuel >= SPECS.UNITS[unitType].CONSTRUCTION_FUEL;
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

    buildAround(unitType) {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (empty({ x: this.loc.x + dx, y: this.loc.y + dy }, this.map, this.getVisibleRobotMap())) {
                    return this.buildUnit(unitType, dx, dy);
                }
            }
        }
    }

    // chooseGoal() {
    //     this.log("Choosing new goal");
    //     if (this.me.karbonite < SPECS.UNITS[this.me.unit].KARBONITE_CAPACITY) {
    //         this.destination = findClosestKarbonite(this.loc, this.karbonite_map);
    //         this.goal = "karbonite";
    //     }
    //     else if (this.me.fuel < SPECS.UNITS[this.me.unit].FUEL_CAPACITY) {
    //         this.destination = findClosestFuel(this.loc, this.fuel_map);
    //         this.goal = "fuel";
    //     }
    //     else {
    //         this.log("Searching for closest castle");
    //         this.log("Castle list:");
    //         this.log(this.castleList);
    //         this.destination = findClosestPosition(this.loc, this.castleList.concat(this.churchList));
    //         this.goal = "deposit";
    //     }
    //     this.bfsGrid = bfs(this.destination, this.map);
    //     // this.log(this.bfsGrid);
    //     this.log("Goal: " + this.goal);
    //     this.log("Destination: " + pairToString(this.destination));
    //     this.log("Distance: " + this.bfsGrid[this.loc.y][this.loc.x]);
    // }

    hashPilgrimInitSignal(type, number, shift) {
        let hash = 0;
        hash |= 1 << 15; // first number indicates that signal is meant for newly created robots
        hash |= hashShift(shift);
        hash |= number << 3; // 6 bits
        if (type === "fuel")
            hash |= 1 << 9; // 0 = karb, 1 = fuel;
        return hash;
    }

    turn() {
        this.log("START TURN " + this.me.turn);
        this.loc = { x: this.me.x, y: this.me.y };
        this.alreadySignaled = false;

        if (this.me.unit === SPECS.PILGRIM) {
            this.log("Pilgrim Position: " + pairToString(this.loc));

            // first part of initialize
            if (this.me.turn === 1) {
                this.castleList = [];
                this.churchList = [];
            }

            // update castle and church list
            let visible = this.getVisibleRobots();

            for (let i = 0; i < visible.length; i++) {
                let r = visible[i];
                if (!this.isVisible(r)) {
                    continue;
                }
                if (r.unit === SPECS.CASTLE && r.team === this.me.team) {
                    let newCastle = true;
                    for (let j = 0; j < this.castleList.length; j++) {
                        if (pairEq(this.castleList[j], { x: r.x, y: r.y }))
                            newCastle = false;
                    }
                    if (newCastle)
                        this.castleList.push(r);
                }
                else if (r.unit === SPECS.CHURCH && r.team === this.me.team) {
                    let newChurch = true;
                    for (let j = 0; j < this.churchList.length; j++) {
                        if (pairEq(this.churchList[j], { x: r.x, y: r.y }))
                            newChurch = false;
                    }
                    if (newChurch)
                        this.churchList.push(r);
                }
            }

            // second part of initialize
            if (this.me.turn === 1) {
                this.log("Castle List:");
                this.log(this.castleList);
                for (let i = 0; i < this.castleList.length; i++) {
                    this.log("i = " + i);
                    let r = this.castleList[i];
                    if (this.isRadioing(r)) {
                        if (r.signal & (1 << 15)) {
                            // signal is meant for a new robot
                            this.log("test2");
                            let shift = unhashShift(r.signal & ((1 << 3) - 1));
                            this.log("shift:");
                            this.log(shift);
                            if (pairEq(addPair({ x: r.x, y: r.y }, shift), this.loc)) {
                                // signal is meant for me
                                this.log("Parsing initialization message");
                                this.baseCastle = { x: r.x, y: r.y };
                                if ((r.signal >> 9) & 1) {
                                    this.targetResource = "fuel";
                                }
                                else {
                                    this.targetResource = "karbonite";
                                }
                                this.log("My target resource is " + this.targetResource);
                                let number = (r.signal >> 3) & ((1 << 6) - 1);
                                let found = -1; // number of resources found matching the goal
                                for (let x = 0; x < this.map.length; x++) {
                                    for (let y = 0; y < this.map.length; y++) {
                                        if (this.targetResource === "karbonite" && this.karbonite_map[y][x]) {
                                            found++;
                                        }
                                        else if (this.targetResource === "fuel" && this.fuel_map[y][x]) {
                                            found++;
                                        }
                                        if (found === number) {
                                            this.defaultMine = { x: x, y: y };
                                            this.destination = this.defaultMine;
                                            this.bfsFromDestination = bfs(this.destination, this.map);
                                            this.log("Destination set to " + pairToString(this.destination));
                                            break;
                                        }
                                    }
                                    if (found === number)
                                        break;
                                }
                            }
                        }
                    }
                }
            }

            this.log("Done initializing");

            // check if pilgrim has reached destination
            if (pairEq(this.loc, this.destination)) {
                this.log("Pilgrim has reached destination of " + pairToString(this.destination));
                if (this.targetResource === "karbonite") {
                    if (this.me.karbonite < SPECS.UNITS[this.me.unit].KARBONITE_CAPACITY) {
                        this.log("Mining karbonite");
                        this.lastMoveNothing = false;
                        return this.mine();
                    }
                    else {
                        this.destination = this.baseCastle;
                        this.bfsFromDestination = bfs(this.destination, this.map);
                        this.state = "deposit";
                        this.log("Returning to castle");
                    }
                }
                else if (this.targetResource === "fuel") {
                    if (this.me.fuel < SPECS.UNITS[this.me.unit].FUEL_CAPACITY) {
                        this.log("Mining fuel");
                        this.lastMoveNothing = false;
                        return this.mine();
                    }
                    else {
                        this.destination = this.baseCastle;
                        this.bfsFromDestination = bfs(this.destination, this.map);
                        this.state = "deposit";
                        this.log("Returning to castle");
                    }
                }
            }
            else if (this.state === "deposit" && sqDist(this.loc, this.destination) <= 2) {
                if (this.me.karbonite > 0 || this.me.fuel > 0) {
                    this.log("Depositing resources");
                    this.lastMoveNothing = false;
                    return this.give(this.destination.x - this.loc.x, this.destination.y - this.loc.y, this.me.karbonite, this.me.fuel);
                }
                else {
                    this.destination = this.defaultMine;
                    this.bfsFromDestination = bfs(this.destination, this.map);
                    this.state = "gather";
                    this.log("Gathering " + this.targetResource);
                }
            }

            this.log("Pilgrim destination: " + pairToString(this.destination));
            let chosenMove = move(this.loc, this.bfsFromDestination, this.map, this.getVisibleRobotMap(), SPECS.UNITS[this.me.unit].SPEED, this.lastMoveNothing);
            this.log("Move: " + pairToString(chosenMove));
            if (pairEq(chosenMove, { x: 0, y: 0 })) {
                this.lastMoveNothing = true;
                return;
            }
            else {
                this.lastMoveNothing = false;
                return this.move(chosenMove.x, chosenMove.y);
            }
        }
        else if (this.me.unit === SPECS.CASTLE) {
            this.log("Castle Position: " + pairToString(this.loc));
            if (this.me.turn === 1) {
                this.pilgrimCount = 0;
                this.lastCreated = null;
                this.karbPositions = [];
                this.fuelPositions = [];
                this.karbAssigned = [];
                this.fuelAssigned = [];
                this.bfsFromHere = bfs(this.loc, this.map);
                for (let x = 0; x < this.map.length; x++) {
                    for (let y = 0; y < this.map.length; y++) {
                        if (this.karbonite_map[y][x]) {
                            this.karbPositions.push([this.bfsFromHere[y][x], sqDist({ x: x, y: y }, this.loc), this.karbPositions.length, { x: x, y: y }]);
                            this.karbAssigned.push(new Array());
                        }
                        if (this.fuel_map[y][x]) {
                            this.fuelPositions.push([this.bfsFromHere[y][x], sqDist({ x: x, y: y }, this.loc), this.fuelPositions.length, { x: x, y: y }]);
                            this.fuelAssigned.push(new Array());
                        }
                    }
                }
                this.karbPositions.sort();
                this.fuelPositions.sort();
            }

            if (this.lastCreated !== null) {
                this.log("Created a unit last turn. lastCreated = ");
                this.log(this.lastCreated);
                let unitPos = this.lastCreated[1];
                if (this.lastCreated[0] === SPECS.PILGRIM) {
                    if (this.lastCreated[2] === "karb") {
                        this.karbAssigned[this.lastCreated[3]].push(this.getVisibleRobotMap()[unitPos.y][unitPos.x]);
                    }
                    else {
                        this.karbAssigned[this.lastCreated[3]].push(this.getVisibleRobotMap()[unitPos.y][unitPos.x]);
                    }
                }
            }

            this.lastCreated = null;
            this.log("test1");

            if (this.hasSpaceAround()) {
                if (this.canBuild(SPECS.PILGRIM) && this.pilgrimCount < 30) {
                    this.pilgrimCount++;
                    if (this.pilgrimCount & 1) { // gather karbonite
                        let karbIndex = 0;
                        while (karbIndex < this.karbAssigned.length && this.karbAssigned[karbIndex].length >= Math.ceil(this.karbPositions[karbIndex][0] / 10 + 0.5)) {
                            karbIndex++;
                        }
                        let destination = this.karbPositions[karbIndex][3];
                        let minDist = 1000000;
                        let bestPos = { x: -1, y: -1 };
                        for (let dx = -1; dx <= 1; dx++) {
                            for (let dy = -1; dy <= 1; dy++) {
                                let pos = { x: this.loc.x + dx, y: this.loc.y + dy };
                                if (empty(pos, this.map, this.getVisibleRobotMap())) {
                                    if (sqDist(pos, destination) < minDist) {
                                        minDist = sqDist(pos, destination);
                                        bestPos = pos;
                                    }
                                }
                            }
                        }
                        this.log("Buliding Pilgrim at " + pairToString(bestPos));
                        let shift = subtractPair(bestPos, this.loc);
                        this.lastCreated = [SPECS.PILGRIM, bestPos, "karb", karbIndex];
                        this.signal(this.hashPilgrimInitSignal("karb", this.karbPositions[karbIndex][2], shift), sqDist(this.loc, bestPos));
                        this.log("Signaled " + this.hashPilgrimInitSignal("karb", this.karbPositions[karbIndex][2], shift));
                        this.alreadySignaled = true;
                        return this.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
                    }
                    else {
                        let fuelIndex = 0;
                        while (fuelIndex < this.fuelAssigned.length && this.fuelAssigned[fuelIndex].length >= Math.ceil(this.fuelPositions[fuelIndex][0] / 10 + 0.5)) {
                            fuelIndex++;
                        }
                        let destination = this.fuelPositions[fuelIndex][3];
                        let minDist = 1000000;
                        let bestPos = { x: -1, y: -1 };
                        for (let dx = -1; dx <= 1; dx++) {
                            for (let dy = -1; dy <= 1; dy++) {
                                let pos = { x: this.loc.x + dx, y: this.loc.y + dy };
                                if (empty(pos, this.map, this.getVisibleRobotMap())) {
                                    if (sqDist(pos, destination) < minDist) {
                                        minDist = sqDist(pos, destination);
                                        bestPos = pos;
                                    }
                                }
                            }
                        }
                        this.log("Buliding Pilgrim at " + pairToString(bestPos));
                        let shift = subtractPair(bestPos, this.loc);
                        this.lastCreated = [SPECS.PILGRIM, bestPos, "fuel", fuelIndex];
                        this.signal(this.hashPilgrimInitSignal("fuel", this.fuelPositions[fuelIndex][2], shift), sqDist(this.loc, bestPos));
                        this.log("Signaled " + this.hashPilgrimInitSignal("fuel", this.fuelPositions[fuelIndex][2], shift));
                        this.alreadySignaled = true;
                        return this.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
                    }
                }
                else if (this.canBuild(SPECS.CRUSADER)) {
                    this.log("Building crusader");
                    return this.buildAround(SPECS.CRUSADER);
                }
                else {
                    this.lastCreated = null;
                }
            }
            else {
                this.lastCreated = null;
            }
        }
        else {
            var visible = this.getVisibleRobots();

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
