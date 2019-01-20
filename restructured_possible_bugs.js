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

        if (this.fuel < Math.ceil(Math.sqrt(radius))) throw "Not enough fuel to signal given radius.";
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

util.inGrid = (pos, length) => {
    return pos.x >= 0 && pos.y >= 0 && pos.x < length && pos.y < length;
};

util.empty = (loc, map, robotMap = null) => {
    return util.inGrid(loc, map.length) && map[loc.y][loc.x] && (robotMap === null || robotMap[loc.y][loc.x] <= 0);
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
    if (!util.inGrid(loc, self.robotMap.length))
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
    return util.inGrid(pos, self.map.length)
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
signalling.queueInitSignal = (self, priority = false) => {
    if (self.lastCreated === null) {
        return;
    }
    if (self.lastCreated[0] === SPECS.PILGRIM) {
        let hash = 1 << 15; // meant for newest robot
        let shift = self.lastCreated[1];
        hash |= util.hashShift(shift) << 12; // bits 12-14 specify position relative to castle
        hash |= self.castles.length << 10; // bits 10-11 say how many castles there are, so the new unit knows how long to stay
        hash |= (self.castleNumber + 1) << 8; // bits 8-9 say which castle self is. extra castle positions are listed in increasing order of castle number
        hash |= self.churches.length << 6; // bits 6-7 say how many churches there are. Note that we can't have over 3 churches.
        // specify pilgrim goal
        if (self.lastCreated[2] === "fuel") {
            hash |= 1 << 4;
        }
        hash |= self.lastCreated[3];
        if (priority) {
            self.prioritySignalQueue.push({ signal: hash, dist: util.norm(shift) });
        }
        else {
            self.signalQueue.push({ signal: hash, dist: util.norm(shift) });
        }

        for (let i = 0; i < self.castles.length; i++) {
            if (i === self.castleNumber)
                continue;
            hash = 1 << 15;
            hash |= util.hashShift(shift) << 12;
            hash |= self.castlePos[i].x << 6;
            hash |= self.castlePos[i].y;
            if (priority)
                self.prioritySignalQueue.push({ signal: hash, dist: util.norm(shift) });
            else
                self.signalQueue.push({ signal: hash, dist: util.norm(shift) });
        }
    }
    else if (self.lastCreated[0] === SPECS.PREACHER) {
        self.log("Queueing mage init signal");
        let hash = 1 << 15; // meant for newest robot
        let shift = self.lastCreated[1];
        self.log("Shift: " + util.pairToString(shift));
        self.log("Distance: " + util.norm(shift));
        hash |= util.hashShift(shift) << 12; // bits 12-14 specify position relative to castle
        if (self.lastCreated[2] === "defense") {
            hash |= 1 << 11; // bit 11 specifies whether mage should defend or attack
        }
        hash |= Number(self.lastCreated[3]) << 10; // bit 10 says whether mage should go fast or not
        hash |= (self.lastCreated[4].x + 16) << 5; // specify shifted relative x-coord of enemy
        hash |= self.lastCreated[4].y + 16; // specify shifted relative y-coord of enemy
        if (priority)
            self.prioritySignalQueue.push({ signal: hash, dist: util.norm(shift) });
        else
            self.signalQueue.push({ signal: hash, dist: util.norm(shift) });
    }
};

signalling.sendSignal = (self) => {
    if (self.alreadySignaled) {
        self.log("ERROR! Tried to signal twice in the same turn");
        return;
    }
    if (self.prioritySignalQueue.isEmpty() && self.signalQueue.isEmpty())
        return;

    let message = 0; // will be overwritten
    if (!self.prioritySignalQueue.isEmpty()) {
        if (self.fuel < self.prioritySignalQueue.peekFront().dist) {
            self.log("Not enough fuel to send message of distance " + self.prioritySignalQueue.peek().dist);
            return; // must save up fuel
        }
        message = self.prioritySignalQueue.shift();
    }
    else {
        if (self.fuel < self.signalQueue.peekFront().dist) {
            self.log("Not enough fuel to send message of distance " + self.signalQueue.peekFront().dist);
            return; // must save up fuel
        }
        message = self.signalQueue.shift();
    }
    self.log("Sending signal " + message.signal);
    self.signal(message.signal, message.dist);
    self.alreadySignaled = true;
};

// done change

const castleUtil = {};

// for castles only
// for addNewUnits
castleUtil.knownID = (self, id) => {
    return (self.castles.includes(id) || self.churches.includes(id)
        || self.karbPilgrims.includes(id) || self.fuelPilgrims.includes(id)
        || self.crusaders.includes(id) || self.prophets.includes(id) || self.preachers.includes(id));
};

// for castles only
castleUtil.addNewUnits = (self, visible) => {
    for (let i = 0; i < visible.length; i++) {
        let r = visible[i];
        if (r.team === self.me.team && (r.castle_talk >> 7)) {
            if (castleUtil.knownID(self, r.id))
                continue;
            // newly created robot
            self.log("Notified of a new robot!");
            let message = r.castle_talk;
            let unitType = ((message >> 5) & ((1 << 2) - 1)) + 2;
            if (unitType === SPECS.PILGRIM) {
                if ((message >> 4) & 1) { // fuel pilgrim
                    self.log("It's a fuel pilgrim with id " + r.id);
                    self.fuelPilgrims.push(r.id);
                    let fuelID = message & ((1 << 4) - 1);
                    self.log("It targets fuel #" + fuelID);
                    self.targetFuel[fuelID].assignedWorker = r.id;
                }
                else {
                    self.log("It's a karb pilgrim with id " + r.id);
                    self.karbPilgrims.push(r.id);
                    let karbID = message & ((1 << 4) - 1);
                    self.log("It targets karb #" + karbID);
                    self.targetKarb[karbID].assignedWorker = r.id;
                }
            }
            else if (unitType === SPECS.CRUSADER) {
                self.crusaders.push(r.id);
            }
            else if (unitType === SPECS.PROPHET) {
                self.prophets.push(r.id);
            }
            else if (unitType === SPECS.PREACHER) {
                self.preachers.push(r.id);
            }
            else {
                self.log("ERROR! When adding new unit, unitType is invalid");
            }
        }
    }
};

castleUtil.updateUnitList = (unitList, visible) => {
    unitList = unitList.filter((id) => {
        for (let i = 0; i < visible.length; i++) {
            if (id === visible[i].id)
                return true;
        }
        return false;
    });
};

castleUtil.updateAllUnitLists = (self, visible) => {
    // check deaths
    let updatedKarbPilgrims = [];
    for (let i = 0; i < self.targetKarb.length; i++) {
        let id = self.targetKarb[i].assignedWorker;
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
                self.targetKarb[i].assignedWorker = -1;
            }
        }
    }
    self.karbPilgrims = updatedKarbPilgrims;

    let updatedFuelPilgrims = [];
    for (let i = 0; i < self.targetFuel.length; i++) {
        let id = self.targetFuel[i].assignedWorker;
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
                self.targetFuel[i].assignedWorker = -1;
            }
        }
    }
    self.FuelPilgrims = updatedFuelPilgrims;

    castleUtil.updateUnitList(self.churches, visible);
    castleUtil.updateUnitList(self.crusaders, visible);
    castleUtil.updateUnitList(self.prophets, visible);
    castleUtil.updateUnitList(self.preachers, visible);

    // check new units
    castleUtil.addNewUnits(self, visible);

    // add new way of finding newly build churches via pilgrim castleTalk
};

