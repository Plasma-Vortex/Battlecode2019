'use strict';

var SPECS = {"COMMUNICATION_BITS":16,"CASTLE_TALK_BITS":8,"MAX_ROUNDS":1000,"TRICKLE_FUEL":25,"INITIAL_KARBONITE":100,"INITIAL_FUEL":500,"MINE_FUEL_COST":1,"KARBONITE_YIELD":2,"FUEL_YIELD":10,"MAX_TRADE":1024,"MAX_BOARD_SIZE":64,"MAX_ID":4096,"CASTLE":0,"CHURCH":1,"PILGRIM":2,"CRUSADER":3,"PROPHET":4,"PREACHER":5,"RED":0,"BLUE":1,"CHESS_INITIAL":100,"CHESS_EXTRA":20,"TURN_MAX_TIME":200,"MAX_MEMORY":50000000,"UNITS":[{"CONSTRUCTION_KARBONITE":null,"CONSTRUCTION_FUEL":null,"KARBONITE_CAPACITY":null,"FUEL_CAPACITY":null,"SPEED":0,"FUEL_PER_MOVE":null,"STARTING_HP":200,"VISION_RADIUS":100,"ATTACK_DAMAGE":10,"ATTACK_RADIUS":[1,64],"ATTACK_FUEL_COST":10,"DAMAGE_SPREAD":0},{"CONSTRUCTION_KARBONITE":50,"CONSTRUCTION_FUEL":200,"KARBONITE_CAPACITY":null,"FUEL_CAPACITY":null,"SPEED":0,"FUEL_PER_MOVE":null,"STARTING_HP":100,"VISION_RADIUS":100,"ATTACK_DAMAGE":0,"ATTACK_RADIUS":0,"ATTACK_FUEL_COST":0,"DAMAGE_SPREAD":0},{"CONSTRUCTION_KARBONITE":10,"CONSTRUCTION_FUEL":50,"KARBONITE_CAPACITY":20,"FUEL_CAPACITY":100,"SPEED":4,"FUEL_PER_MOVE":1,"STARTING_HP":10,"VISION_RADIUS":100,"ATTACK_DAMAGE":null,"ATTACK_RADIUS":null,"ATTACK_FUEL_COST":null,"DAMAGE_SPREAD":null},{"CONSTRUCTION_KARBONITE":15,"CONSTRUCTION_FUEL":50,"KARBONITE_CAPACITY":20,"FUEL_CAPACITY":100,"SPEED":9,"FUEL_PER_MOVE":1,"STARTING_HP":40,"VISION_RADIUS":49,"ATTACK_DAMAGE":10,"ATTACK_RADIUS":[1,16],"ATTACK_FUEL_COST":10,"DAMAGE_SPREAD":0},{"CONSTRUCTION_KARBONITE":25,"CONSTRUCTION_FUEL":50,"KARBONITE_CAPACITY":20,"FUEL_CAPACITY":100,"SPEED":4,"FUEL_PER_MOVE":2,"STARTING_HP":20,"VISION_RADIUS":64,"ATTACK_DAMAGE":10,"ATTACK_RADIUS":[16,64],"ATTACK_FUEL_COST":25,"DAMAGE_SPREAD":0},{"CONSTRUCTION_KARBONITE":30,"CONSTRUCTION_FUEL":50,"KARBONITE_CAPACITY":20,"FUEL_CAPACITY":100,"SPEED":4,"FUEL_PER_MOVE":3,"STARTING_HP":60,"VISION_RADIUS":16,"ATTACK_DAMAGE":20,"ATTACK_RADIUS":[1,16],"ATTACK_FUEL_COST":15,"DAMAGE_SPREAD":3}]};

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
        
        var fuelNeeded = Math.ceil(Math.sqrt(radius));
        if (this.fuel < fuelNeeded) throw "Not enough fuel to signal given radius.";
        if (!Number.isInteger(value) || value < 0 || value >= Math.pow(2,SPECS.COMMUNICATION_BITS)) throw "Invalid signal, must be int within bit range.";
        if (radius > 2*Math.pow(SPECS.MAX_BOARD_SIZE-1,2)) throw "Signal radius is too big.";

        this._bc_signal = value;
        this._bc_signal_radius = radius;

        this.fuel -= fuelNeeded;
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
        if (this.me.unit === SPECS.CHURCH) throw "Churches cannot attack.";
        if (this.fuel < SPECS.UNITS[this.me.unit].ATTACK_FUEL_COST) throw "Not enough fuel to attack.";
        if (!this._bc_check_on_map(this.me.x+dx,this.me.y+dy)) throw "Can't attack off of map.";
        if (this._bc_game_state.shadow[this.me.y+dy][this.me.x+dx] === -1) throw "Cannot attack outside of vision range.";

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
        return ('unit' in robot);
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

const util = {};

util.addPair = (a, b) => {
    return {
        x: a.x + b.x,
        y: a.y + b.y
    };
};

util.subtractPair = (a, b) => {
    return {
        x: a.x - b.x,
        y: a.y - b.y
    };
};

util.sqDist = (a, b) => {
    return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
};

util.pairEq = (a, b) => {
    return a.x === b.x && a.y === b.y;
};

util.pairToString = (p) => {
    return "(" + p.x + ", " + p.y + ")";
};

util.inGrid = (pos, map) => {
    return pos.x >= 0 && pos.y >= 0 && pos.x < map[0].length && pos.y < map.length;
};

util.inRect = (pos, minX, minY, maxX, maxY) => {
    return pos.x >= minX && pos.y >= minY && pos.x <= maxX && pos.y <= maxY;
};

util.empty = (loc, map, robotMap = null) => {
    return util.inGrid(loc, map) && map[loc.y][loc.x] && (robotMap === null || robotMap[loc.y][loc.x] <= 0);
};

util.norm = (v) => {
    return v.x * v.x + v.y * v.y;
};

util.shifts = [
    { x: -1, y: -1 },
    { x: -1, y: 0 },
    { x: -1, y: 1 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: 1, y: -1 },
    { x: 1, y: 0 },
    { x: 1, y: 1 }
];

util.hashShift = (shift) => {
    for (let i = 0; i < 8; i++) {
        if (util.pairEq(util.shifts[i], shift)) {
            return i;
        }
    }
};

util.unhashShift = (hash) => {
    return util.shifts[hash];
};

// for sorting targetKarb and targetFuel
util.customSort = (a, b) => {
    if (a.dist !== b.dist)
        return a.dist - b.dist;
    else if (a.assignedCastle !== b.assignedCastle)
        return a.assignedCastle - b.assignedCastle;
    else if (a.pos.x !== b.pos.x)
        return a.pos.x - b.pos.x;
    else
        return a.pos.y - b.pos.y;
};

util.compareDist = (a, b) => {
    if (util.norm(a.relPos) !== util.norm(b.relPos))
        return a.relPos - b.relPos;
    else
        return b.unitType - a.unitType;
};

util.compareDistToPoint = (pt) => {
    return function (a, b) {
        return util.sqDist(a, pt) - util.sqDist(b, pt);
    };
};

util.copyPair = (p) => {
    return { x: p.x, y: p.y };
};

// needs self
util.canBuild = (self, unitType) => {
    return (self.karbonite >= SPECS.UNITS[unitType].CONSTRUCTION_KARBONITE && self.fuel >= SPECS.UNITS[unitType].CONSTRUCTION_FUEL);
};

// needs self
util.hasSpaceAround = (self) => {
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (util.empty({ x: self.loc.x + dx, y: self.loc.y + dy }, self.map, self.robotMap)) {
                return true;
            }
        }
    }
    return false;
};

// needs self
util.findSymmetry = (self) => {
    for (let x = 0; x < self.map.length; x++) {
        for (let y = 0; y < self.map.length; y++) {
            if (self.map[y][x] !== self.map[y][self.map.length - x - 1]
                || self.karbonite_map[y][x] !== self.karbonite_map[y][self.map.length - x - 1]
                || self.fuel_map[y][x] !== self.fuel_map[y][self.map.length - x - 1]) {
                self.symmetry = "y";
                return;
            }
        }
    }
    self.symmetry = "x";
    return;
};

// changed
util.reflect = (self, pt) => {
    if (self.symmetry === "x") {
        return { x: self.map.length - pt.x - 1, y: pt.y };
    }
    else {
        return { x: pt.x, y: self.map.length - pt.y - 1 };
    }
};

// needs self
util.enoughFuelToMove = (self, move) => {
    return self.fuel >= util.norm(move) * SPECS.UNITS[self.me.unit].FUEL_PER_MOVE;
};

// needs self
// changed
util.hasVisibleUnit = (self, loc, unitType) => {
    if (!util.inGrid(loc, self.robotMap))
        return false;
    if (self.robotMap[loc.y][loc.x] > 0) {
        let r = self.getRobot(self.robotMap[loc.y][loc.x]);
        if (r.team === self.me.team && r.unit === unitType)
            return true;
    }
    return false;
};

// needs self
util.canAttack = (self, pos) => {
    return util.inGrid(pos, self.map)
        && util.sqDist(pos, self.loc) >= SPECS.UNITS[self.me.unit].ATTACK_RADIUS[0]
        && util.sqDist(pos, self.loc) <= SPECS.UNITS[self.me.unit].ATTACK_RADIUS[1];
};


util.findEnemies = (self, visible) => {
    let enemyUnits = [];
    for (let i = 0; i < visible.length; i++) {
        let r = visible[i];
        if (r.team !== self.me.team) {
            enemyUnits.push({ unitType: r.unit, relPos: util.subtractPair({ x: r.x, y: r.y }, self.loc) });
        }
    }
    return enemyUnits;
};

util.L1Norm = (a, b) => {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
};

util.dfs = (adj, v, visited) => {
    visited[v] = true;
    for (let i = 0; i < adj[v].length; i++) {
        if (!visited[adj[v][i]]) {
            util.dfs(adj, adj[v][i], visited);
        }
    }
};

util.getConnectedComponents = (adj, v) => {
    let visited = new Array(adj.length).fill(false);
    util.dfs(adj, v, visited);
    let connectedComponents = [];
    for (let i = 0; i < adj.length; i++) {
        if (visited[i]) {
            connectedComponents.push(i);
        }
    }
    return connectedComponents;
};

util.removeEdge = (adj, cc) => {
    let bestPair = [-1, -1];
    let maxMissing = -1;
    for (let v = 0; v < cc.length; v++) {
        for (let i = 0; i < adj[v].length; i++) {
            let u = adj[v][i];
            // consider edge v, u
            let missing = 0;
            for (let j = 0; j < adj[v].length; j++) {
                if (!adj[u].includes(adj[v][j]))
                    missing++;
            }
            for (let j = 0; j < adj[u].length; j++) {
                if (!adj[v].includes(adj[u][j]))
                    missing++;
            }
            if (missing > maxMissing) {
                bestPair = [v, u];
                maxMissing = missing;
            }
        }
    }
    return bestPair;
};

// done change