// TODO: if new unit gets killed when assignedWorker = 0, need to replace 
castleUtil.buildKarbPilgrim = (self) => {
    // is min necessary when desired is always at most targetKarb.length?
    for (let i = 0; i < Math.min(self.targetKarb.length, self.desiredKarbPilgrims); i++) {
        if (self.targetKarb[i].assignedCastle === self.castleNumber
            && self.targetKarb[i].assignedWorker === -1) {
            // found first needed karb pilgrim
            self.targetKarb[i].assignedWorker = 0; // 0 means pilgrim exists but id unknown

            // make clone instead of reference
            let destination = util.copyPair(self.targetKarb[i].pos);

            // choose best starting placement around castle
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

            self.log("Buliding Karb Pilgrim at " + util.pairToString(util.addPair(self.loc, bestShift))
                + " to target karb #" + i + " at " + util.pairToString(destination));

            self.lastCreated = [SPECS.PILGRIM, bestShift, "karb", i];
            signalling.queueInitSignal(self);
            signalling.sendSignal(self);
            return self.buildUnit(SPECS.PILGRIM, bestShift.x, bestShift.y);
        }
    }
    self.log("ERROR! Tried to build karb pilgrim when desired number is already reached");
};

// copy karb shift
// TODO: if new unit gets killed when assignedWorker = 0, need to replace 
castleUtil.buildFuelPilgrim = (self) => {
    // is min necessary when desired is always at most targetFuel.length?
    for (let i = 0; i < Math.min(self.targetFuel.length, self.desiredFuelPilgrims); i++) {
        if (self.targetFuel[i].assignedCastle === self.castleNumber
            && self.targetFuel[i].assignedWorker === -1) {
            // found first needed fuel pilgrim
            self.targetFuel[i].assignedWorker = 0; // 0 means pilgrim exists but id unknown

            // make clone instead of reference
            let destination = util.copyPair(self.targetFuel[i].pos);

            // choose best starting placement around castle
            let minDist = 1000000;
            let bestPos = { x: -1, y: -1 };
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    let pos = { x: self.loc.x + dx, y: self.loc.y + dy };
                    // self.log("Starting placement in consideration: " + pairToString(pos));
                    if (util.empty(pos, self.map, self.robotMap)) {
                        if (util.sqDist(pos, destination) < minDist) {
                            minDist = util.sqDist(pos, destination);
                            bestPos = pos;
                        }
                    }
                }
            }

            self.log("Buliding Fuel Pilgrim at " + util.pairToString(bestPos)
                + " to target fuel #" + i + " at " + util.pairToString(destination));
            let shift = util.subtractPair(bestPos, self.loc);
            self.lastCreated = [SPECS.PILGRIM, shift, "fuel", i];
            signalling.queueInitSignal(self);
            signalling.sendSignal(self);
            return self.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
        }
    }
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

const nav = {};

// TODO: when stuck, perform full bfs treating robot positions as fixed
nav.bfs = (start, map) => {
    let q = new Deque(512);
    let visited = new Array(map.length);
    let dist = new Array(map.length);
    for (let i = 0; i < map.length; i++) {
        visited[i] = new Array(map.length).fill(false);
        dist[i] = new Array(map.length).fill(1000000);
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
        visited[i] = new Array(map.length).fill(false);
        dist[i] = new Array(map.length).fill(1000000);
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

        // other init things
        self.lastCreated = null;
        self.prioritySignalQueue = new Deque();
        self.signalQueue = new Deque();
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

        self.maxKarbPilgrims = 16;
        self.maxFuelPilgrims = 16;

        self.assignedArea = resource.assignAreaToCastles(self);
        resource.initResourceList(self);

        // self.log("Target karb:");
        // for (let i = 0; i<self.targetKarb.length; i++){
        //     self.log(JSON.stringify(self.targetKarb[i]));
        // }
        // self.log("Target fuel:");
        // for (let i = 0; i<self.targetFuel.length; i++){
        //     self.log(JSON.stringify(self.targetFuel[i]));
        // }

        self.churches = [];
        self.karbPilgrims = [];
        self.fuelPilgrims = [];
        self.crusaders = [];
        self.prophets = []; // rangers
        self.preachers = []; // mages/tanks

        self.desiredKarbPilgrims = Math.min(4, self.targetKarb.length);
        self.desiredFuelPilgrims = Math.min(4, self.targetFuel.length);
        self.karbBuffer = 60; // TODO: make it dynamic
        self.fuelBuffer = 300; // TODO: make it dynamic
    }

    castleUtil.updateAllUnitLists(self, self.visible);

    let karbGoal = resource.karbGoalStatus(self, self.desiredKarbPilgrims);
    let fuelGoal = resource.fuelGoalStatus(self, self.desiredFuelPilgrims);
    let visibleEnemies = util.findEnemies(self, self.visible);
    // self.log("Karb goal: " + JSON.stringify(karbGoal));
    // self.log("Fuel goal: " + JSON.stringify(fuelGoal));

    self.log(visibleEnemies);

    if (util.hasSpaceAround(self)) {
        if (visibleEnemies.length > 0) {
            self.log("Under attack!");
            visibleEnemies.sort(compareDist);
            if (util.canBuild(self, SPECS.PREACHER)) {
                return self.buildDefenseMage(visibleEnemies[0]);
            }
        }
        else if (!karbGoal.reached) {
            if (karbGoal.canHelp && resource.canMaintainBuffer(self, SPECS.PILGRIM)) {
                return castleUtil.buildKarbPilgrim(self);
            }
            else {
                // wait for other castle to do it, if !canHelp
                // or if it's my job, prioritize safety buffer
                signalling.sendSignal(self);
                return;
            }
        }
        else if (!fuelGoal.reached) {
            if (fuelGoal.canHelp && resource.canMaintainBuffer(self, SPECS.PILGRIM)) {
                return castleUtil.buildFuelPilgrim(self);
            }
            else {
                // wait for other castle to do it, if !canHelp
                // or if it's my job, prioritize safety buffer
                signalling.sendSignal(self);
                return;
            }
        }
        // else if (self.canMaintainBuffer(SPECS.CRUSADER)) {
        //     self.log("Building crusader");
        //     self.sendSignal();
        //     return self.buildAround(SPECS.CRUSADER);
        // }
        else {
            self.lastCreated = null;
        }
    }
    // self.log("Current number of karb pilgrims: " + self.karbPilgrims.length);
    // self.log("Current number of fuel pilgrims: " + self.fuelPilgrims.length);

    signalling.sendSignal(self);
};