/**
 * Copyright (c) 2013 Petka Antonov
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:</p>
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
function Deque(capacity) {
    this._capacity = getCapacity(capacity);
    this._length = 0;
    this._front = 0;
    if (isArray(capacity)) {
        var len = capacity.length;
        for (var i = 0; i < len; ++i) {
            this[i] = capacity[i];
        }
        this._length = len;
    }
}

Deque.prototype.toArray = function Deque$toArray() {
    var len = this._length;
    var ret = new Array(len);
    var front = this._front;
    var capacity = this._capacity;
    for (var j = 0; j < len; ++j) {
        ret[j] = this[(front + j) & (capacity - 1)];
    }
    return ret;
};

Deque.prototype.push = function Deque$push(item) {
    var argsLength = arguments.length;
    var length = this._length;
    if (argsLength > 1) {
        var capacity = this._capacity;
        if (length + argsLength > capacity) {
            for (var i = 0; i < argsLength; ++i) {
                this._checkCapacity(length + 1);
                var j = (this._front + length) & (this._capacity - 1);
                this[j] = arguments[i];
                length++;
                this._length = length;
            }
            return length;
        }
        else {
            var j = this._front;
            for (var i = 0; i < argsLength; ++i) {
                this[(j + length) & (capacity - 1)] = arguments[i];
                j++;
            }
            this._length = length + argsLength;
            return length + argsLength;
        }

    }

    if (argsLength === 0) return length;

    this._checkCapacity(length + 1);
    var i = (this._front + length) & (this._capacity - 1);
    this[i] = item;
    this._length = length + 1;
    return length + 1;
};

Deque.prototype.pop = function Deque$pop() {
    var length = this._length;
    if (length === 0) {
        return void 0;
    }
    var i = (this._front + length - 1) & (this._capacity - 1);
    var ret = this[i];
    this[i] = void 0;
    this._length = length - 1;
    return ret;
};

Deque.prototype.shift = function Deque$shift() {
    var length = this._length;
    if (length === 0) {
        return void 0;
    }
    var front = this._front;
    var ret = this[front];
    this[front] = void 0;
    this._front = (front + 1) & (this._capacity - 1);
    this._length = length - 1;
    return ret;
};

Deque.prototype.unshift = function Deque$unshift(item) {
    var length = this._length;
    var argsLength = arguments.length;


    if (argsLength > 1) {
        var capacity = this._capacity;
        if (length + argsLength > capacity) {
            for (var i = argsLength - 1; i >= 0; i--) {
                this._checkCapacity(length + 1);
                var capacity = this._capacity;
                var j = (((( this._front - 1 ) &
                    ( capacity - 1) ) ^ capacity ) - capacity );
                this[j] = arguments[i];
                length++;
                this._length = length;
                this._front = j;
            }
            return length;
        }
        else {
            var front = this._front;
            for (var i = argsLength - 1; i >= 0; i--) {
                var j = (((( front - 1 ) &
                    ( capacity - 1) ) ^ capacity ) - capacity );
                this[j] = arguments[i];
                front = j;
            }
            this._front = front;
            this._length = length + argsLength;
            return length + argsLength;
        }
    }

    if (argsLength === 0) return length;

    this._checkCapacity(length + 1);
    var capacity = this._capacity;
    var i = (((( this._front - 1 ) &
        ( capacity - 1) ) ^ capacity ) - capacity );
    this[i] = item;
    this._length = length + 1;
    this._front = i;
    return length + 1;
};

Deque.prototype.peekBack = function Deque$peekBack() {
    var length = this._length;
    if (length === 0) {
        return void 0;
    }
    var index = (this._front + length - 1) & (this._capacity - 1);
    return this[index];
};

Deque.prototype.peekFront = function Deque$peekFront() {
    if (this._length === 0) {
        return void 0;
    }
    return this[this._front];
};

Deque.prototype.get = function Deque$get(index) {
    var i = index;
    if ((i !== (i | 0))) {
        return void 0;
    }
    var len = this._length;
    if (i < 0) {
        i = i + len;
    }
    if (i < 0 || i >= len) {
        return void 0;
    }
    return this[(this._front + i) & (this._capacity - 1)];
};

Deque.prototype.isEmpty = function Deque$isEmpty() {
    return this._length === 0;
};

Deque.prototype.clear = function Deque$clear() {
    var len = this._length;
    var front = this._front;
    var capacity = this._capacity;
    for (var j = 0; j < len; ++j) {
        this[(front + j) & (capacity - 1)] = void 0;
    }
    this._length = 0;
    this._front = 0;
};

Deque.prototype.toString = function Deque$toString() {
    return this.toArray().toString();
};

Deque.prototype.valueOf = Deque.prototype.toString;
Deque.prototype.removeFront = Deque.prototype.shift;
Deque.prototype.removeBack = Deque.prototype.pop;
Deque.prototype.insertFront = Deque.prototype.unshift;
Deque.prototype.insertBack = Deque.prototype.push;
Deque.prototype.enqueue = Deque.prototype.push;
Deque.prototype.dequeue = Deque.prototype.shift;
Deque.prototype.toJSON = Deque.prototype.toArray;

Object.defineProperty(Deque.prototype, "length", {
    get: function() {
        return this._length;
    },
    set: function() {
        throw new RangeError("");
    }
});

Deque.prototype._checkCapacity = function Deque$_checkCapacity(size) {
    if (this._capacity < size) {
        this._resizeTo(getCapacity(this._capacity * 1.5 + 16));
    }
};

Deque.prototype._resizeTo = function Deque$_resizeTo(capacity) {
    var oldCapacity = this._capacity;
    this._capacity = capacity;
    var front = this._front;
    var length = this._length;
    if (front + length > oldCapacity) {
        var moveItemsCount = (front + length) & (oldCapacity - 1);
        arrayMove(this, 0, this, oldCapacity, moveItemsCount);
    }
};


var isArray = Array.isArray;

function arrayMove(src, srcIndex, dst, dstIndex, len) {
    for (var j = 0; j < len; ++j) {
        dst[j + dstIndex] = src[j + srcIndex];
        src[j + srcIndex] = void 0;
    }
}

function pow2AtLeast(n) {
    n = n >>> 0;
    n = n - 1;
    n = n | (n >> 1);
    n = n | (n >> 2);
    n = n | (n >> 4);
    n = n | (n >> 8);
    n = n | (n >> 16);
    return n + 1;
}

function getCapacity(capacity) {
    if (typeof capacity !== "number") {
        if (isArray(capacity)) {
            capacity = capacity.length;
        }
        else {
            return 16;
        }
    }
    return pow2AtLeast(
        Math.min(
            Math.max(16, capacity), 1073741824)
    );
}

// module.exports = Deque;

const signalling = {};

// information taken from lastCreated
// only for castle and church
// signalling.queueInitSignal = (self, priority = false) => {
//     if (self.lastCreated === null) {
//         return;
//     }
//     if (self.lastCreated[0] === SPECS.PILGRIM) {
//         let hash = 1 << 15; // meant for newest robot
//         let shift = self.lastCreated[1];
//         hash |= util.hashShift(shift) << 12; // bits 12-14 specify position relative to castle
//         hash |= self.castles.length << 10; // bits 10-11 say how many castles there are, so the new unit knows how long to stay
//         hash |= (self.castleNumber + 1) << 8; // bits 8-9 say which castle self is. extra castle positions are listed in increasing order of castle number
//         hash |= self.churches.length << 6; // bits 6-7 say how many churches there are. Note that we can't have over 3 churches.
//         // specify pilgrim goal
//         if (self.lastCreated[2] === "fuel") {
//             hash |= 1 << 4;
//         }
//         hash |= self.lastCreated[3];
//         if (priority) {
//             self.prioritySignalQueue.push({ signal: hash, dist: util.norm(shift) });
//         }
//         else {
//             self.signalQueue.push({ signal: hash, dist: util.norm(shift) });
//         }

//         for (let i = 0; i < self.castles.length; i++) {
//             if (i === self.castleNumber)
//                 continue;
//             hash = 1 << 15;
//             hash |= util.hashShift(shift) << 12;
//             hash |= self.castlePos[i].x << 6;
//             hash |= self.castlePos[i].y;
//             if (priority)
//                 self.prioritySignalQueue.push({ signal: hash, dist: util.norm(shift) });
//             else
//                 self.signalQueue.push({ signal: hash, dist: util.norm(shift) });
//         }
//     }
//     else if (self.lastCreated[0] === SPECS.PREACHER) {
//         self.log("Queueing mage init signal");
//         let hash = 1 << 15; // meant for newest robot
//         let shift = self.lastCreated[1];
//         self.log("Shift: " + util.pairToString(shift));
//         self.log("Distance: " + util.norm(shift));
//         hash |= util.hashShift(shift) << 12; // bits 12-14 specify position relative to castle
//         if (self.lastCreated[2] === "defense") {
//             hash |= 1 << 11; // bit 11 specifies whether mage should defend or attack
//         }
//         hash |= Number(self.lastCreated[3]) << 10; // bit 10 says whether mage should go fast or not
//         hash |= (self.lastCreated[4].x + 16) << 5; // specify shifted relative x-coord of enemy
//         hash |= self.lastCreated[4].y + 16; // specify shifted relative y-coord of enemy
//         if (priority)
//             self.prioritySignalQueue.push({ signal: hash, dist: util.norm(shift) });
//         else
//             self.signalQueue.push({ signal: hash, dist: util.norm(shift) });
//     }
// }

// signalling.sendSignal = (self) => {
//     if (self.alreadySignalled) {
//         self.log("ERROR! Tried to signal twice in the same turn");
//         return;
//     }
//     if (self.prioritySignalQueue.isEmpty() && self.signalQueue.isEmpty())
//         return;

//     let message = 0; // will be overwritten
//     if (!self.prioritySignalQueue.isEmpty()) {
//         if (self.fuel < self.prioritySignalQueue.peekFront().dist) {
//             self.log("Not enough fuel to send message of distance " + self.prioritySignalQueue.peek().dist);
//             return; // must save up fuel
//         }
//         message = self.prioritySignalQueue.shift();
//     }
//     else {
//         if (self.fuel < self.signalQueue.peekFront().dist) {
//             self.log("Not enough fuel to send message of distance " + self.signalQueue.peekFront().dist);
//             return; // must save up fuel
//         }
//         message = self.signalQueue.shift();
//     }
//     self.log("Sending signal " + message.signal);
//     self.signal(message.signal, message.dist);
//     self.alreadySignalled = true;
// }

// for castles or churches only
signalling.pilgrimInitSignal = (self, resourceID, shift) => {
    if (self.alreadySignalled) {
        self.log("ERROR! Tried to signal twice in the same turn");
        return;
    }
    self.signal((1 << 15) + resourceID, util.norm(shift));
    self.alreadySignalled = true;
};

// for castles only
signalling.churchPilgrimInitSignal = (self, clusterID, dist) => {
    if (self.alreadySignalled) {
        self.log("ERROR! Tried to signal twice in the same turn");
        return;
    }
    self.signal((1 << 15) + self.allResources.length + clusterID, dist);
    self.alreadySignalled = true;
};

signalling.pilgrimToNewChurch = (self, resourceID, shift) => {
    if (self.alreadySignalled) {
        self.log("ERROR! Tried to signal twice in the same turn");
        return;
    }
    self.signal((1<<15) + resourceID, util.norm(shift));
    self.alreadySignalled = true;
};

// done change

const castleUtil = {};

// for castles only
castleUtil.addNewUnits = (self) => {
    for (let i = 0; i < self.visible.length; i++) {
        let r = self.visible[i];
        if (r.team === self.me.team && r.castle_talk >= (1 << 6)) {
            if (self.unitInfo[r.id].type !== -1)
                continue;
            // newly created robot
            self.log("Notified of a new robot!");
            let message = r.castle_talk;
            if (message >> 7 && message < (1 << 7) + self.allResources.length + self.clusters.length) { // pilgrim
                self.unitInfo[r.id].type = SPECS.PILGRIM;
                self.unitInfo[r.id].info = message - (1 << 7); // resource or church ID
                if (self.unitInfo[r.id].info < self.allResources.length) {
                    // resource pilgrim
                    let clusterIndex = self.clusterIDtoIndex[self.allResources[self.unitInfo[id].info].clusterID];
                    for (let j = 0; j < self.clusters[clusterIndex].karb.length; j++) {
                        if (self.clusters[clusterIndex].karb[j] === self.unitInfo[r.id].info) { // karb pilgrim
                            self.clusterProgress[clusterIndex].karb[j] = r.id;
                            self.clusterProgress[clusterIndex].karbPilgirms++;
                        }
                    }
                    for (let j = 0; j < self.clusters[clusterIndex].fuel.length; j++) {
                        if (self.clusters[clusterIndex].fuel[j] === self.unitInfo[r.id].info) { // fuel pilgrim
                            self.clusterProgress[clusterIndex].fuel[j] = r.id;
                            self.clusterProgress[clusterIndex].fuelPilgirms++;
                        }
                    }
                    castleUtil.updateDone(self, self.clusterProgress[clusterIndex]);
                }
                else {
                    // church pilgrim
                    let clusterIndex = self.clusterIDtoIndex[self.unitInfo[id].info - self.allResources.length];
                    self.clusterProgress[clusterIndex].church = 1;
                }
            }
            else if (message >> 7) { // church
                let clusterID = message - ((1 << 7) + self.allResources.length + self.clusters.length);
                self.unitInfo[r.id].type = SPECS.CHURCH;
                self.unitInfo[r.id].info = clusterID;
                let clusterIndex = self.clusterIDtoIndex[clusterID];
                self.clusterProgress[clusterIndex].church = 2;
                castleUtil.updateDone(self, self.clusterProgress[clusterIndex]);
            } // TODO: add comms for new units of other types
            else {
                self.log("ERROR! When adding new unit, unitType is invalid");
            }
        }
    }
};

castleUtil.updateUnitInfo = (self) => {
    // check deaths
    let stillAlive = new Array(4097).fill(false);
    for (let i = 0; i < self.visible.length; i++) {
        if (self.visible[i].team === self.me.team) {
            stillAlive[self.visible[i].id] = true;
        }
    }

    for (let id = 1; id <= 4096; id++) {
        if (self.unitInfo[id].type === -1 || stillAlive[id]) {
            continue;
        }
        if (self.unitInfo[id].type === SPECS.PILGRIM) {
            // unit info for pilgrim is its resource id, or church cluster id
            let clusterIndex = -1;
            if (self.unitInfo[id].info >= self.allResources.length) { // church pilgrim
                clusterIndex = self.clusterIDtoIndex[self.unitInfo[id].info - self.allResources.length];
                self.clusterProgress[clusterIndex].church = -1; // since it died this turn, enemy must be nearby
                // TODO: pilgrim may have been killed on the way, this does not mean enemy occupies cluster
            }
            else if (self.allResources[self.unitInfo[id].info].type === 0) { // karb pilgrim
                clusterIndex = self.clusterIDtoIndex[self.allResources[self.unitInfo[id].info].clusterID];
                for (let j = 0; j < self.clusterProgress[clusterIndex].karb.length; j++) {
                    if (self.clusterProgress[clusterIndex].karb[j] === id) {
                        self.clusterProgress[clusterIndex].karb[j] = -1;
                    }
                }
                self.clusterProgress[clusterIndex].karbPilgrims--;
            }
            else { // fuel pilgrim
                clusterIndex = self.clusterIDtoIndex[self.allResources[self.unitInfo[id].info].clusterID];
                for (let j = 0; j < self.clusterProgress[clusterIndex].fuel.length; j++) {
                    if (self.clusterProgress[clusterIndex].fuel[j] === id) {
                        self.clusterProgress[clusterIndex].fuel[j] = -1;
                    }
                }
                self.clusterProgress[clusterIndex].fuelPilgrims--;
            }
            self.clusterProgress[clusterIndex].done = false;
        }
        else if (self.unitInfo[id].type === SPECS.CASTLE) {
            // unit info for castle is its cluster id (might want to change?)
            let clusterIndex = self.clusterIDtoIndex[self.unitInfo[id].info];
            self.clusters[clusterIndex].castle = 0; // castle no longer exists
            self.clusterProgress[clusterIndex].church = -1; // since it died this turn, enemy must be nearby
            self.clusterProgress[clusterIndex].done = false;
            // TODO: recompute closest castle for all clusters (might not be necessary after self.clusters[clusterIndex].castle = 0)
            // sort clusters again? (need to keep clusterProgress in same order as self.clusters, or index clusterProgress by cluster id)
        }
        else if (self.unitInfo[id].type === SPECS.CHURCH) {
            // unit info for church is its cluster id
            let clusterIndex = self.clusterIDtoIndex[self.unitInfo[id].info];
            self.clusterProgress[clusterIndex].church = -1; // since it died this turn, enemy must be nearby
            self.clusterProgress[clusterIndex].done = false;
        }
        // TODO: add for other unit types
        self.unitInfo[id] = { type: -1, info: -1 };
    }

    // check new units
    castleUtil.addNewUnits(self);
};




// castle resource code


// for castles only
castleUtil.initClusterProgress = (self) => {
    self.clusterProgress = [];
    for (let i = 0; i < self.clusters.length; i++) {
        // clusterProgress.church:
        // 0 means no church
        // 1 means pilgrim moving to build church
        // 2 means church already built
        // -1 means controlled by enemy
        // karbPilgrims, fuelPilgrims, and prophets are lists of IDs
        self.clusterProgress.push({
            church: 0,
            karb: new Array(self.cluster[i].karb.length).fill(-1), // ID of assigned worker
            fuel: new Array(self.cluster[i].fuel.length).fill(-1),
            karbPilgirms: 0,
            fuelPilgrims: 0,
            prophets: [],
            done: false
        });
        if (self.cluster[i].castle > 0) {
            self.clusterProgress[i].church = 2;
        }
        else if (self.cluster[i].castle < 0) {
            self.clusterProgress[i].church = -1;
        }
    }
};

castleUtil.updateDone = (self, clusterIndex) => {
    self.clusterProgress[clusterIndex].done = (self.clusterProgress[clusterIndex].karbPilgirms >= self.clusters[clusterIndex].karb.length
        && self.clusterProgress[clusterIndex].fuelPilgirms >= self.clusters[clusterIndex].fuel.length
        && self.clusterProgress[clusterIndex].prophets.length >= castleUtil.neededDefenseProphets(self, clusterIndex));
};

// for castles only
// move to castleUtil?
castleUtil.getTargetCluster = (self) => {
    if (!self.clusterProgress[self.myCluster].done)
        return self.myCluster; // first priority is to finish your own cluster
    for (let i = 0; i < self.clusters.length; i++) {
        if (self.clusters[i].castle > 0 && !self.clusterProgress[i].done)
            return -1; // wait for other castles to finish setting up their clusters
    }
    // for other clusters, only way for castle to help is to send church pilgrim if church = 0, or attack if church = -1
    for (let i = 0; i < self.clusterProgress.length; i++) {
        if (self.clusterProgress[i].church === 0) {
            // cluster i is the next one to target
            if (self.clusters[i].closestCastle.castleID === self.castleNumber)
                return i; // send a church pilgrim
            else
                return -1; // wait for other castles to send church pilgrim
        }
        else if (self.clusterProgress[i].church === -1) {
            return i; // all castles should attack
        }
    }
};

// for castles and churches only
// always for current cluster
// TODO: fix case when pilgrim killed while id unknown (0). Do this in update by checking new visible units
castleUtil.buildKarbPilgrim = (self) => {
    for (let i = 0; i < self.clusterProgress[self.myCluster].karb.length; i++) {
        if (self.clusterProgress[self.myCluster].karb[i] === -1) {
            // found first needed karb pilgrim
            self.clusterProgress[self.myCluster].karb[i] = 0; // 0 means pilgrim exists but id unknown
            let resourceID = self.clusters[self.myCluster].karb[i];
            let destination = self.allResources[resourceID].pos;
            let shift = castleUtil.closestAdjacent(self, destination);

            self.log("Buliding karb pilgrim at " + util.pairToString(util.addPair(self.loc, shift))
                + " to target karb at " + util.pairToString(destination));
            signalling.pilgrimInitSignal(self, resourceID, shift);
            return self.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
        }
    }
    self.log("ERROR! Tried to build karb pilgrim when desired number is already reached");
};

// for castles and churches only
// always for current cluster
// TODO: fix case when pilgrim killed while id unknown (0). Do this in update by checking new visible units
castleUtil.buildFuelPilgrim = (self) => {
    for (let i = 0; i < self.clusterProgress[self.myCluster].fuel.length; i++) {
        if (self.clusterProgress[self.myCluster].fuel[i] === -1) {
            // found first needed fuel pilgrim
            self.clusterProgress[self.myCluster].fuel[i] = 0; // 0 means pilgrim exists but id unknown
            let resourceID = self.clusters[self.myCluster].fuel[i];
            let destination = self.allResources[resourceID].pos;
            let shift = castleUtil.closestAdjacent(self, destination);

            self.log("Buliding fuel pilgrim at " + util.pairToString(util.addPair(self.loc, shift))
                + " to target fuel at " + util.pairToString(destination));
            signalling.pilgrimInitSignal(self, resourceID, shift);
            return self.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
        }
    }
    self.log("ERROR! Tried to build fuel pilgrim when desired number is already reached");
};

// choose best starting placement around castle
castleUtil.closestAdjacent = (self, destination) => {
    let minDist = 1000000;
    let bestShift = { x: -100, y: -100 };
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            let shift = { x: dx, y: dy };
            let pos = util.addPair(self.loc, shift);
            if (util.empty(pos, self.map, self.robotMap)) {
                if (util.sqDist(pos, destination) < minDist) {
                    minDist = util.sqDist(pos, destination);
                    bestShift = shift;
                }
            }
        }
    }
    return bestShift;
};

castleUtil.buildDefenseMage = (self, enemy) => { // enemy.relPos is relative position to castle
    self.log("Building defense mage to protect against enemy at "
        + util.pairToString(util.addPair(self.loc, enemy.relPos)));
    let minDist = 1000000;
    let bestShift = { x: -100, y: -100 };
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            let shift = { x: dx, y: dy };
            let pos = util.addPairaddPair(self.loc, shift);
            self.log("Considering position " + util.pairToString(pos));
            if (util.empty(pos, self.map, self.robotMap)) {
                self.log("Not empty");
                if (util.sqDist(shift, enemy.relPos) < minDist) {
                    self.log("Closest distance so far");
                    bestShift = shift;
                    minDist = util.sqDist(shift, enemy.relPos);
                }
            }
        }
    }
    if (util.pairEq(bestShift, { x: -100, y: -100 })) {
        self.log("Nowhere to place new mage");
        return;
    }
    self.lastCreated = [
        SPECS.PREACHER,
        bestShift,
        "defense",
        (enemy.unitType === SPECS.PROPHET),
        util.copyPair(enemy.relPos)
    ];
    signalling.queueInitSignal(self, true);
    signalling.sendSignal(self);
    return self.buildUnit(SPECS.PREACHER, bestShift.x, bestShift.y);
};

// for castles and churches
// TODO: take into account distance to enemy castles / middle
castleUtil.neededDefenseProphets = (self, clusterIndex) => {
    // return self.clusters[self.myCluster].mines.length;
    return 0;
};

castleUtil.buildChurchPilgrim = (self, clusterIndex) => {
    // assign pilgrim to closest karb
    // let assignedMine = self.clusters[clusterIndex].karb[0]; // if pilgrims can already calculate, why signal to them?
    let shift = castleUtil.closestAdjacent(self, self.clusters[clusterIndex].churchPos);
    signalling.churchPilgrimInitSignal(self, self.clusters[clusterIndex].id, util.norm(shift));
    return self.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
};

// almost identical to pilgrim's map, but without exception for target mine and base
castleUtil.initAvoidMinesMap = (self) => {
    self.avoidMinesMap = [];
    for (let x = 0; x < self.map.length; x++)
        self.avoidMinesMap.push(new Array(self.map.length));
    for (let x = 0; x < self.map.length; x++) {
        for (let y = 0; y < self.map.length; y++) {
            self.avoidMinesMap[y][x] = (self.map[y][x] && !self.karbonite_map[y][x] && !self.fuel_map[y][x]);
        }
    }
};

const nav = {};

// TODO: when stuck, perform full bfs treating robot positions as fixed
nav.bfs = (start, map) => {
    let q = new Deque(512);
    let visited = new Array(map.length);
    let dist = new Array(map.length);
    for (let i = 0; i < map.length; i++) {
        visited[i] = new Array(map[0].length).fill(false);
        dist[i] = new Array(map[0].length).fill(1000000);
    }
    q.push(start);
    visited[start.y][start.x] = true;
    dist[start.y][start.x] = 0;
    while (!q.isEmpty()) {
        let v = q.shift();
        let adj = [[1, 0], [0, 1], [-1, 0], [0, -1]];
        for (let i = 0; i < 4; i++) {
            let u = { x: v.x + adj[i][0], y: v.y + adj[i][1] };
            if (util.empty(u, map) && !visited[u.y][u.x]) {
                q.push(u);
                visited[u.y][u.x] = true;
                dist[u.y][u.x] = dist[v.y][v.x] + 1;
            }
        }
    }
    return dist;
};

nav.fullBFS = (start, map, speed, beside = false) => {
    let q = new Deque(512);
    let visited = new Array(map.length);
    let dist = new Array(map.length);
    for (let i = 0; i < map.length; i++) {
        visited[i] = new Array(map[0].length).fill(false);
        dist[i] = new Array(map[0].length).fill(1000000);
    }
    if (beside) {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0)
                    continue;
                let pos = { x: start.x + dx, y: start.y + dy };
                if (util.empty(pos, map)) {
                    q.push(pos);
                    visited[pos.y][pos.x] = true;
                    dist[pos.y][pos.x] = 0;
                }
            }
        }
    }
    else {
        q.push(start);
        visited[start.y][start.x] = true;
        dist[start.y][start.x] = 0;
    }
    let s = Math.floor(Math.sqrt(speed));
    let shifts = [];
    for (let dx = -s; dx <= s; dx++) {
        for (let dy = -s; dy <= s; dy++) {
            let shift = { x: dx, y: dy };
            if (util.norm(shift) <= speed) {
                shifts.push(shift);
            }
        }
    }
    while (!q.isEmpty()) {
        let v = q.shift();
        for (let i = 0; i < shifts.length; i++) {
            let u = util.addPair(v, shifts[i]);
            if (util.empty(u, map) && !visited[u.y][u.x]) {
                q.push(u);
                visited[u.y][u.x] = true;
                dist[u.y][u.x] = dist[v.y][v.x] + 1;
            }
        }
    }
    return dist;
};

nav.move = (loc, bfsGrid, map, robots, speed, forceMove = false) => {
    let minDist = 1000000;
    let minCost = 1000000;
    let bestMove = { x: -100, y: -100 };
    for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
            let next = { x: loc.x + dx, y: loc.y + dy };
            if (util.sqDist(loc, next) <= speed && (util.empty(next, map, robots) || (dx === 0 && dy === 0 && !forceMove))) {
                // prioritize fast over cost
                if (bfsGrid[next.y][next.x] < minDist || (bfsGrid[next.y][next.x] === minDist && util.sqDist(loc, next) < minCost)) {
                    minDist = bfsGrid[next.y][next.x];
                    minCost = util.sqDist(loc, next);
                    bestMove = { x: dx, y: dy };
                }
            }
        }
    }
    return bestMove;
};

const resource = {};

// will not need
resource.assignAreaToCastles = (self) => {
    let area = [];
    for (let x = 0; x < self.map.length; x++)
        area.push(new Array(self.map.length));
    self.castleBFS = [];
    self.enemyCastleBFS = [];
    for (let i = 0; i < self.castles.length; i++) {
        self.castleBFS.push(nav.bfs(self.castlePos[i], self.map));
        self.enemyCastleBFS.push(nav.bfs(self.enemyCastlePos[i], self.map));
    }
    for (let x = 0; x < self.map.length; x++) {
        for (let y = 0; y < self.map.length; y++) {
            let yourMinDist = 1000000;
            let yourBestCastle = -1;
            for (let i = 0; i < self.castles.length; i++) {
                if (self.castleBFS[i][y][x] < yourMinDist) {
                    yourBestCastle = i;
                    yourMinDist = self.castleBFS[i][y][x];
                }
            }
            let enemyMinDist = 1000000;
            let enemyBestCastle = -1;
            for (let i = 0; i < self.enemyCastlePos.length; i++) {
                if (self.enemyCastleBFS[i][y][x] < enemyMinDist) {
                    enemyBestCastle = i;
                    enemyMinDist = self.enemyCastleBFS[i][y][x];
                }
            }
            if (yourMinDist < enemyMinDist) {
                area[y][x] = { team: self.me.team, castle: yourBestCastle, dist: yourMinDist };
            }
            else if (enemyMinDist < yourMinDist) {
                area[y][x] = { team: self.me.team ^ 1, castle: enemyBestCastle, dist: enemyMinDist }; // combine into -enemyBestCastle?
            }
            else {
                area[y][x] = { team: -1, castle: yourBestCastle, dist: yourMinDist };
            }
        }
    }
    return area;
};

// consider sorting by sqDist if bfsDist is equal, to reduce travel cost
// need to update all targetKarb for new structure
resource.initResourceList = (self) => {
    self.log("Init Resource List");
    self.targetKarb = [];
    self.targetFuel = [];
    for (let x = 0; x < self.map.length; x++) {
        for (let y = 0; y < self.map.length; y++) {
            if (self.karbonite_map[y][x]) {
                // self.log(pairToString({x:x, y:y})+" has karb!");
                if (self.assignedArea[y][x].team === self.me.team) {
                    // self.log(pairToString({x:x, y:y})+" is assinged to my team");
                    self.targetKarb.push({
                        dist: self.assignedArea[y][x].dist,
                        assignedCastle: self.assignedArea[y][x].castle,
                        pos: { x: x, y: y },
                        assignedWorker: -1 // only used for castles, not pilgrims
                    });
                }
            }
            if (self.fuel_map[y][x]) {
                if (self.assignedArea[y][x].team === self.me.team) {
                    self.targetFuel.push({
                        dist: self.assignedArea[y][x].dist,
                        assignedCastle: self.assignedArea[y][x].castle,
                        pos: { x: x, y: y },
                        assignedWorker: -1
                    });
                }
            }
        }
    }

    self.targetKarb.sort(util.customSort);
    self.targetFuel.sort(util.customSort);
    while (self.targetKarb.length > self.maxKarbPilgrims) {
        self.targetKarb.pop();
    }
    while (self.targetFuel.length > self.maxFuelPilgrims) {
        self.targetFuel.pop();
    }
};


// move goals to castle?
resource.karbGoalStatus = (self, goal) => {
    let goalReached = true;
    let canHelp = false;
    for (let i = 0; i < Math.min(self.targetKarb.length, goal); i++) {
        if (self.targetKarb[i].assignedWorker === -1) {
            goalReached = false;
            if (self.targetKarb[i].assignedCastle === self.castleNumber)
                canHelp = true;
        }
    }
    return { reached: goalReached, canHelp: canHelp };
};

// move goals to castle?
resource.fuelGoalStatus = (self, goal) => {
    let goalReached = true;
    let canHelp = false;
    for (let i = 0; i < Math.min(self.targetFuel.length, goal); i++) {
        if (self.targetFuel[i].assignedWorker === -1) {
            goalReached = false;
            if (self.targetFuel[i].assignedCastle === self.castleNumber)
                canHelp = true;
        }
    }
    return { reached: goalReached, canHelp: canHelp };
};

resource.canMaintainBuffer = (self, unitType) => {
    return (self.karbonite - SPECS.UNITS[unitType].CONSTRUCTION_KARBONITE >= self.karbBuffer
        && self.fuel - SPECS.UNITS[unitType].CONSTRUCTION_FUEL >= self.fuelBuffer);
};

// main function
resource.mainInit = (self) => {
    resource.initFullResourceList(self);
    resource.splitIntoClusters(self);
    for (let i = 0; i < self.clusters.length; i++) {
        resource.computeChurchPosition(self, self.clusters[i]);
        self.clusters[i].mines.sort(util.compareDistToPoint(self.clusters[i].churchPos));
        resource.splitByResource(self, self.clusters[i]);
    }
    resource.assignClusterIDs(self);
    if (self.me.unit === SPECS.CASTLE) {
        resource.findCastleClusters(self);
        for (let i = 0; i < self.clusters.length; i++) {
            resource.findClosestCastle(self, self.clusters[i]);
        }
        self.clusters.sort(resource.sortByPriority);
        self.clusterIDtoIndex = new Array(self.clusters.length);
        for (let i = 0; i < self.clusters.length; i++) {
            self.clusterIDtoIndex[self.clusters[i].id] = i;
        }
    }
    self.log("Finished making clusters!");
    for (let i = 0; i < self.clusters.length; i++)
        self.log(self.clusters[i]);
};

resource.initFullResourceList = (self) => {
    self.allResources = [];
    for (let x = 0; x < self.map.length; x++) {
        for (let y = 0; y < self.map.length; y++) {
            if (self.karbonite_map[y][x])
                self.allResources.push({ type: 0, pos: { x: x, y: y }, clusterID: -1 });
            else if (self.fuel_map[y][x])
                self.allResources.push({ type: 1, pos: { x: x, y: y }, clusterID: -1 });
        }
    }
    self.log("self.allResources");
    for (let i = 0; i < self.allResources.length; i++) {
        self.log("self.allResources[" + i + "].pos = " + util.pairToString(self.allResources[i].pos));
    }
};

resource.splitIntoClusters = (self) => {
    self.resourceGraph = new Array(self.allResources.length);
    for (let i = 0; i < self.allResources.length; i++)
        self.resourceGraph[i] = [];
    for (let i = 0; i < self.allResources.length; i++) {
        for (let j = i + 1; j < self.allResources.length; j++) {
            if (util.L1Norm(self.allResources[i].pos, self.allResources[j].pos) <= 6) {
                self.resourceGraph[i].push(j);
                self.resourceGraph[j].push(i);
            }
        }
    }
    let inCluster = new Array(self.allResources.length).fill(false);
    self.clusters = [];
    for (let i = 0; i < self.allResources.length; i++) {
        if (inCluster[i])
            continue;
        let connectedComponent = util.getConnectedComponents(self.resourceGraph, i);
        self.log("New Cluster!");
        for (let j = 0; j < connectedComponent.length; j++) {
            inCluster[connectedComponent[j]] = true;
            self.log(util.pairToString(self.allResources[connectedComponent[j]].pos));
        }
        self.clusters.push({
            mines: connectedComponent,
            castle: 0,
            churchPos: { x: -1, y: -1 },
            karb: [],
            fuel: [],
            id: -1,
            closestCastle: { castleID: -1, dist: -1 }
        });
    }
};

// let allCliques = false;
//     let inClique = new Array(self.allResources.length).fill(false);
//     self.clusters = [];
//     while (!allCliques) {
//         let changed = false;
//         for (let i = 0; i < self.allResources.length; i++) {
//             if (inClique[i])
//                 continue;
//             let connectedComponent = util.getConnectedComponents(self.resourceGraph, i);
//             let thisIsClique = true;
//             for (let j = 0; j < connectedComponent.length; j++) {
//                 if (self.resourceGraph[connectedComponent[j]].length !== connectedComponent.length - 1) {
//                     thisIsClique = false;
//                     let edge = util.removeEdge(self.resourceGraph, connectedComponent);
//                     self.log("Removing edge " + edge[0] + " - " + edge[1]);
//                     if (edge[0] === -1) {
//                         for (let k = 0; k < connectedComponent.length; k++) {
//                             self.log("adj[" + connectedComponent[k] + "]: " + self.resourceGraph[connectedComponent[k]]);
//                         }
//                     }
//                     self.resourceGraph[edge[0]].splice(self.resourceGraph[edge[0]].indexOf(edge[1]), 1); // TODO: move into removeEdge function if logging is not needed
//                     self.resourceGraph[edge[1]].splice(self.resourceGraph[edge[1]].indexOf(edge[0]), 1);
//                     changed = true;
//                     break;
//                 }
//             }
//             if (thisIsClique) {
//                 self.log("New Clique Found!");
//                 for (let j = 0; j < connectedComponent.length; j++) {
//                     inClique[connectedComponent[j]] = true;
//                     self.log(util.pairToString(self.allResources[connectedComponent[j]].pos));
//                 }
//                 self.clusters.push({
//                     mines: connectedComponent,
//                     castle: 0,
//                     churchPos: { x: -1, y: -1 },
//                     karb: [],
//                     fuel: [],
//                     id: -1,
//                     closestCastle: { castleID: -1, dist: -1 }
//                 });
//             }
//             if (changed)
//                 break;
//         }
//         allCliques = true;
//         for (let i = 0; i < inClique.length; i++) {
//             if (!inClique[i])
//                 allCliques = false;
//         }
//     }

resource.computeChurchPosition = (self, cluster) => {
    // if (cluster.hasCastle) // doesn't need a church because it has a castle
    //     return; // might calculate churchPos anyway, to number clusters without castle location knowledge
    let minX = 1000;
    let minY = 1000;
    let maxX = -1000;
    let maxY = -1000;
    for (let i = 0; i < cluster.mines.length; i++) {
        minX = Math.min(minX, self.allResources[cluster.mines[i]].pos.x);
        minY = Math.min(minY, self.allResources[cluster.mines[i]].pos.y);
        maxX = Math.max(maxX, self.allResources[cluster.mines[i]].pos.x);
        maxY = Math.max(maxY, self.allResources[cluster.mines[i]].pos.y);
    }
    minX = Math.max(0, minX - 1);
    minY = Math.max(0, minY - 1);
    maxX = Math.min(self.map.length - 1, maxX + 1);
    maxY = Math.min(self.map.length - 1, maxY + 1);
    self.log("minX = " + minX + ", maxX = " + maxX + ", minY = " + minY + ", maxY = " + maxY);

    let smallMap = [];
    let adjacentMines = [];
    let extraTime = [];
    // let bfs = [];
    for (let i = 0; i <= maxY - minY; i++) {
        smallMap.push(new Array(maxX - minX + 1));
        adjacentMines.push(new Array(maxX - minX + 1).fill(0));
        extraTime.push(new Array(maxX - minX + 1).fill(0));
        // bfs.push(new Array(maxX - minX + 1));
    }

    for (let x = 0; x <= maxX - minX; x++) {
        for (let y = 0; y <= maxY - minY; y++) {
            smallMap[y][x] = self.map[y + minY][x + minX]; // TODO: pilgrims avoid all mines except their own
        }
    }

    let foundChurch = false;
    let maxAdjacentMines = -1;
    for (let x = 0; x <= maxX - minX; x++) {
        for (let y = 0; y <= maxY - minY; y++) {
            if (smallMap[y][x]) {
                foundChurch = true;
                // calculate number of adjacent mines
                for (let i = 0; i < 8; i++) {
                    let p = util.addPair({ x: x + minX, y: y + minY }, util.unhashShift(i));
                    if (util.inGrid(p, self.map) && (self.karbonite_map[p.y][p.x] || self.fuel_map[p.y][p.x]))
                        adjacentMines[y][x]++;
                }
                maxAdjacentMines = Math.max(maxAdjacentMines, adjacentMines[y][x]);
            }
        }
    }
    if (!foundChurch) {
        self.log("ERROR! No possible church location in rectangle");
        self.log("Cluster:");
        self.log(cluster);
        self.log("minX = " + minX + ", maxX = " + maxX + ", minY = " + minY + ", maxY = " + maxY);
    }

    // for pilgrim passing chain

    // for (let x = 0; x <= maxX - minX; x++) {
    //     for (let y = 0; y <= maxY - minY; y++) {
    //         if (adjacentMines[y][x] >= maxAdjacentMines - 1
    //             || self.karbonite_map[y + minY][x + minX] || self.fuel_map[y + minY][x + minX]) {
    //             // bfs might be slow, even when bounded
    //             bfs[y][x] = nav.fullBFS({ x: x, y: y }, smallMap, SPECS.UNITS[SPECS.PILGRIMS].SPEED, true);
    //         }
    //     }
    // }

    let minExtraTime = 1000000;
    for (let x = 0; x <= maxX - minX; x++) {
        for (let y = 0; y <= maxY - minY; y++) {
            if (adjacentMines[y][x] >= maxAdjacentMines - 1) {
                let bfs = nav.fullBFS({ x: x, y: y }, smallMap, SPECS.UNITS[SPECS.PILGRIM].SPEED, true);
                // calculate nunber of extra turns needed
                self.log("Considering church position " + util.pairToString({ x: x + minX, y: y + minY }));
                let extraTime = 0;
                for (let i = 0; i < cluster.mines.length; i++) {
                    extraTime += bfs[self.allResources[cluster.mines[i]].pos.y - minY][self.allResources[cluster.mines[i]].pos.x - minX];
                }
                self.log("Extra time = " + extraTime);
                if (extraTime < minExtraTime) {
                    minExtraTime = extraTime;
                    cluster.churchPos = { x: x + minX, y: y + minY };
                }
            }
        }
    }
};

resource.sortByChurchPos = (a, b) => {
    if (a.churchPos.x !== b.churchPos.x)
        return a.churchPos.x - b.churchPos.x;
    else
        return a.churchPos.y - b.churchPos.y;
};

resource.assignClusterIDs = (self) => {
    self.clusters.sort(resource.sortByChurchPos);
    for (let i = 0; i < self.clusters.length; i++) {
        self.clusters[i].id = i;
        for (let j = 0; j < self.clusters[i].mines.length; j++) {
            self.allResources[self.clusters[i].mines[j]].clusterID = i;
        }
    }
};

// TODO: set church = 2 or church = -1
// for castles only
resource.findCastleClusters = (self) => {
    for (let i = 0; i < self.castlePos.length; i++) {
        let minDist = 1000000;
        let closest = -1;
        for (let j = 0; j < self.allResources.length; j++) {
            if (util.sqDist(self.castlePos[i], self.allResources[j].pos) < minDist) {
                minDist = util.sqDist(self.castlePos[i], self.allResources[j].pos);
                closest = j;
            }
        }
        // Consider specifying which castle?
        // Should add enemy castles too, attack those last
        for (let j = 0; j < self.clusters.length; j++) {
            if (self.clusters[j].mines.includes(closest)) {
                self.clusters[j].castle = i + 1;
                // self.clusters[j].churchPos = util.copyPair(self.castlePos[i]);
            }
        }
    }
    // enemy castles
    for (let i = 0; i < self.enemyCastlePos.length; i++) {
        let minDist = 1000000;
        let closest = -1;
        for (let j = 0; j < self.allResources.length; j++) {
            if (util.sqDist(self.enemyCastlePos[i], self.allResources[j].pos) < minDist) {
                minDist = util.sqDist(self.enemyCastlePos[i], self.allResources[j].pos);
                closest = j;
            }
        }
        // Consider specifying which castle?
        // Should add enemy castles too, attack those last
        for (let j = 0; j < self.clusters.length; j++) {
            if (self.clusters[j].mines.includes(closest)) {
                self.clusters[j].castle = -(i + 1);
                // self.clusters[j].churchPos = util.copyPair(self.castlePos[i]);
            }
        }
    }
};

resource.splitByResource = (self, cluster) => {
    for (let i = 0; i < cluster.mines.length; i++) {
        if (self.allResources[cluster.mines[i]].type === 0) // karb
            cluster.karb.push(cluster.mines[i]);
        else
            cluster.fuel.push(cluster.mines[i]);
    }
};

// for castles only
resource.findClosestCastle = (self, cluster) => {
    cluster.closestCastle.dist = 1000000;
    for (let i = 0; i < self.castlePos.length; i++) {
        if (util.sqDist(cluster.churchPos, self.castlePos[i]) < cluster.closestCastle.dist) {
            cluster.closestCastle.castleID = i;
            cluster.closestCastle.dist = util.sqDist(cluster.churchPos, self.castlePos[i]);
        }
    }
};

// TODO: take distance to enemy castles into account, or distance to center
// for castles only
resource.sortByPriority = (a, b) => {
    if (a.castle !== b.castle)
        return b.castle - a.castle;
    if (a.mines.length !== b.mines.length)
        return b.mines.length - a.mines.length;
    if (a.karb.length !== b.karb.length)
        return b.karb.length - a.karb.length;
    if (a.closestCastle.dist !== b.closestCastle.dist)
        return a.closestCastle.dist - b.closestCastle.dist;
    if (a.churchPos.x !== b.churchPos.x)
        return a.churchPos.x - b.churchPos.x;
    if (a.churchPos.y !== b.churchPos.y)
        return a.churchPos.y - b.churchPos.y;
};

const castle = {};

castle.takeTurn = (self) => {
    self.loc = { x: self.me.x, y: self.me.y }; // change to let loc
    self.log("Castle Position: " + util.pairToString(self.loc));

    if (self.me.turn === 1) {
        self.castles = [];
        self.castlePos = [];
        self.churchPos = [];
        for (let i = 0; i < self.visible.length; i++) {
            let r = self.visible[i];
            if (r.team === self.me.team) { // cannot check r.unit === SPECS.CASTLE because r.unit is undefined when r is not visible
                self.castles.push(-1);
                self.castlePos.push({ x: -1, y: -1 });
            }
        }
        self.castleNumber = 0;
        for (let i = 0; i < self.visible.length; i++) {
            let r = self.visible[i];
            if (r.team === self.me.team && r.id !== self.me.id) {
                if ((r.castle_talk >> 6) !== 0) {
                    let rCastleNumber = (r.castle_talk >> 6) - 1;
                    self.castles[rCastleNumber] = r.id;
                    self.castlePos[rCastleNumber].x = r.castle_talk & ((1 << 6) - 1);
                    self.castleNumber++;
                }
            }
        }
        self.castles[self.castleNumber] = self.me.id;
        self.castlePos[self.castleNumber] = { x: self.me.x, y: self.me.y };
        self.castleTalk(((self.castleNumber + 1) << 6) + self.me.x);

        self.unitInfo = [];
        for (let i = 0; i <= 4096; i++) {
            self.unitInfo.push({ type: -1, info: -1 });
        }
        // other init things
        // self.lastCreated = null;
        // self.prioritySignalQueue = new Deque();
        // self.signalQueue = new Deque();
        return;
    }
    else if (self.me.turn === 2) {
        for (let i = 0; i < self.visible.length; i++) {
            let r = self.visible[i];
            if (r.team === self.me.team && r.id !== self.me.id) {
                if ((r.castle_talk >> 6) !== 0) {
                    let rCastleNumber = (r.castle_talk >> 6) - 1;
                    if (rCastleNumber < self.castleNumber) { // r's second signal is y coordinate
                        self.castlePos[rCastleNumber].y = r.castle_talk & ((1 << 6) - 1);
                    }
                    else { // r's first signal is x coordinate
                        self.castles[rCastleNumber] = r.id;
                        self.castlePos[rCastleNumber].x = r.castle_talk & ((1 << 6) - 1);
                    }
                }
            }
        }
        self.castleTalk(((self.castleNumber + 1) << 6) + self.me.y);
        return;
    }
    else if (self.me.turn === 3) {
        for (let i = 0; i < self.visible.length; i++) {
            let r = self.visible[i];
            if (r.team === self.me.team && r.id !== self.me.id) {
                if ((r.castle_talk >> 6) !== 0) {
                    let rCastleNumber = (r.castle_talk >> 6) - 1;
                    if (rCastleNumber > self.castleNumber) { // r's second signal is y coordinate
                        // self.log("Castle " + rCastleNumber + " sent castleTalk message " + r.castle_talk & ((1 << 6) - 1));
                        self.castlePos[rCastleNumber].y = r.castle_talk & ((1 << 6) - 1);
                    }
                }
            }
        }

        self.log("I am castle number #" + self.castleNumber);
        // self.log("Castles IDs:");
        // self.log(self.castles);
        // self.log("is ID 438 new? " + self.isNewID(438));
        // self.log("Found castle positions");
        // self.log(self.castlePos);

        util.findSymmetry(self);
        self.enemyCastlePos = [];
        for (let i = 0; i < self.castles.length; i++) {
            self.enemyCastlePos.push(util.reflect(self, self.castlePos[i]));
        }

        castleUtil.initAvoidMinesMap(self);
        resource.mainInit(self);
        for (let i = 0; i < self.clusters.length; i++) {
            if (self.clusters[i].castle === self.castleNumber + 1) {
                self.myCluster = i;
            }
        }
        castleUtil.initClusterProgress(self);

        // self.castles already exists
        // self.churches = [];
        // self.pilgrims = [];
        // self.crusaders = [];
        // self.prophets = []; // rangers
        // self.preachers = []; // mages/tanks

        self.karbBuffer = 60; // TODO: make it dynamic
        self.fuelBuffer = 300; // TODO: make it dynamic
    }

    castleUtil.updateUnitInfo(self, self.visible); // add updates to clusterProgress

    let visibleEnemies = util.findEnemies(self, self.visible);
    let targetCluster = castleUtil.getTargetCluster(self);

    if (util.hasSpaceAround(self)) {
        if (visibleEnemies.length > 0) { // change to if any cluster is under attack
            self.log("Under attack!");
            visibleEnemies.sort(compareDist);
            if (util.canBuild(self, SPECS.PREACHER)) {
                return self.buildDefenseMage(visibleEnemies[0]);
            }
        }
        else if (targetCluster === self.myCluster) {
            if (self.clusterProgress[self.myCluster].karbPilgrims < self.clusters[self.myCluster].karb.length) {
                // build more karb pilgrims
                if (resource.canMaintainBuffer(self, SPECS.PILGRIM)) {
                    return castleUtil.buildKarbPilgrim(self); // add way to properly choose mine for pilgrim
                }
                else {
                    // build up more resources before expanding, to maintain buffer
                    self.log("Saving for karb pilgrim");
                    signalling.sendSignal(self);
                    return;
                }
            }
            else if (self.clusterProgress[self.myCluster].fuelPilgrims < self.clusters[self.myCluster].fuel.length) {
                if (resource.canMaintainBuffer(self, SPECS.PILGRIM)) {
                    return castleUtil.buildFuelPilgrim(self);
                }
                else {
                    // build up more resources before expanding, to maintain buffer
                    self.log("Saving for fuel pilgrim");
                    signalling.sendSignal(self);
                    return;
                }
            } // neededDefenseProphets should take turn number (and previous enemy attacks?) into account
            else if (self.clusterProgress[self.myCluster].prophets.length < castleUtil.neededDefenseProphets(self)) {
                if (resource.canMaintainBuffer(self, SPECS.PROPHET)) {
                    self.log("Should have built defense prophet");
                    // return castleUtil.buildDefenseProphet(self);
                }
                else {
                    // build up more resources before expanding, to maintain buffer
                    self.log("Saving for defense mage");
                    signalling.sendSignal(self);
                    return;
                }
            }
            else {
                self.log("ERROR! my cluster already has all karb pilgrims, fuel pilgrims, and prophets needed");
                signalling.sendSignal(self);
                return;
            }
        }
        else if (targetCluster !== -1) {
            // cluster mines are fully occupied by pilgrims and has enough defense. Time to expand
            if (self.clusterProgress[targetCluster].church === 0) {
                return castleUtil.buildChurchPilgrim(self, targetCluster);
            }
            else if (self.clusterProgress[targetCluster].church === -1) ;
            else {
                self.log("ERROR! target cluster's church status is neither 0 not 1");
            }
        }
        else {
            self.log("Waiting for other castles to finish their cluster or build new churches");
        }
    }
    // self.log("Current number of karb pilgrims: " + self.karbPilgrims.length);
    // self.log("Current number of fuel pilgrims: " + self.fuelPilgrims.length);

    signalling.sendSignal(self);
};

const church = {};

const pilgrimUtil = {};

// TODO: also check for base death
pilgrimUtil.searchCastlesOrChurches = (self) => {
    for (let i = 0; i < self.visible.length; i++) {
        let r = self.visible[i];
        let alreadyFound = false;
        let pos = { x: r.x, y: r.y };
        if (r.unit === SPECS.CASTLE) {
            if (r.team === self.me.team) {
                for (let j = 0; j = self.foundCastles.length; j++) {
                    if (util.pairEq(self.foundCastles[j], pos))
                        alreadyFound = true;
                }
                if (!alreadyFound) {
                    self.foundCastles.push(pos);
                    self.foundEnemyCastles.push(util.reflect(self, pos));
                }
            }
            else {
                for (let j = 0; j = self.foundEnemyCastles.length; j++) {
                    if (util.pairEq(self.foundEnemyCastles[j], pos))
                        alreadyFound = true;
                }
                if (!alreadyFound) {
                    self.foundEnemyCastles.push(pos);
                    self.foundCastles.push(util.reflect(self, pos));
                }
            }
        }
        else if (r.unit === SPECS.CHURCH) {
            if (r.team === self.me.team) {
                for (let j = 0; j = self.foundChurches.length; j++) {
                    if (util.pairEq(self.foundChurches[j], pos))
                        alreadyFound = true;
                }
                if (!alreadyFound) {
                    self.foundChurches.push(pos);
                }
            }
            else {
                for (let j = 0; j = self.foundEnemyChurches.length; j++) {
                    if (util.pairEq(self.foundEnemyChurches[j], pos))
                        alreadyFound = true;
                }
                if (!alreadyFound) {
                    self.foundEnemyChurches.push(pos);
                    // TODO: signal to castles that enemy church exists
                }
            }
        }
    }
};

pilgrimUtil.initAvoidMinesMap = (self) => {
    self.avoidMinesMap = [];
    for (let x = 0; x < self.map.length; x++)
        self.avoidMinesMap.push(new Array(self.map.length));
    for (let x = 0; x < self.map.length; x++) {
        for (let y = 0; y < self.map.length; y++) {
            // must be passable with no mine, except for personal mine
            self.avoidMinesMap[y][x] = (self.map[y][x] && !self.karbonite_map[y][x] && !self.fuel_map[y][x]);
            if (util.pairEq(self.targetMine, { x: x, y: y }))
                self.avoidMinesMap[y][x] = true;
        }
    }
    self.avoidMinesMap[self.base.y][self.base.x] = false;
};

// TODO: replace self.targetMine with mineIDs
// pilgrimUtil.pilgrimInit = (self) => {
//     self.log("Initializing pilgrim");
//     util.findSymmetry(self);
//     self.enemyCastlePos = [];
//     for (let i = 0; i < self.castles.length; i++) {
//         self.enemyCastlePos.push(util.reflect(self, self.castlePos[i]));
//     }
//     self.assignedArea = resource.assignAreaToCastles(self);
//     resource.initResourceList(self);
//     // self.log("Target karb right after initializing it");
//     // self.log(self.targetKarb);

//     if (self.targetResource === "karb") {
//         self.targetMine = util.copyPair(self.targetKarb[self.targetID].pos);
//     }
//     else {
//         self.targetMine = util.copyPair(self.targetFuel[self.targetID].pos);
//     }

//     // self.bfsFromBase = bfs(self.base, self.map);
//     // self.log("Original target mine: " + pairToString(self.targetKarb[self.targetID].pos));
//     // self.log("Target mine: " + pairToString(self.targetMine));
//     // self.bfsFromMine = bfs(self.targetMine, self.map);

//     self.avoidMinesMap = [];
//     for (let x = 0; x < self.map.length; x++)
//         self.avoidMinesMap.push(new Array(self.map.length));
//     for (let x = 0; x < self.map.length; x++) {
//         for (let y = 0; y < self.map.length; y++) {
//             // must be passable with no mine, except for personal mine
//             self.avoidMinesMap[y][x] = (self.map[y][x] && !self.karbonite_map[y][x] && !self.fuel_map[y][x]);
//             if (util.pairEq(self.targetMine, { x: x, y: y }))
//                 self.avoidMinesMap[y][x] = true;
//         }
//     }
//     // change when castle is destroyed
//     for (let i = 0; i < self.castlePos.length; i++) {
//         self.avoidMinesMap[self.castlePos[i].y][self.castlePos[i].x] = false;
//         self.avoidMinesMap[self.enemyCastlePos[i].y][self.enemyCastlePos[i].x] = false;
//     }
//     // set false for churches too
//     self.avoidMinesBaseBFS = nav.fullBFS(self.base, self.avoidMinesMap, SPECS.UNITS[self.me.unit].SPEED, true);
//     self.avoidMinesResourceBFS = nav.fullBFS(self.targetMine, self.avoidMinesMap, SPECS.UNITS[self.me.unit].SPEED);
//     self.log("I am a pilgrim that just got initialized");
//     self.log("Target Resource: " + self.targetResource);
//     self.log("Base castle: " + util.pairToString(self.base));
//     self.log("Target Mine: " + util.pairToString(self.targetMine));
//     // self.log("All target karb:");
//     // self.log(self.targetKarb);
// }

pilgrimUtil.pilgrimDontDoNothing = (self) => {
    self.log("Trying to not do nothing");
    // if (self.karbonite_map[self.loc.y][self.loc.x]){
    //     self.log("I'm standing on a karb mine!");
    // }
    // if (self.fuel_map[self.loc.y][self.loc.x]) {
    //     self.log("I'm standing on a fuel mine!");
    //     if (self.me.fuel < SPECS.UNITS[self.me.unit].FUEL_CAPACITY)
    //         self.log("I'm not carrying my max fuel, so I should mine it");
    //     if (self.fuel >= SPECS.MINE_FUEL_COST) 
    //         self.log("My team has enough fuel for me to use self.mine()");
    // }
    if (self.karbonite_map[self.loc.y][self.loc.x]
        && self.me.karbonite < SPECS.UNITS[self.me.unit].KARBONITE_CAPACITY
        && self.fuel >= SPECS.MINE_FUEL_COST) {
        // self.lastMoveNothing = false;
        self.log("Mining random karb mine");
        if (self.state !== "waiting for castle locations" && self.targetResource === "karb") {
            if (self.me.karbonite + SPECS.KARBONITE_YIELD >= SPECS.UNITS[self.me.unit].KARBONITE_CAPACITY) {
                // accidentally mined all of target karb from another mine
                self.state = "going to base";
            }
        }
        return self.mine();
    }
    if (self.fuel_map[self.loc.y][self.loc.x]
        && self.me.fuel < SPECS.UNITS[self.me.unit].FUEL_CAPACITY
        && self.fuel >= SPECS.MINE_FUEL_COST) {
        // self.lastMoveNothing = false;
        self.log("Mining random fuel mine");
        if (self.state !== "waiting for castle locations" && self.targetResource === "fuel") {
            if (self.me.fuel + SPECS.FUEL_YIELD >= SPECS.UNITS[self.me.unit].FUEL_CAPACITY) {
                // accidentally mined all of target fuel from another mine
                self.state = "going to base";
            }
        }
        return self.mine();
    }
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (util.hasVisibleUnit(self, { x: self.loc.x + dx, y: self.loc.y + dy }, SPECS.CASTLE)
                || util.hasVisibleUnit(self, { x: self.loc.x + dx, y: self.loc.y + dy }, SPECS.CHURCH)) {
                if (self.me.karbonite > 0 || self.me.fuel > 0) {
                    // self.lastMoveNothing = false;
                    self.log("Depositing resources at random castle/church");
                    return self.give(dx, dy, self.me.karbonite, self.me.fuel);
                }
            }
        }
    }
    // self.lastMoveNothing = true;
    self.log("I wasted my turn");
    return;
};

const pilgrim = {};

pilgrim.takeTurn = (self) => {
    self.loc = { x: self.me.x, y: self.me.y };
    self.log("Pilgrim Position: " + util.pairToString(self.loc));
    self.log("I have " + self.me.karbonite + " karb and " + self.me.fuel + " fuel");

    if (self.me.turn === 1) {
        resource.mainInit(self);
        self.foundCastles = [];
        self.foundChurches = [];
        self.foundEnemyCastles = [];
        self.foundEnemyChurches = [];
        // self.baseInitialized = false;
    }

    pilgrimUtil.searchCastlesOrChurches(self);

    if (self.me.turn === 1) {
        let receivedMessage = false;
        for (let i = 0; i < self.visible.length; i++) {
            let r = self.visible[i];
            if (r.team === self.me.team
                && (r.unit === SPECS.CASTLE || r.unit === SPECS.CHURCH)
                && self.isRadioing(r) && (r.signal >> 15)
                && util.sqDist(self.loc, { x: r.x, y: r.y })) {
                // signal is meant for me!
                self.log("I got a message!");
                receivedMessage = true;

                let message = r.signal - (1 << 15);
                if (message < self.allResources.length) { // resource pilgrim
                    self.targetMineID = message;
                    self.targetResource = self.allResources[self.targetMineID].type;
                    self.targetMinePos = self.allResources[message].pos;
                    self.myClusterID = self.allResources[message].cluster;
                    self.base = { x: r.x, y: r.y };
                    self.state = "going to mine";
                }
                else {
                    self.myClusterID = message - self.allResources.length;
                    self.targetMineID = self.clusters[self.myClusterID].karb[0];
                    self.targetResource = 0;
                    self.targetMinePos = self.allResources[self.targetMineID].pos;
                    self.base = self.clusters[self.myClusterID].churchPos;
                    self.state = "going to build church";
                }
                self.castleTalk(message);
                util.findSymmetry(self); // why does the pilgrim need this?
                pilgrimUtil.initAvoidMinesMap(self);
                self.bfsFromMine = nav.fullBFS(self.targetMinePos, self.avoidMinesMap, SPECS.UNITS[self.me.unit].SPEED);
                self.bfsFromBase = nav.fullBFS(self.base, self.avoidMinesMap, SPECS.UNITS[self.me.unit].SPEED, true);
                self.log("I am a pilgrim that just got initialized");
                self.log("Target Resource: " + self.targetResource);
                self.log("Base castle or church: " + util.pairToString(self.base));
                self.log("Target Mine: " + util.pairToString(self.targetMinePos));
            }
        }
        if (!receivedMessage) {
            self.log("ERROR! I'm a new pilgrim that didn't get an init message");
        }
    }

    if (self.state === "going to build church") {
        self.log("Pilgrim state: " + self.state);
        if (util.sqDist(self.loc, self.base) <= 2) {
            self.state = "building church";
            self.log("Already arrived at build location, state switching to " + self.state);
        }
        else {
            let chosenMove = nav.move(self.loc, self.bfsFromBase, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
            self.log("Move: " + util.pairToString(chosenMove));
            if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                // TODO: find solution
                self.log("New move: " + util.pairToString(chosenMove));
                if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                    // TODO: pilgrim is stuck, turn stationary robots into impassable
                    return pilgrimUtil.pilgrimDontDoNothing(self);
                }
            }
            if (util.sqDist(util.addPair(self.loc, chosenMove), self.base) <= 2 && util.enoughFuelToMove(self, chosenMove)) {
                self.state = "building church";
                self.log("Will arrive at build location next turn, state switching to " + self.state);
            }
            return self.move(chosenMove.x, chosenMove.y);
        }
    }

    if (self.state === "building church") { // combine with above state?
        if (util.sqDist(self.loc, self.base) > 2) {
            self.log("ERROR! state is " + self.state + " but not currently adjacent to build location");
            self.state = "going to mine";
            // TODO: set mine as closest karb
        }
        else {
            self.log("Building church at " + util.pairToString(self.base));
            let shift = util.subtractPair(self.base, self.loc);
            signalling.pilgrimToNewChurch(self, self.targetResource, shift);
            self.state = "going to mine";
            return self.buildUnit(SPECS.CHURCH, shift.x, shift.y);
        }
    }

    if (self.state === "going to mine") {
        self.log("Pilgrim state: " + self.state);
        if (util.pairEq(self.loc, self.targetMinePos)) {
            self.state = "mining"; // can start mining on the same turn
            self.log("Already arrived at mine, state changed to " + self.state);
        }
        else {
            let chosenMove = nav.move(self.loc, self.bfsFromMine, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
            self.log("Move: " + util.pairToString(chosenMove));
            if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                // TODO: alternate move
                self.log("New move: " + util.pairToString(chosenMove));
                if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                    // TODO: signal when stuck
                    return pilgrimUtil.pilgrimDontDoNothing(self);
                }
            }
            // TODO: make pilgrims follow fuel buffer
            if (util.pairEq(util.addPair(self.loc, chosenMove), self.targetMinePos)
                && util.enoughFuelToMove(self, chosenMove))
                self.state = "mining";
            return self.move(chosenMove.x, chosenMove.y);
        }
    }

    if (self.state === "mining") {
        self.log("Pilgrim state: " + self.state);
        if (self.fuel >= SPECS.MINE_FUEL_COST) {
            // self.lastMoveNothing = false;
            if (self.targetResource === 0) { // karb
                if (self.me.karbonite + SPECS.KARBONITE_YIELD >= SPECS.UNITS[self.me.unit].KARBONITE_CAPACITY) {
                    self.log("Storage will be full next round, swiching state to go to base");
                    self.state = "going to base";
                }
            }
            else {
                self.log("Mining my target fuel");
                if (self.me.fuel + SPECS.FUEL_YIELD >= SPECS.UNITS[self.me.unit].FUEL_CAPACITY) {
                    self.log("Storage will be full next round, swiching state to go to base");
                    self.state = "going to base";
                }
            }
            return self.mine();
        }
        else {
            self.log("Not enough fuel to mine");
            // self.lastMoveNothing = true;
            return pilgrimUtil.pilgrimDontDoNothing(self);
        }
    }

    if (self.state === "going to base") {
        // if (!self.baseInitialized) {
        //     let minDist = 1000000;
        //     for (let i = 0; i < self.foundCastles.length; i++) {
        //         if (util.sqDist(self.foundCastles[i], self.targetMinePos) < minDist) {
        //             minDist = util.sqDist(self.foundCastles[i], self.targetMinePos);
        //             self.base = self.foundCastles[i];
        //         }
        //     }
        //     for (let i = 0; i < self.foundChurches.length; i++) {
        //         if (util.sqDist(self.foundChurches[i], self.targetMinePos) < minDist) {
        //             minDist = util.sqDist(self.foundChurches[i], self.targetMinePos);
        //             self.base = self.foundChurches[i];
        //         }
        //     }
        //     self.baseInitialized = true;
        // }
        self.log("Pilgrim state: " + self.state);
        if (util.sqDist(self.loc, self.base) <= 2) {
            self.state = "depositing";
            self.log("Already arrived at base, state switching to " + self.state);
        }
        else {
            let chosenMove = nav.move(self.loc, self.bfsFromBase, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
            self.log("Move: " + util.pairToString(chosenMove));
            if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                // TODO: alternate move
                self.log("New move: " + util.pairToString(chosenMove));
                if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                    // TODO: handle stuck pilgrims
                    return pilgrimUtil.pilgrimDontDoNothing(self);
                }
            }
            if (util.sqDist(util.addPair(self.loc, chosenMove), self.base) <= 2 && util.enoughFuelToMove(self, chosenMove)) {
                self.state = "depositing";
                self.log("Will arrive at base next turn, state switching to " + self.state);
            }
            return self.move(chosenMove.x, chosenMove.y);
        }
    }

    if (self.state === "depositing") {
        self.log("Pilgrim state: " + self.state);
        if (self.me.karbonite > 0 || self.me.fuel > 0) {
            self.log("Depositing resources at base");
            self.state = "going to mine";
            self.log("State for next round changed to " + self.state);
            return self.give(self.base.x - self.loc.x, self.base.y - self.loc.y, self.me.karbonite, self.me.fuel);
        }
        else {
            self.log("ERROR! pilgrim was in state deposit without any resources");
            self.state = "going to mine";
            return pilgrimUtil.pilgrimDontDoNothing(self);
        }
    }

    self.log("ERROR! self is the end of pilgrim's turn(), it shouldn't get self far");
    return pilgrimUtil.pilgrimDontDoNothing(self);
};

const crusader = {};

const prophet = {};

prophet.takeTurn = (self) => {
    // self.log('prophet taking turn')
    // self.log('START TURN ' + self.step);
    // self.log('health: ' + self.me.health);

    // var visible = self.getVisibleRobots();
    
    // // get attackable robots
    // var attackable = visible.filter((r) => {
    //     if (! self.isVisible(r)){
    //         return false;
    //     }
    //     const dist = (r.x-self.me.x)**2 + (r.y-self.me.y)**2;
    //     if (r.team !== self.me.team
    //         && SPECS.UNITS[self.me.unit].ATTACK_RADIUS[0] <= dist
    //         && dist <= SPECS.UNITS[self.me.unit].ATTACK_RADIUS[1] ){
    //         return true;
    //     }
    //     return false;
    // });

    // const attacking = visible.filter(r => {
    //     if (r.team === self.me.team) {
    //         return false;
    //     }

    //     if (nav.sqDist(r, self.me) <= SPECS.UNITS[self.me.unit].ATTACK_RADIUS[0]) {
    //         return true;
    //     } else {
    //         return false;
    //     }
    // });

    // if (attacking.length > 0) {
    //     const attacker = attacking[0];
    //     const dir = nav.getDir(self.me, attacker);
    //     const otherDir = {
    //         x: -dir.x,
    //         y: -dir.y,
    //     };
    //     return self.move(otherDir.x, otherDir.y);
    // }



    // if(!self.pendingMessage) {
    //     for(let i = 0; i < visible.length; i++ ) {
    //         const robot = visible[i];
    //         if (robot.team !== self.me.team && robot.unit === SPECS.CASTLE && self.enemyCastles.indexOf(robot.x * 64 + robot.y) < 0) {
    //             self.log('ENEMY CASTLE FOUND!');
    //             self.pendingMessage = robot.y;
    //             self.castleTalk(robot.x);
    //             self.enemyCastles.push(robot.x * 64 + robot.y);
    //         }
    //     }
    // } else {
    //     self.castleTalk(self.pendingMessage);
    //     self.pendingMessage = null;
    // }

    // self.log(attackable);

    // if (attackable.length>0){
    //     // attack first robot
    //     var r = attackable[0];
    //     self.log('' +r);
    //     self.log('attacking! ' + r + ' at loc ' + (r.x - self.me.x, r.y - self.me.y));
    //     return self.attack(r.x - self.me.x, r.y - self.me.y);
    // }
    // // self.log("Crusader health: " + self.me.health);'
    // if (!self.destination) {
    //     self.destination = nav.reflect(self.me, self.getPassableMap(), self.me.id % 2 === 0);
    // }

    // const choice = nav.goto(self, self.destination);
    // return self.move(choice.x, choice.y);
};

const preacher = {};

preacher.takeTurn = (self) => {
    self.loc = { x: self.me.x, y: self.me.y };
    self.log("Mage Position: " + util.pairToString(self.loc));

    if (self.me.turn === 1) {
        self.receivedFirstMessage = false;
        self.state = "waiting for init messages";
    }

    if (self.state === "waiting for init messages") {
        self.log("Mage state: " + self.state);
        let receivedMessage = false;
        for (let i = 0; i < visible.length; i++) {
            let r = visible[i];
            if (r.team === self.me.team && r.unit === SPECS.CASTLE && self.isRadioing(r)) {
                let hash = r.signal;
                if (hash >> 15) {
                    let shiftHash = (hash >> 12) & ((1 << 3) - 1);
                    let shift = util.unhashShift(shiftHash);
                    if (util.pairEq(util.subtractPair(self.loc, { x: r.x, y: r.y }), shift)) {
                        // signal is meant for me!
                        self.log("I got a message!");
                        receivedMessage = true;

                        self.baseCastle = { x: r.x, y: r.y };
                        self.bfsFromBase = bfs(self.baseCastle, self.map);

                        if ((hash >> 11) & 1) {
                            self.state = "defense";
                            if ((hash >> 10) & 1)
                                self.maxAdvanceSpeed = 4;
                            else
                                self.maxAdvanceSpeed = 2;
                            let enemyShiftX = ((hash >> 5) & ((1 << 5) - 1)) - 16;
                            let enemyShiftY = (hash & ((1 << 5) - 1)) - 16;
                            self.enemy = util.addPair(self.baseCastle, { x: enemyShiftX, y: enemyShiftY });
                            self.bfsFromEnemy = nav.bfs(self.enemy, self.map);
                            self.log("I'm a defense mage that just got initialized");
                            self.log("Base castle: " + util.pairToString(self.baseCastle));
                            self.log("Heading to enemy at " + util.pairToString(self.enemy));
                        }
                        else {
                            self.state = "attack";
                            util.findSymmetry(self);
                            self.enemyCastle = util.reflect(self, self.baseCastle);
                            self.bfsFromEnemy = nav.bfs(self.enemyCastle, self.map);
                            self.log("I'm an attack mage that just got initialized");
                            self.log("Base castle: " + util.pairToString(self.baseCastle));
                            self.log("Heading to enemy at " + util.pairToString(self.enemyCastle));
                        }
                    }
                }
            }
        }
        if (!receivedMessage) {
            self.log("No message received, state is still " + self.state);
        }
    }

    if (util.findEnemies(self, visible).length > 0) {
        self.log("Mage sees enemies!");
        let bestShift = { x: -100, y: -100 };
        let maxHits = -100;
        let closestHit = 100;
        for (let dx = -4; dx <= 4; dx++) {
            for (let dy = -4; dy <= 4; dy++) {
                let shift = { x: dx, y: dy };
                let targetSquare = util.addPair(self.loc, shift);
                if (!util.canAttack(self, targetSquare))
                    continue;
                // calculate splash result
                let hits = 0;
                let closestDist = 100;
                for (let dx2 = -1; dx2 <= 1; dx2++) {
                    for (let dy2 = -1; dy2 <= 1; dy2++) {
                        let splashed = util.addPair(targetSquare, { x: dx2, y: dy2 });
                        if (!util.inGrid(splashed, self.map))
                            continue;
                        let id = self.robotMap[splashed.y][splashed.x];
                        if (id > 0) {
                            if (self.getRobot(id).team !== self.me.team) {
                                hits++;
                                closestDist = Math.min(closestDist, util.norm({ x: dx + dx2, y: dy + dy2 }));
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
        self.log("Attacking " + util.pairToString(util.addPair(self.loc, bestShift)));
        return self.attack(bestShift.x, bestShift.y);
    }

    if (self.state === "defense") {
        let chosenMove = nav.move(self.loc, self.bfsFromEnemy, self.map, self.robotMap, self.maxAdvanceSpeed);
        self.log("Move: " + util.pairToString(chosenMove));
        if (util.pairEq(util.addPair(self.loc, chosenMove), self.enemy) && util.enoughFuelToMove(self, chosenMove))
            self.state = "returning";
        return self.move(chosenMove.x, chosenMove.y);
    }

    if (self.state === "attack") {
        if (util.sqDist(self.loc, self.enemyCastle) <= SPECS.UNITS[self.me.unit].VISION_RADIUS
            && self.getRobot(robotMap[self.enemyCastle.y][self.enemyCastle.x]).unit !== SPECS.CASTLE) {
            self.log("Don't see an enemy castle in the expected location, must have been killed");
            self.state = "returning";
        }
        let chosenMove = nav.move(self.loc, self.bfsFromEnemyCastle, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
        self.log("Move: " + util.pairToString(chosenMove));
        if (util.sqDist(util.addPair(self.loc, chosenMove), self.enemyCastle) && util.enoughFuelToMove(self, chosenMove))
            self.state = "returning";
        return self.move(chosenMove.x, chosenMove.y);
    }

    if (self.state === "returning") {
        let chosenMove = nav.move(self.loc, self.bfsFromBase, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED); // slow retreat
        self.log("Move: " + util.pairToString(chosenMove));
        if (util.sqDist(util.addPair(self.loc, chosenMove), self.baseCastle) <= 16 && util.enoughFuelToMove(self, chosenMove))
            self.state = "waiting";
        return self.move(chosenMove.x, chosenMove.y);
    }
};

// clear && bc19compile -d Churches_V2 -o debug.js -f && bc19run --bc debug.js --rc debug.js
// 3 castle test seed: 1505486586
// times out: 1909424986 (pilgrim bfs)
// only makes two pilgrims: 1298989386. Distance of mines from you and enemy are equal because pilgrim jump is ignored.
// Good eco teams: big red battlecode, oak's last disciple, vvvvv, knights of cowmelot, deus vult, panda lovers

// TODO: replace array.push with array[i] = x to optimize code
// clique with one resource: 1482125857
// remove edge (-1, -1): 1482125857

class MyRobot extends BCAbstractRobot {
    constructor() {
        super();
        this.type = undefined;
    }

    turn() {
        this.log("=========================================");
        this.log("Start turn " + this.me.turn);
        this.log("Time remaining: " + this.me.time);
        this.visible = this.getVisibleRobots();
        this.robotMap = this.getVisibleRobotMap();
        this.alreadySignalled = false;
        this.loc = { x: this.me.x, y: this.me.y };

        if (this.type === undefined) {
            if (this.me.unit === SPECS.CASTLE)
                this.type = castle;
            else if (this.me.unit === SPECS.CHURCH)
                this.type = church;
            else if (this.me.unit === SPECS.PILGRIM)
                this.type = pilgrim;
            else if (this.me.unit === SPECS.CRUSADER)
                this.type = crusader;
            else if (this.type === SPECS.PROPHET)
                this.type = prophet;
            else if (this.me.unit === SPECS.PREACHER)
                this.type = preacher;
        }
        return this.type.takeTurn(this);
    }
}

// is this needed?
var robot = new MyRobot();
var robot = new MyRobot();