const church = {};

const pilgrimUtil = {};

// TODO: replace self.targetMine with mineIDs
pilgrimUtil.pilgrimInit = (self) => {
    self.log("Initializing pilgrim");
    util.findSymmetry(self);
    self.enemyCastlePos = [];
    for (let i = 0; i < self.castles.length; i++) {
        self.enemyCastlePos.push(util.reflect(self, self.castlePos[i]));
    }
    self.assignedArea = resource.assignAreaToCastles(self);
    resource.initResourceList(self);
    // self.log("Target karb right after initializing it");
    // self.log(self.targetKarb);

    if (self.targetResource === "karb") {
        self.targetMine = util.copyPair(self.targetKarb[self.targetID].pos);
    }
    else {
        self.targetMine = util.copyPair(self.targetFuel[self.targetID].pos);
    }

    // self.bfsFromBase = bfs(self.base, self.map);
    // self.log("Original target mine: " + pairToString(self.targetKarb[self.targetID].pos));
    // self.log("Target mine: " + pairToString(self.targetMine));
    // self.bfsFromMine = bfs(self.targetMine, self.map);

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
    // change when castle is destroyed
    for (let i = 0; i < self.castlePos.length; i++) {
        self.avoidMinesMap[self.castlePos[i].y][self.castlePos[i].x] = false;
        self.avoidMinesMap[self.enemyCastlePos[i].y][self.enemyCastlePos[i].x] = false;
    }
    // set false for churches too
    self.avoidMinesBaseBFS = nav.fullBFS(self.base, self.avoidMinesMap, SPECS.UNITS[self.me.unit].SPEED, true);
    self.avoidMinesResourceBFS = nav.fullBFS(self.targetMine, self.avoidMinesMap, SPECS.UNITS[self.me.unit].SPEED);
    self.log("I am a pilgrim that just got initialized");
    self.log("Target Resource: " + self.targetResource);
    self.log("Base castle: " + util.pairToString(self.base));
    self.log("Target Mine: " + util.pairToString(self.targetMine));
    // self.log("All target karb:");
    // self.log(self.targetKarb);
};

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
        self.receivedFirstMessage = false;
        self.state = "waiting for init messages";
    }

    if (self.state === "waiting for init messages") {
        self.log("Pilgrim state: " + self.state);
        let receivedMessage = false;
        for (let i = 0; i < self.visible.length; i++) {
            let r = self.visible[i];
            if (r.team === self.me.team && r.unit === SPECS.CASTLE && self.isRadioing(r)) {
                let hash = r.signal;
                if (hash >> 15) {
                    let shiftHash = (hash >> 12) & ((1 << 3) - 1);
                    let shift = util.unhashShift(shiftHash);
                    if (util.pairEq(util.subtractPair(self.loc, { x: r.x, y: r.y }), shift)) {
                        // signal is meant for me!
                        self.log("I got a message!");
                        receivedMessage = true;
                        if (!self.receivedFirstMessage) {
                            self.log("self is my first message");
                            self.receivedFirstMessage = true;

                            self.castles = new Array((hash >> 10) & ((1 << 2) - 1));
                            self.castlePos = new Array(self.castles.length);
                            self.baseCastleNumber = ((hash >> 8) & ((1 << 2) - 1)) - 1;
                            self.castles[self.baseCastleNumber] = r.id;
                            self.castlePos[self.baseCastleNumber] = { x: r.x, y: r.y };

                            self.log("Known castle locations:");
                            self.log(self.castlePos);

                            self.base = { x: r.x, y: r.y };
                            self.churches = new Array((hash >> 6) & ((1 << 2) - 1)); // TODO: don't send church info
                            if (hash & (1 << 4))
                                self.targetResource = "fuel";
                            else
                                self.targetResource = "karb";
                            self.targetID = hash & ((1 << 4) - 1);

                            // let other castles know that you're a newly created robot
                            // 7th bit shows that you're new, 5-6 shows your type, 0-4 shows your job
                            self.castleTalk((1 << 7) | ((self.me.unit - 2) << 5) | (hash & ((1 << 5) - 1)));

                            if (self.castles.length === 1) {
                                pilgrimUtil.pilgrimInit(self);
                                self.state = "going to mine"; // can start moving on the same turn
                            }
                            else {
                                self.log("Must wait for more init messages");
                                return pilgrimUtil.pilgrimDontDoNothing(self);
                            }
                        }
                        else {
                            for (let j = 0; j < self.castles.length; j++) {
                                if (self.castles[j] === undefined) {
                                    self.castles[j] = r.id;
                                    self.castlePos[j] = { x: (r.signal >> 6) & ((1 << 6) - 1), y: r.signal & ((1 << 6) - 1) };
                                    break;
                                }
                            }
                            self.log("Known castle locations:");
                            self.log(self.castlePos);

                            for (let j = 0; j < self.castles.length; j++) {
                                if (self.castles[j] === undefined) {
                                    self.log("Must wait for more init messages");
                                    return pilgrimUtil.pilgrimDontDoNothing(self);
                                }
                            }
                            pilgrimUtil.pilgrimInit(self);
                            self.state = "going to mine"; // can start moving on the same turn
                        }
                    }
                }
            }
        }
        if (!receivedMessage) {
            self.log("No message received, state is still " + self.state);
            return pilgrimUtil.pilgrimDontDoNothing(self);
        }
    }

    if (self.state === "going to mine") {
        self.log("Pilgrim state: " + self.state);
        if (util.pairEq(self.loc, self.targetMine)) {
            self.state = "mining"; // can start mining on the same turn
            self.log("Already arrived at mine, state changed to " + self.state);
        }
        else {
            // let chosenMove = move(self.loc, self.bfsFromMine, self.map, self.getVisibleRobotMap(), SPECS.UNITS[self.me.unit].SPEED);
            let chosenMove = nav.move(self.loc, self.avoidMinesResourceBFS, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
            self.log("Move: " + util.pairToString(chosenMove));
            if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                // chosenMove = move(self.loc, self.bfsFromMine, self.map, self.getVisibleRobotMap(), SPECS.UNITS[self.me.unit].SPEED);
                self.log("New move: " + util.pairToString(chosenMove));
                if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                    // self.lastMoveNothing = true; // stuck
                    // TODO: signal when stuck
                    return pilgrimUtil.pilgrimDontDoNothing(self);
                }
            }
            // self.lastMoveNothing = false;
            // TODO: make pilgrims follow fuel buffer
            if (util.pairEq(util.addPair(self.loc, chosenMove), self.targetMine)
                && util.enoughFuelToMove(self, chosenMove))
                self.state = "mining";
            return self.move(chosenMove.x, chosenMove.y);
        }
    }

    if (self.state === "mining") {
        self.log("Pilgrim state: " + self.state);
        if (self.fuel >= SPECS.MINE_FUEL_COST) {
            // self.lastMoveNothing = false;
            if (self.targetResource === "karb") {
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
        self.log("Pilgrim state: " + self.state);
        if (util.sqDist(self.loc, self.base) <= 2) {
            self.state = "depositing";
            self.log("Already arrived at base, state switching to " + self.state);
        }
        else {
            let chosenMove = nav.move(self.loc, self.avoidMinesBaseBFS, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
            // let chosenMove = move(self.loc, self.bfsFromBase, self.map, self.getVisibleRobotMap(), SPECS.UNITS[self.me.unit].SPEED, self.lastMoveNothing);
            self.log("Move: " + util.pairToString(chosenMove));
            if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                // chosenMove = move(self.loc, self.bfsFromBase, self.map, self.getVisibleRobotMap(), SPECS.UNITS[self.me.unit].SPEED);
                self.log("New move: " + util.pairToString(chosenMove));
                if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                    // self.lastMoveNothing = true;
                    return pilgrimUtil.pilgrimDontDoNothing(self);
                }
            }
            // self.lastMoveNothing = false;
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
            // self.lastMoveNothing = false;
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
                        if (!util.inGrid(splashed, self.map.length))
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
        this.alreadySignaled = false;
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
