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

// util.compareDist = (a, b) => {
//     if (util.norm(a.relPos) !== util.norm(b.relPos))
//         return a.relPos - b.relPos;
//     else
//         return b.unitType - a.unitType;
// }

util.sortByDistToPoint = (pt) => {
    return function (a, b) {
        return util.sqDist(a, pt) - util.sqDist(b, pt);
    }
};

// util.compareDistToPoint = (pt) => {
//     return function (a, b) {
//         return util.sqDist(a, pt) - util.sqDist(b, pt);
//     };
// }

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

util.sortEnemiesByPriority = (self) => {
    return function(a, b) {
        if (a.unit > 2 && b.unit <= 2){
            return -1;
        }
        else if (a.unit <= 2 && b.unit > 2){
            return 1;
        }
        else {
            return util.sqDist(self.loc, a.pos) - util.sqDist(self.loc, b.pos);
        }
    }
};

util.findEnemies = (self, visible) => {
    let enemyUnits = [];
    for (let i = 0; i < visible.length; i++) {
        let r = visible[i];
        if (r.team !== self.me.team) {
            enemyUnits.push({ unitType: r.unit, pos: { x: r.x, y: r.y } });
        }
    }
    enemyUnits.sort(util.sortEnemiesByPriority(self));
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

util.initMaps = (self) => {
    self.avoidMinesMap = new Array(self.map.length);
    self.noMineRobotMap = new Array(self.map.length);
    for (let i = 0; i < self.map.length; i++) {
        self.avoidMinesMap[i] = (new Array(self.map.length));
        self.noMineRobotMap[i] = (new Array(self.map.length));
    }
    for (let x = 0; x < self.map.length; x++) {
        for (let y = 0; y < self.map.length; y++) {
            self.avoidMinesMap[y][x] = (self.map[y][x] && !self.karbonite_map[y][x] && !self.fuel_map[y][x]);
            self.noMineRobotMap[y][x] = (self.map[y][x] && !self.karbonite_map[y][x] && !self.fuel_map[y][x]);
        }
    }
};

// choose best starting placement around castle
util.closestAdjacent = (self, destination) => {
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
    self.log("Sending signal " + ((1 << 14) + resourceID) + " to new church");
    self.signal((1 << 14) + (1<<7) + resourceID, util.norm(shift));
    self.alreadySignalled = true;
};

signalling.churchExists = (self) => {
    self.castleTalk((1 << 7) + self.allResources.length + self.clusters.length + self.myClusterID);
};

// pilgrim to base church
signalling.newPilgrimExists = (self, resourceID, dist) => {
    if (self.alreadySignalled) {
        self.log("ERROR! Tried to signal twice in the same turn");
        return;
    }
    self.log("Signalling " + ((1 << 14) + resourceID) + " to base church");
    self.signal((1 << 14) + (1<<7) + resourceID, dist);
    self.alreadySignalled = true;
};

signalling.baseToDefenseMage = (self, relPos, dist) => {
    if (self.alreadySignalled) {
        self.log("ERROR! Tried to signal twice in the same turn");
        return;
    }
    let hash = 1 << 15;
    hash |= 1 << 11; // bit 11 specifies whether mage should defend or attack
    hash |= (relPos.x + 16) << 5; // specify shifted relative x-coord of enemy
    hash |= relPos.y + 16; // specify shifted relative y-coord of enemy
    self.log("Signalling " + hash + " to new defense mage");
    self.signal(hash, dist);
    self.alreadySignalled = true;
};

signalling.baseToMilitaryUnit = (self, attacker, pos, dist) => {
    if (self.alreadySignalled) {
        self.log("ERROR! Tried to signal twice in the same turn");
        return;
    }
    let relPos = util.subtractPair(pos, self.loc);
    let hash = 1 << 15;
    hash |= attacker << 11; // bit 11 specifies whether unit should defend or attack
    hash |= (relPos.x + 16) << 5; // specify shifted relative x-coord of enemy
    hash |= relPos.y + 16; // specify shifted relative y-coord of enemy
    self.log("Signalling " + hash + " to new defense unit");
    self.signal(hash, dist);
    self.alreadySignalled = true;
};

signalling.militaryUnitExists = (self, attacker, clusterID, unitType) => {
    let message = (attacker << 6) + 3 * clusterID + unitType;
    self.castleTalk(message);
    if (self.baseIsChurch) {
        let dist = 0;
        if (self.me.unit === SPECS.CRUSADER)
            dist = 18;
        else
            dist = 10;
        self.signal((1<<14) + message, dist);
    }
};

// done change

const castleUtil = {};

// for castles only
castleUtil.addNewUnits = (self) => {
    for (let i = 0; i < self.visible.length; i++) {
        let r = self.visible[i];
        if (r.team === self.me.team && r.castle_talk !== 0) {
            if (self.unitInfo[r.id].type !== -1)
                continue;
            // newly created robot
            self.log("Notified of a new robot, id = " + r.id);
            let message = r.castle_talk;
            if ((message >> 7) && message < (1 << 7) + self.allResources.length + self.clusters.length) { // pilgrim
                self.unitInfo[r.id].type = SPECS.PILGRIM;
                self.unitInfo[r.id].info = message - (1 << 7); // resource or church ID
                if (self.unitInfo[r.id].info < self.allResources.length) {
                    // resource pilgrim
                    self.unitInfo[r.id].clusterID = self.allResources[self.unitInfo[r.id].info].clusterID;
                    let clusterIndex = self.clusterIDtoIndex[self.unitInfo[r.id].clusterID];
                    for (let j = 0; j < self.clusters[clusterIndex].karb.length; j++) {
                        if (self.clusters[clusterIndex].karb[j] === self.unitInfo[r.id].info) { // karb pilgrim
                            self.clusterProgress[clusterIndex].karb[j] = r.id;
                            self.clusterProgress[clusterIndex].karbPilgrims++;
                        }
                    }
                    for (let j = 0; j < self.clusters[clusterIndex].fuel.length; j++) {
                        if (self.clusters[clusterIndex].fuel[j] === self.unitInfo[r.id].info) { // fuel pilgrim
                            self.clusterProgress[clusterIndex].fuel[j] = r.id;
                            self.clusterProgress[clusterIndex].fuelPilgrims++;
                        }
                    }
                }
                else {
                    // church pilgrim
                    self.unitInfo[r.id].clusterID = message - (1 << 7) - self.allResources.length;
                    let clusterIndex = self.clusterIDtoIndex[self.unitInfo[r.id].clusterID];
                    self.clusterProgress[clusterIndex].church = 1;
                }
            }
            else if (message >> 7) { // church
                let clusterID = message - ((1 << 7) + self.allResources.length + self.clusters.length);
                self.unitInfo[r.id].type = SPECS.CHURCH;
                // TODO: info for church has no meaning
                self.unitInfo[r.id].clusterID = clusterID;
                let clusterIndex = self.clusterIDtoIndex[clusterID];
                self.clusterProgress[clusterIndex].church = 2;
            }
            else { // military unit
                let attack = message >> 6;
                let clusterID = Math.floor((message & ((1 << 6) - 1)) / 3) - 1; // bits 0-5 give cluster and unit type
                let unitType = (message & ((1 << 6) - 1)) % 3 + 3;
                self.log("New military unit, attack = " + attack + ", clusterID = " + clusterID + ", unitType = " + unitType);
                self.unitInfo[r.id].type = unitType;
                self.unitInfo[r.id].info = attack;
                self.unitInfo[r.id].clusterID = clusterID;
                let clusterIndex = self.clusterIDtoIndex[clusterID];
                if (self.clusters[clusterIndex].castle === self.castleNumber + 1) {
                    if (attack) {
                        if (self.lastAttackPosIndex === -1) {
                            self.log("ERROR! new attack unit for a castle that didn't build it last turn");
                            continue;
                        }
                        self.attackProgress[self.lastAttackPosIndex].type = unitType;
                        self.attackProgress[self.lastAttackPosIndex].id = r.id;
                    }
                    else {
                        if (self.lastDefensePosIndex === -1) {
                            self.log("ERROR! new defense unit for a castle that didn't build it last turn");
                            continue;
                        }
                        self.defenseProgress[self.lastDefensePosIndex].type = unitType;
                        self.defenseProgress[self.lastDefensePosIndex].id = r.id;
                    }
                }
                if (!attack && unitType === SPECS.PROPHET) {
                    self.clusterProgress[clusterIndex].prophets.push(r.id);
                }
            }
        }
    }
    self.lastAttackPosIndex = -1;
    self.lastDefensePosIndex = -1;
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
                clusterIndex = self.clusterIDtoIndex[self.unitInfo[id].clusterID];
                for (let j = 0; j < self.clusterProgress[clusterIndex].karb.length; j++) {
                    if (self.clusterProgress[clusterIndex].karb[j] === id) {
                        self.clusterProgress[clusterIndex].karb[j] = -1;
                    }
                }
                self.clusterProgress[clusterIndex].karbPilgrims--;
            }
            else { // fuel pilgrim
                clusterIndex = self.clusterIDtoIndex[self.unitInfo[id].clusterID];
                for (let j = 0; j < self.clusterProgress[clusterIndex].fuel.length; j++) {
                    if (self.clusterProgress[clusterIndex].fuel[j] === id) {
                        self.clusterProgress[clusterIndex].fuel[j] = -1;
                    }
                }
                self.clusterProgress[clusterIndex].fuelPilgrims--;
            }
        }
        else if (self.unitInfo[id].type === SPECS.CASTLE) {
            // unit info for castle is its cluster id (might want to change?)
            let clusterIndex = self.clusterIDtoIndex[self.unitInfo[id].clusterID];
            self.clusters[clusterIndex].castle = 0; // castle no longer exists
            self.clusterProgress[clusterIndex].church = -1; // since it died this turn, enemy must be nearby
            // TODO: recompute closest castle for all clusters (might not be necessary after self.clusters[clusterIndex].castle = 0)
            // sort clusters again? (need to keep clusterProgress in same order as self.clusters, or index clusterProgress by cluster id)
        }
        else if (self.unitInfo[id].type === SPECS.CHURCH) {
            // unit info for church is its cluster id
            let clusterIndex = self.clusterIDtoIndex[self.unitInfo[id].clusterID];
            self.clusterProgress[clusterIndex].church = -1; // since it died this turn, enemy must be nearby
        }
        else if (self.unitInfo[id].type === SPECS.PROPHET) {
            let clusterIndex = self.clusterIDtoIndex[self.unitInfo[id].clusterID];
            if (self.unitInfo[id].info === 0) { // defense
                self.clusterProgress[clusterIndex].prophets.splice(self.clusterProgress[clusterIndex].prophets.indexOf(id), 1);
            }
        }
        // TODO: add for other unit types
        self.unitInfo[id] = { type: -1, info: -1, clusterID: -1 };
    }

    // check new units
    castleUtil.addNewUnits(self);
};

castleUtil.updateChurchesInProgress = (self) => {
    self.churchesInProgress = 0;
    for (let i = 0; i < self.clusterProgress.length; i++) {
        if (self.clusterProgress[i].church === 1)
            self.churchesInProgress++;
    }
};




// castle resource code


// for castles only
castleUtil.initClusterProgress = (self) => {
    self.clusterProgress = new Array(self.clusters.length);
    for (let i = 0; i < self.clusters.length; i++) {
        // clusterProgress.church:
        // 0 means no church
        // 1 means pilgrim moving to build church
        // 2 means church already built
        // -1 means controlled by enemy
        // karbPilgrims, fuelPilgrims, and prophets are lists of IDs
        self.clusterProgress[i] = {
            church: 0,
            karb: new Array(self.clusters[i].karb.length).fill(-1), // ID of assigned worker
            fuel: new Array(self.clusters[i].fuel.length).fill(-1),
            karbPilgrims: 0,
            fuelPilgrims: 0,
            prophets: []
        };
        if (self.clusters[i].castle > 0) {
            self.clusterProgress[i].church = 2;
        }
        else if (self.clusters[i].castle < 0) {
            self.clusterProgress[i].church = -1;
        }
    }
};

castleUtil.isDone = (self, clusterIndex) => {
    return (self.clusterProgress[clusterIndex].karbPilgrims >= self.clusters[clusterIndex].karb.length
        && self.clusterProgress[clusterIndex].fuelPilgrims >= self.clusters[clusterIndex].fuel.length
        && self.clusterProgress[clusterIndex].prophets.length >= castleUtil.neededDefenseProphets(self, clusterIndex));
};

// for castles only
// TODO: search for church = 0 first, then church = -1 to avoid attacking
castleUtil.getTargetCluster = (self) => {
    if (!castleUtil.isDone(self, self.myCluster))
        return self.myCluster; // first priority is to finish your own cluster
    for (let i = 0; i < self.clusters.length; i++) {
        if (self.clusters[i].castle > 0 && !castleUtil.isDone(self, i))
            return -1; // wait for other castles to finish setting up their clusters
    }
    // for other clusters, only way for castle to help is to send church pilgrim if church = 0
    for (let i = 0; i < self.clusterProgress.length; i++) {
        if (self.clusterProgress[i].church === 0) {
            // cluster i is the next one to target
            if (self.clusters[i].closestCastle.castleID === self.castleNumber)
                return i; // send a church pilgrim
            else
                return -1; // wait for other castles to send church pilgrim
        }
    }
    // if no free clusters to take, all castles should attack one cluster
    for (let i = 0; i < self.clusterProgress.length; i++) {
        if (self.clusterProgress[i].church === -1) {
            return i;
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
            // self.clusterProgress[self.myCluster].karb[i] = 0; // 0 means pilgrim exists but id unknown
            let resourceID = self.clusters[self.myCluster].karb[i];
            let destination = self.allResources[resourceID].pos;
            let shift = util.closestAdjacent(self, destination);

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
            // self.clusterProgress[self.myCluster].fuel[i] = 0; // 0 means pilgrim exists but id unknown
            let resourceID = self.clusters[self.myCluster].fuel[i];
            let destination = self.allResources[resourceID].pos;
            let shift = util.closestAdjacent(self, destination);

            self.log("Buliding fuel pilgrim at " + util.pairToString(util.addPair(self.loc, shift))
                + " to target fuel at " + util.pairToString(destination));
            signalling.pilgrimInitSignal(self, resourceID, shift);
            return self.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
        }
    }
    self.log("ERROR! Tried to build fuel pilgrim when desired number is already reached");
};

// castleUtil.buildDefenseMage = (self, enemy) => { // enemy.relPos is relative position to castle
//     self.log("Building defense mage to protect against enemy at "
//         + util.pairToString(util.addPair(self.loc, enemy.relPos)));
//     let shift = util.closestAdjacent(self, util.addPair(self.loc, enemy.relPos));
//     if (util.pairEq(shift, { x: -100, y: -100 })) {
//         self.log("Nowhere to place new mage");
//         return;
//     }
//     signalling.baseToDefenseMage(self, enemy.relPos, util.norm(shift));
//     return self.buildUnit(SPECS.PREACHER, shift.x, shift.y);
// }

castleUtil.buildDefenseUnit = (self, unitType, pos) => {
    self.log("Building defense unit of type " + unitType + " at " + util.pairToString(pos));
    let shift = util.closestAdjacent(self, pos);
    if (util.pairEq(shift, { x: -100, y: -100 })) {
        self.log("ERROR! Nowhere to place new defense unit");
        return;
    }
    signalling.baseToMilitaryUnit(self, 0, pos, util.norm(shift));
    return self.buildUnit(unitType, shift.x, shift.y);
};

// for castles and churches
// TODO: take into account distance to enemy castles / middle
castleUtil.neededDefenseProphets = (self, clusterIndex) => {
    // return self.clusters[self.myCluster].mines.length;
    return Math.floor(self.me.turn / 10);
};

castleUtil.buildChurchPilgrim = (self, clusterIndex) => {
    // assign pilgrim to closest karb
    // let assignedMine = self.clusters[clusterIndex].karb[0]; // if pilgrims can already calculate, why signal to them?
    let shift = util.closestAdjacent(self, self.clusters[clusterIndex].churchPos);
    self.log("Building church pilgrim at " + util.pairToString(util.addPair(self.loc, shift))
        + " for cluster " + clusterIndex);
    self.log("Church is supposed to be built at " + util.pairToString(self.clusters[clusterIndex].churchPos));
    signalling.churchPilgrimInitSignal(self, self.clusters[clusterIndex].id, util.norm(shift));
    return self.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
};

castleUtil.canMaintainBuffer = (self, unitType) => {
    return (self.karbonite - SPECS.UNITS[unitType].CONSTRUCTION_KARBONITE >= self.karbBuffer + self.churchesInProgress * SPECS.UNITS[SPECS.CHURCH].CONSTRUCTION_KARBONITE
        && self.fuel - SPECS.UNITS[unitType].CONSTRUCTION_FUEL >= self.fuelBuffer + self.churchesInProgress * SPECS.UNITS[SPECS.CHURCH].CONSTRUCTION_FUEL);
};

castleUtil.initDefensePositions = (self) => {
    self.defensePositions = [];
    let r = 15;
    for (let x = Math.max(0, self.loc.x - r); x <= Math.min(self.map.length - 1, self.loc.x + r); x++) {
        for (let y = Math.max(0, self.loc.y - r); y <= Math.min(self.map.length - 1, self.loc.y + r); y++) {
            if (util.sqDist(self.loc, { x: x, y: y }) > 2) {
                if ((x + y) % 2 === (self.loc.x + self.loc.y) % 2 && self.avoidMinesMap[y][x] && !util.pairEq({x:x, y:y}, self.loc)) {
                    self.defensePositions.push({ x: x, y: y });
                }
            }
        }
    }
    self.defensePositions.sort(util.sortByDistToPoint(self.loc));
    self.defenseProgress = new Array(self.defensePositions.length);
    for (let i = 0; i < self.defenseProgress.length; i++) {
        self.defenseProgress[i] = { type: -1, id: -1 };
    }
};

castleUtil.initAttackPositions = (self) => {
    self.attackPositions = [];
    let r = 15;
    for (let x = Math.max(0, self.loc.x - r); x <= Math.min(self.map.length - 1, self.loc.x + r); x++) {
        for (let y = Math.max(0, self.loc.y - r); y <= Math.min(self.map.length - 1, self.loc.y + r); y++) {
            if (util.sqDist(self.loc, { x: x, y: y }) > 9) {
                if ((x + y) % 2 !== (self.loc.x + self.loc.y) % 2 && self.avoidMinesMap[y][x]) {
                    self.attackPositions.push({ x: x, y: y });
                }
            }
        }
    }
    self.attackPositions.sort(util.sortByDistToPoint(self.loc));
    self.attackProgress = new Array(self.attackPositions.length);
    for (let i = 0; i < self.attackProgress.length; i++) {
        self.attackProgress[i] = { type: -1, id: -1 };
    }
};

castleUtil.getDefensePosIndex = (self) => {
    for (let i = 0; i < self.defenseProgress.length; i++) {
        if (self.defenseProgress[i].type === -1) {
            return i;
        }
    }
};

castleUtil.getClosestDefensePos = (self, enemyPos, unitType) => {
    for (let i = 0; i < self.defensePositions.length; i++) {
        if (self.defenseProgress[i].type === -1 && util.sqDist(self.defensePositions[i], enemyPos) <= SPECS.UNITS[unitType].ATTACK_RADIUS[1]) {
            return i;
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

nav.move = (loc, destination, bfsGrid, map, robots, speed, forceMove = false) => {
    let minTime = 1000000;
    let minDist = 1000000;
    let bestMove = { x: 0, y: 0 };
    for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
            let next = { x: loc.x + dx, y: loc.y + dy };
            if (util.sqDist(loc, next) <= speed && (util.empty(next, map, robots) || (dx === 0 && dy === 0 && !forceMove))) {
                // prioritize fast over cost
                if (bfsGrid[next.y][next.x] < minTime || (bfsGrid[next.y][next.x] === minTime && util.sqDist(next, destination) < minDist)) {
                    minTime = bfsGrid[next.y][next.x];
                    minDist = util.sqDist(next, destination);
                    bestMove = { x: dx, y: dy };
                }
            }
        }
    }
    return bestMove;
};

nav.updateNoRobotMap = (self) => {
    let r = Math.ceil(Math.sqrt(SPECS.UNITS[self.me.unit].VISION_RADIUS));
    for (let x = Math.max(0, self.loc.x - r); x <= Math.min(self.map.length - 1, self.loc.x + r); x++) {
        for (let y = Math.max(0, self.loc.y - r); y <= Math.min(self.map.length - 1, self.loc.y + r); y++) {
            if (util.sqDist(self.loc, { x: x, y: y }) <= SPECS.UNITS[self.me.unit].VISION_RADIUS) {
                self.noMineRobotMap[y][x] = self.avoidMinesMap[y][x] && (self.robotMap[y][x] === 0);
            }
        }
    }
};

const resource = {};

// main function
resource.mainInit = (self) => {
    resource.initFullResourceList(self);
    resource.splitIntoClusters(self);
    for (let i = 0; i < self.clusters.length; i++) {
        resource.computeChurchPosition(self, self.clusters[i]);
        // self.log("Before sort:");
        // self.log(self.clusters[i].mines);
        // self.log("Church position: " + util.pairToString(self.clusters[i].churchPos));
        self.clusters[i].mines.sort(resource.sortMinesByChurchDist(self, self.clusters[i].churchPos));
        // self.log("After sort:");
        // self.log(self.clusters[i].mines);
        resource.splitByResource(self, self.clusters[i]);
    }
    resource.assignClusterIDs(self);
    if (self.me.unit === SPECS.CASTLE) {
        resource.findCastleClusters(self);
        for (let i = 0; i < self.clusters.length; i++) {
            resource.findClosestCastle(self, self.clusters[i]);
            resource.computePriority(self, self.clusters[i]);
        }
        self.clusters.sort(resource.sortByPriority);
        self.log("Clusters sorted by priority:");
        for (let i = 0; i < self.clusters.length; i++) {
            self.log(util.pairToString(self.clusters[i].churchPos) + " has priority " + self.clusters[i].priority);
        }
        self.clusterIDtoIndex = new Array(self.clusters.length);
        for (let i = 0; i < self.clusters.length; i++) {
            self.clusterIDtoIndex[self.clusters[i].id] = i;
        }
    }
    // self.log("Finished making clusters!");
    // for (let i = 0; i < self.clusters.length; i++)
    //     self.log(self.clusters[i]);
};

resource.initFullResourceList = (self) => {
    self.allResources = [];
    self.totalKarb = 0;
    self.totalFuel = 0;
    for (let x = 0; x < self.map.length; x++) {
        for (let y = 0; y < self.map.length; y++) {
            if (self.karbonite_map[y][x]) {
                self.allResources.push({ type: 0, pos: { x: x, y: y }, clusterID: -1 });
                self.totalKarb++;
            }
            else if (self.fuel_map[y][x]) {
                self.allResources.push({ type: 1, pos: { x: x, y: y }, clusterID: -1 });
                self.totalFuel++;
            }
        }
    }
    // self.log("self.allResources");
    // for (let i = 0; i < self.allResources.length; i++) {
    //     self.log("self.allResources[" + i + "].pos = " + util.pairToString(self.allResources[i].pos));
    // }
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
        // self.log("New Cluster!");
        for (let j = 0; j < connectedComponent.length; j++) {
            inCluster[connectedComponent[j]] = true;
            // self.log(util.pairToString(self.allResources[connectedComponent[j]].pos));
        }
        self.clusters.push({
            mines: connectedComponent,
            castle: 0,
            churchPos: { x: -1, y: -1 },
            karb: [],
            fuel: [],
            id: -1,
            closestCastle: { castleID: -1, avgDist: 0, enemyCastleID: -1, avgEnemyDist: 0 },
            priority: -1
        });
    }
};

// TODO: take sum of sqDist to break extra time ties, to estimate fuel cost
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
    // self.log("minX = " + minX + ", maxX = " + maxX + ", minY = " + minY + ", maxY = " + maxY);

    let smallMap = new Array(maxY - minY + 1);
    let smallAvoidMinesMap = new Array(maxY - minY + 1);
    let adjacentMines = new Array(maxY - minY + 1);
    let extraTime = new Array(maxY - minY + 1);
    // let bfs = [];
    for (let i = 0; i <= maxY - minY; i++) {
        smallMap[i] = new Array(maxX - minX + 1);
        smallAvoidMinesMap[i] = new Array(maxX - minX + 1);
        adjacentMines[i] = new Array(maxX - minX + 1).fill(0);
        extraTime[i] = new Array(maxX - minX + 1).fill(0);
        // bfs.push(new Array(maxX - minX + 1));
    }

    for (let x = 0; x <= maxX - minX; x++) {
        for (let y = 0; y <= maxY - minY; y++) {
            smallMap[y][x] = self.map[y + minY][x + minX]; // TODO: pilgrims avoid all mines except their own
            smallAvoidMinesMap[y][x] = self.avoidMinesMap[y + minY][x + minX];
        }
    }

    let foundChurch = false;
    let maxAdjacentMines = -1;
    for (let x = 0; x <= maxX - minX; x++) {
        for (let y = 0; y <= maxY - minY; y++) {
            if (smallAvoidMinesMap[y][x]) {
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
        // self.log("Cluster:");
        // self.log(cluster);
        // self.log("minX = " + minX + ", maxX = " + maxX + ", minY = " + minY + ", maxY = " + maxY);
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
    let minDistSum = 1000000;
    for (let x = 0; x <= maxX - minX; x++) {
        for (let y = 0; y <= maxY - minY; y++) {
            if (smallAvoidMinesMap[y][x] && adjacentMines[y][x] >= maxAdjacentMines - 1) {
                let bfs = nav.fullBFS({ x: x, y: y }, smallMap, SPECS.UNITS[SPECS.PILGRIM].SPEED, true);
                // calculate nunber of extra turns needed
                // self.log("Considering church position " + util.pairToString({ x: x + minX, y: y + minY }));
                let extraTime = 0;
                for (let i = 0; i < cluster.mines.length; i++) {
                    extraTime += bfs[self.allResources[cluster.mines[i]].pos.y - minY][self.allResources[cluster.mines[i]].pos.x - minX];
                }
                // self.log("Extra time = " + extraTime);
                if (extraTime <= minExtraTime) {
                    let distSum = 0;
                    for (let i = 0; i < cluster.mines.length; i++) {
                        distSum += util.sqDist({ x: x + minX, y: y + minY }, self.allResources[cluster.mines[i]].pos);
                    }
                    if (extraTime < minExtraTime || distSum < minDistSum) {
                        cluster.churchPos = { x: x + minX, y: y + minY };
                        minExtraTime = extraTime;
                        minDistSum = distSum;
                    }
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

// for castles, this happens before clusters is sorted
resource.getClusterID = (self, pos) => {
    let minDist = 1000000;
    let closest = -1;
    for (let j = 0; j < self.allResources.length; j++) {
        if (util.sqDist(pos, self.allResources[j].pos) < minDist) {
            minDist = util.sqDist(pos, self.allResources[j].pos);
            closest = j;
        }
    }
    for (let j = 0; j < self.clusters.length; j++) {
        if (self.clusters[j].mines.includes(closest)) {
            return j;
        }
    }
};

// TODO: set church = 2 or church = -1
// for castles only
resource.findCastleClusters = (self) => {
    for (let i = 0; i < self.castlePos.length; i++) {
        let clusterID = resource.getClusterID(self, self.castlePos[i]);
        self.clusters[clusterID].castle = i + 1;
        self.unitInfo[self.castles[i]].clusterID = clusterID;
    }
    // enemy castles
    for (let i = 0; i < self.enemyCastlePos.length; i++) {
        let clusterID = resource.getClusterID(self, self.enemyCastlePos[i]);
        self.clusters[clusterID].castle = -(i + 1);
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
    let minDist = 1000000;
    let minEnemyDist = 1000000;
    for (let i = 0; i < self.castlePos.length; i++) {
        if (util.sqDist(cluster.churchPos, self.castlePos[i]) < minDist) {
            cluster.closestCastle.castleID = i;
            minDist = util.sqDist(cluster.churchPos, self.castlePos[i]);
        }
        cluster.closestCastle.avgDist += Math.pow(util.sqDist(cluster.churchPos, self.castlePos[i]), 0.5) / self.castlePos.length;
    }
    for (let i = 0; i < self.enemyCastlePos.length; i++) {
        if (util.sqDist(cluster.churchPos, self.enemyCastlePos[i]) < minEnemyDist) {
            cluster.closestCastle.enemyCastleID = i;
            minEnemyDist = util.sqDist(cluster.churchPos, self.enemyCastlePos[i]);
        }
        cluster.closestCastle.avgEnemyDist += Math.pow(util.sqDist(cluster.churchPos, self.enemyCastlePos[i]), 0.5) / self.enemyCastlePos.length;
    }
    // self.log("Average dist of " + util.pairToString(cluster.churchPos) + " is " + cluster.avgDist);
    // self.log("Average enemy dist of " + util.pairToString(cluster.churchPos) + " is " + cluster.avgEnemyDist);
};

// for castles only
// TODO: tune weights
resource.computePriority = (self, cluster) => {
    let resources = 2 * cluster.karb.length / self.totalKarb + cluster.fuel.length / self.totalFuel; // multiply by # of clusters?
    let castleDistance = (-1.2 * Math.pow(cluster.closestCastle.avgDist, 0.5) + Math.pow(cluster.closestCastle.avgEnemyDist, 0.5)) / Math.pow(self.map.length, 0.5);
    cluster.priority = 1.8 * resources + castleDistance;
};

// for castles only
resource.sortByPriority = (a, b) => {
    return b.priority - a.priority;
    // if (Math.sign(a.castle) !== Math.sign(b.castle))
    //     return Math.sign(b.castle) - Math.sign(a.castle);
    // if (a.priority !== b.priority)
    //     return b.priority - a.priority;
    // if (a.churchPos.x !== b.churchPos.x)
    //     return a.churchPos.x - b.churchPos.x;
    // if (a.churchPos.y !== b.churchPos.y)
    //     return a.churchPos.y - b.churchPos.y;
};

resource.sortMinesByChurchDist = (self, churchPos) => {
    return function (a, b) {
        return util.sqDist(self.allResources[a].pos, churchPos) - util.sqDist(self.allResources[b].pos, churchPos);
    };
};

const castle = {};

castle.takeTurn = (self) => {
    self.loc = { x: self.me.x, y: self.me.y }; // change to let loc
    self.log("Castle Position: " + util.pairToString(self.loc));
    self.log("Team karb: " + self.karbonite + ", team fuel: " + self.fuel);

    if (self.me.turn === 1) {
        self.unitInfo = new Array(4097);
        for (let i = 0; i <= 4096; i++) {
            self.unitInfo[i] = { type: -1, info: -1, clusterID: -1 };
        }

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
                    self.unitInfo[r.id].type = SPECS.CASTLE;
                    self.unitInfo[r.id].info = rCastleNumber;
                }
            }
        }
        self.castles[self.castleNumber] = self.me.id;
        self.castlePos[self.castleNumber] = { x: self.me.x, y: self.me.y };
        self.castleTalk(((self.castleNumber + 1) << 6) + self.me.x);
        self.unitInfo[self.me.id].type = SPECS.CASTLE;
        self.unitInfo[self.me.id].info = self.castleNumber;

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
                        self.unitInfo[r.id].type = SPECS.CASTLE;
                        self.unitInfo[r.id].info = rCastleNumber;
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

        util.initMaps(self);
        resource.mainInit(self);
        for (let i = 0; i < self.clusters.length; i++) {
            if (self.clusters[i].castle === self.castleNumber + 1) {
                self.myCluster = i;
            }
        }
        castleUtil.initClusterProgress(self);
        castleUtil.initDefensePositions(self);
        castleUtil.initAttackPositions(self);
        self.log("Defense positions:");
        self.log(self.defensePositions);
        

        // self.castles already exists
        // self.churches = [];
        // self.pilgrims = [];
        // self.crusaders = [];
        // self.prophets = []; // rangers
        // self.preachers = []; // mages/tanks

        self.karbBuffer = 30; // TODO: make it dynamic
        self.fuelBuffer = 200; // TODO: make it dynamic
    }

    castleUtil.updateUnitInfo(self, self.visible); // TODO: add updates to clusterProgress
    castleUtil.updateChurchesInProgress(self);

    let visibleEnemies = util.findEnemies(self, self.visible);
    let targetCluster = castleUtil.getTargetCluster(self);

    self.log("Cluster Progress:");
    for (let i = 0; i < self.clusters.length; i++)
        self.log(self.clusterProgress[i]);
    self.log("Target Cluster: " + targetCluster);

    if (util.hasSpaceAround(self)) {
        if (visibleEnemies.length > 0) { // change to if any cluster is under attack
            self.log("Under attack!");
            if (util.canBuild(self, SPECS.PROPHET)) {
                let defensePosIndex = castleUtil.getClosestDefensePos(self, visibleEnemies[0].pos, SPECS.PROPHET);
                self.lastDefensePosIndex = defensePosIndex;
                return churchUtil.buildDefenseUnit(self, SPECS.PROPHET, self.defensePositions[defensePosIndex]);
            }
            else if (util.canAttack(self, visibleEnemies[0].pos)) {
                self.attack(visibleEnemies[0].pos.x - self.loc.x, visibleEnemies[0].pos.y - self.pos.y);
            }
        }
        else if (targetCluster === self.myCluster) {
            if (self.clusterProgress[self.myCluster].karbPilgrims < self.clusters[self.myCluster].karb.length) {
                // build more karb pilgrims
                if (castleUtil.canMaintainBuffer(self, SPECS.PILGRIM)) {
                    return castleUtil.buildKarbPilgrim(self); // add way to properly choose mine for pilgrim
                }
                else {
                    // build up more resources before expanding, to maintain buffer
                    self.log("Saving for karb pilgrim");
                    return;
                }
            }
            else if (self.clusterProgress[self.myCluster].fuelPilgrims < self.clusters[self.myCluster].fuel.length) {
                if (castleUtil.canMaintainBuffer(self, SPECS.PILGRIM)) {
                    return castleUtil.buildFuelPilgrim(self);
                }
                else {
                    // build up more resources before expanding, to maintain buffer
                    self.log("Saving for fuel pilgrim");
                    return;
                }
            } // neededDefenseProphets should take turn number (and previous enemy attacks?) into account
            else if (self.clusterProgress[self.myCluster].prophets.length < castleUtil.neededDefenseProphets(self)) {
                if (castleUtil.canMaintainBuffer(self, SPECS.PROPHET)) {
                    self.log("Building defense prophet");
                    let defensePosIndex = castleUtil.getDefensePosIndex(self);
                    self.log("index = "+defensePosIndex);
                    self.log(self.defensePositions[defensePosIndex]);
                    self.lastDefensePosIndex = defensePosIndex;
                    return castleUtil.buildDefenseUnit(self, SPECS.PROPHET, self.defensePositions[defensePosIndex]);
                }
                else {
                    // build up more resources before expanding, to maintain buffer
                    self.log("Saving for defense prophet");
                    return;
                }
            }
            else {
                self.log("ERROR! my cluster already has all karb pilgrims, fuel pilgrims, and prophets needed");
                return;
            }
        }
        else if (targetCluster !== -1) {
            // cluster mines are fully occupied by pilgrims and has enough defense. Time to expand
            if (self.clusterProgress[targetCluster].church === 0) {
                if (castleUtil.canMaintainBuffer(self, SPECS.CHURCH)) {
                    return castleUtil.buildChurchPilgrim(self, targetCluster);
                }
                else {
                    self.log("Saving for a church at cluster " + targetCluster);
                }
            }
            else if (self.clusterProgress[targetCluster].church === -1) {
                self.log("Saving up for attack on cluster " + targetCluster);
                // save up units for attack
            }
            else {
                self.log("ERROR! target cluster's church status is neither 0 not 1");
            }
        }
        else {
            self.log("Waiting for other castles to finish their cluster or build new churches");
            if (visibleEnemies.length > 0) {
                if (util.canAttack(self, util.addPair(self.loc, visibleEnemies[0].relPos))) {
                    self.attack(visibleEnemies[0].relPos.x, visibleEnemies[0].relPos.y);
                }
            }
        }
    }
};

const churchUtil$1 = {};

churchUtil$1.findMyClusterID = (self) => {
    for (let i = 0; i < self.clusters.length; i++) {
        if (util.pairEq(self.clusters[i].churchPos, self.loc)) {
            self.myClusterID = i;
        }
    }
};

churchUtil$1.initMyClusterProgress = (self) => {
    self.myClusterProgress = {
        karb: new Array(self.clusters[self.myClusterID].karb.length).fill(-1), // ID of assigned worker
        fuel: new Array(self.clusters[self.myClusterID].fuel.length).fill(-1),
        karbPilgrims: 0,
        fuelPilgrims: 0,
        prophets: [],
    };
};


churchUtil$1.addNewUnits = (self) => {
    for (let i = 0; i < self.visible.length; i++) {
        let r = self.visible[i];
        if (r.team === self.me.team && self.isRadioing(r) && (r.signal >> 14) === 1) {
            if (self.unitInfo[r.id].type !== -1)
                continue;
            // newly created robot
            self.log("Notified of a new robot!");
            self.log("New robot has ID " + r.id);
            let message = r.signal - (1 << 14);
            if (message >> 7) { // resource pilgrim
                self.unitInfo[r.id].type = SPECS.PILGRIM;
                self.unitInfo[r.id].info = message - (1 << 7); // resource ID
                self.unitInfo[r.id].clusterID = self.allResources[self.unitInfo[r.id].info].clusterID;
                if (self.unitInfo[r.id].clusterID !== self.myClusterID) {
                    // self.log("ERROR! New pilgrim sent existence signal to wrong church");
                    // self.log("Pilgrim resource ID is " + self.unitInfo[r.id].info);
                    // self.log("Pilgrim's cluster is " + self.unitInfo[r.id].clusterID);
                    // self.log("My cluster is " + self.myClusterID);
                    // self.log("Pilgrim mine pos is " + self.allResources[self.unitInfo[r.id].info].pos);
                    continue;
                }
                for (let j = 0; j < self.clusters[self.myClusterID].karb.length; j++) {
                    if (self.clusters[self.myClusterID].karb[j] === self.unitInfo[r.id].info) { // karb pilgrim
                        self.myClusterProgress.karb[j] = r.id;
                        self.myClusterProgress.karbPilgrims++;
                    }
                }
                for (let j = 0; j < self.clusters[self.myClusterID].fuel.length; j++) {
                    if (self.clusters[self.myClusterID].fuel[j] === self.unitInfo[r.id].info) { // fuel pilgrim
                        self.myClusterProgress.fuel[j] = r.id;
                        self.myClusterProgress.fuelPilgrims++;
                    }
                }
            }
            else { // military unit
                let attack = message >> 6;
                let clusterID = Math.floor((message & ((1 << 6) - 1)) / 3) - 1; // bits 0-5 give cluster and unit type
                let unitType = (message & ((1 << 6) - 1)) % 3 + 3;
                if (clusterID !== self.myClusterID) {
                    self.log("ERROR! New military unit sent existence signal to wrong church");
                    continue;
                }
                self.log("New military unit, attack = " + attack + ", clusterID = " + clusterID + ", unitType = " + unitType);
                self.unitInfo[r.id].type = unitType;
                self.unitInfo[r.id].info = attack;
                self.unitInfo[r.id].clusterID = clusterID;
                if (attack) {
                    if (self.lastAttackPosIndex === -1) {
                        self.log("ERROR! new attack unit for a castle that didn't build it last turn");
                        continue;
                    }
                    self.attackProgress[self.lastAttackPosIndex].type = unitType;
                    self.attackProgress[self.lastAttackPosIndex].id = r.id;
                }
                else {
                    if (self.lastDefensePosIndex === -1) {
                        self.log("ERROR! new defense unit for a castle that didn't build it last turn");
                        continue;
                    }
                    self.defenseProgress[self.lastDefensePosIndex].type = unitType;
                    self.defenseProgress[self.lastDefensePosIndex].id = r.id;
                }
                if (!attack && unitType === SPECS.PROPHET) {
                    self.myClusterProgress.prophets.push(r.id);
                }
            }
        }
    }
};

churchUtil$1.updateUnitInfo = (self) => {
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
            // unit info for pilgrim is its resource id
            if (self.allResources[self.unitInfo[id].info].type === 0) { // karb pilgrim
                for (let j = 0; j < self.myClusterProgress.karb.length; j++) {
                    if (self.myClusterProgress.karb[j] === id) {
                        self.myClusterProgress.karb[j] = -1;
                    }
                }
                self.myClusterProgress.karbPilgrims--;
            }
            else { // fuel pilgrim
                for (let j = 0; j < self.myClusterProgress.fuel.length; j++) {
                    if (self.myClusterProgress.fuel[j] === id) {
                        self.myClusterProgress.fuel[j] = -1;
                    }
                }
                self.myClusterProgress.fuelPilgrims--;
            }
        }
        // TODO: add for other unit types
        self.unitInfo[id] = { type: -1, info: -1, clusterID: -1 };
    }

    // check new units
    churchUtil$1.addNewUnits(self);
};

// TODO: fix case when pilgrim killed while id unknown (0). Do this in update by checking new visible units
churchUtil$1.buildKarbPilgrim = (self) => {
    for (let i = 0; i < self.myClusterProgress.karb.length; i++) {
        if (self.myClusterProgress.karb[i] === -1) {
            // found first needed karb pilgrim
            // self.myClusterProgress.karb[i] = 0; // 0 means pilgrim exists but id unknown
            let resourceID = self.clusters[self.myClusterID].karb[i];
            let destination = self.allResources[resourceID].pos;
            let shift = util.closestAdjacent(self, destination);

            self.log("Buliding karb pilgrim at " + util.pairToString(util.addPair(self.loc, shift))
                + " to target karb at " + util.pairToString(destination));
            signalling.pilgrimInitSignal(self, resourceID, shift);
            return self.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
        }
    }
    self.log("ERROR! Tried to build karb pilgrim when desired number is already reached");
};

// TODO: fix case when pilgrim killed while id unknown (0). Do this in update by checking new visible units
churchUtil$1.buildFuelPilgrim = (self) => {
    for (let i = 0; i < self.myClusterProgress.fuel.length; i++) {
        if (self.myClusterProgress.fuel[i] === -1) {
            // found first needed fuel pilgrim
            // self.myClusterProgress.fuel[i] = 0; // 0 means pilgrim exists but id unknown
            let resourceID = self.clusters[self.myClusterID].fuel[i];
            let destination = self.allResources[resourceID].pos;
            let shift = util.closestAdjacent(self, destination);

            self.log("Buliding fuel pilgrim at " + util.pairToString(util.addPair(self.loc, shift))
                + " to target fuel at " + util.pairToString(destination));
            signalling.pilgrimInitSignal(self, resourceID, shift);
            return self.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
        }
    }
    self.log("ERROR! Tried to build fuel pilgrim when desired number is already reached");
};

// churchUtil.buildDefenseMage = (self, enemy) => { // enemy.relPos is relative position to castle
//     // self.log("In build defense mage: There is an enemy unit at " + util.pairToString(util.addPair(self.loc, enemy.relPos)));
//     self.log("Building defense mage to protect against enemy at "
//         + util.pairToString(util.addPair(self.loc, enemy.relPos)));
//     let shift = util.closestAdjacent(self, util.addPair(self.loc, enemy.relPos));
//     if (util.pairEq(shift, { x: -100, y: -100 })) {
//         self.log("Nowhere to place new mage");
//         return;
//     }
//     signalling.baseToDefenseMage(self, enemy.relPos, util.norm(shift));
//     return self.buildUnit(SPECS.PREACHER, shift.x, shift.y);
// }

churchUtil$1.buildDefenseUnit = (self, unitType, pos) => {
    self.log("Building defense unit of type " + unitType + " at " + util.pairToString(pos));
    let shift = util.closestAdjacent(self, pos);
    if (util.pairEq(shift, { x: -100, y: -100 })) {
        self.log("ERROR! Nowhere to place new defense unit");
        return;
    }
    signalling.baseToMilitaryUnit(self, 0, pos, util.norm(shift));
    return self.buildUnit(unitType, shift.x, shift.y);
};

churchUtil$1.neededDefenseProphets = (self) => {
    return Math.floor(self.me.turn / 10);
};

churchUtil$1.canMaintainBuffer = (self, unitType) => {
    return (self.karbonite - SPECS.UNITS[unitType].CONSTRUCTION_KARBONITE >= self.karbBuffer
        && self.fuel - SPECS.UNITS[unitType].CONSTRUCTION_FUEL >= self.fuelBuffer);
};

churchUtil$1.initDefensePositions = (self) => {
    self.defensePositions = [];
    let r = 15;
    for (let x = Math.max(0, self.loc.x - r); x <= Math.min(self.map.length - 1, self.loc.x + r); x++) {
        for (let y = Math.max(0, self.loc.y - r); y <= Math.min(self.map.length - 1, self.loc.y + r); y++) {
            if (util.sqDist(self.loc, { x: x, y: y }) > 2) {
                if ((x + y) % 2 === (self.loc.x + self.loc.y) % 2 && self.avoidMinesMap[y][x] && !util.pairEq({ x: x, y: y }, self.loc)) {
                    self.defensePositions.push({ x: x, y: y });
                }
            }
        }
    }
    self.defensePositions.sort(util.sortByDistToPoint(self.loc));
    self.defenseProgress = new Array(self.defensePositions.length);
    for (let i = 0; i < self.defenseProgress.length; i++) {
        self.defenseProgress[i] = { type: -1, id: -1 };
    }
};

churchUtil$1.initAttackPositions = (self) => {
    self.attackPositions = [];
    let r = 15;
    for (let x = Math.max(0, self.loc.x - r); x <= Math.min(self.map.length - 1, self.loc.x + r); x++) {
        for (let y = Math.max(0, self.loc.y - r); y <= Math.min(self.map.length - 1, self.loc.y + r); y++) {
            if (util.sqDist(self.loc, { x: x, y: y }) > 9) {
                if ((x + y) % 2 !== (self.loc.x + self.loc.y) % 2 && self.avoidMinesMap[y][x]) {
                    self.attackPositions.push({ x: x, y: y });
                }
            }
        }
    }
    self.attackPositions.sort(util.sortByDistToPoint(self.loc));
    self.attackProgress = new Array(self.attackPositions.length);
    for (let i = 0; i < self.attackProgress.length; i++) {
        self.attackProgress[i] = { type: -1, id: -1 };
    }
};

churchUtil$1.getDefensePosIndex = (self) => {
    for (let i = 0; i < self.defenseProgress.length; i++) {
        if (self.defenseProgress[i].type === -1) {
            return i;
        }
    }
};

churchUtil$1.getClosestDefensePos = (self, enemyPos, unitType) => {
    for (let i = 0; i < self.defensePositions.length; i++) {
        if (self.defenseProgress[i].type === -1 && util.sqDist(self.defensePositions[i], enemyPos) <= SPECS.UNITS[unitType].ATTACK_RADIUS[1]) {
            return i;
        }
    }
};

const church = {};

church.takeTurn = (self) => {
    self.loc = { x: self.me.x, y: self.me.y };
    self.log("Church Position: " + util.pairToString(self.loc));
    self.log("Team karb: " + self.karbonite + ", team fuel: " + self.fuel);

    if (self.me.turn === 1) {
        self.unitInfo = new Array(4097);
        for (let i = 0; i <= 4096; i++) {
            self.unitInfo[i] = { type: -1, info: -1, clusterID: -1 };
        }
        util.findSymmetry(self);
        util.initMaps(self);
        resource.mainInit(self);
        churchUtil$1.findMyClusterID(self);
        signalling.churchExists(self);
        churchUtil$1.initMyClusterProgress(self);
        churchUtil$1.initDefensePositions(self);
        churchUtil$1.initAttackPositions(self);

        self.karbBuffer = 30; // TODO: make it dynamic
        self.fuelBuffer = 200; // TODO: make it dynamic
    }

    churchUtil$1.updateUnitInfo(self, self.visible);

    let visibleEnemies = util.findEnemies(self, self.visible);
    visibleEnemies.sort(util.compareDist);
    self.log("Cluster progress");
    self.log(self.myClusterProgress);

    if (util.hasSpaceAround(self)) {
        if (visibleEnemies.length > 0) { // change to if any cluster is under attack
            self.log("Under attack!");
            // self.log("There is an enemy unit at " + util.pairToString(util.addPair(self.loc, visibleEnemies[0].relPos)));
            if (util.canBuild(self, SPECS.PROPHET)) {
                let defensePosIndex = churchUtil$1.getClosestDefensePos(self, visibleEnemies[0].pos, SPECS.PROPHET);
                self.lastDefensePosIndex = defensePosIndex;
                return churchUtil$1.buildDefenseUnit(self, SPECS.PROPHET, self.defensePositions[defensePosIndex]);
            }
        }
        else {
            if (self.myClusterProgress.karbPilgrims < self.clusters[self.myClusterID].karb.length) {
                // build more karb pilgrims
                if (churchUtil$1.canMaintainBuffer(self, SPECS.PILGRIM)) {
                    return churchUtil$1.buildKarbPilgrim(self); // add way to properly choose mine for pilgrim
                }
                else {
                    // build up more resources before expanding, to maintain buffer
                    self.log("Saving for karb pilgrim");
                    return;
                }
            }
            else if (self.myClusterProgress.fuelPilgrims < self.clusters[self.myClusterID].fuel.length) {
                if (churchUtil$1.canMaintainBuffer(self, SPECS.PILGRIM)) {
                    return churchUtil$1.buildFuelPilgrim(self);
                }
                else {
                    // build up more resources before expanding, to maintain buffer
                    self.log("Saving for fuel pilgrim");
                    return;
                }
            } // neededDefenseProphets should take turn number (and previous enemy attacks?) into account
            else if (self.myClusterProgress.prophets.length < churchUtil$1.neededDefenseProphets(self)) {
                if (churchUtil$1.canMaintainBuffer(self, SPECS.PROPHET)) {
                    self.log("Building defense prophet");
                    let defensePosIndex = churchUtil$1.getDefensePosIndex(self);
                    self.log("index = " + defensePosIndex);
                    self.log(self.defensePositions[defensePosIndex]);
                    self.lastDefensePosIndex = defensePosIndex;
                    return churchUtil$1.buildDefenseUnit(self, SPECS.PROPHET, self.defensePositions[defensePosIndex]);
                }
                else {
                    // build up more resources before expanding, to maintain buffer
                    self.log("Saving for defense mage");
                    return;
                }
            }
            else {
                self.log("Church finished making all pilgrims and prophets for cluster!");
                return;
            }
        }
    }
};

const pilgrimUtil$1 = {};

// TODO: also check for base death
pilgrimUtil$1.searchCastlesOrChurches = (self) => {
    for (let i = 0; i < self.visible.length; i++) {
        let r = self.visible[i];
        let alreadyFound = false;
        let pos = { x: r.x, y: r.y };
        if (r.unit === SPECS.CASTLE) {
            if (r.team === self.me.team) {
                for (let j = 0; j < self.foundCastles.length; j++) {
                    if (util.pairEq(self.foundCastles[j], pos))
                        alreadyFound = true;
                }
                if (!alreadyFound) {
                    self.foundCastles.push(pos);
                    self.foundEnemyCastles.push(util.reflect(self, pos));
                }
            }
            else {
                for (let j = 0; j < self.foundEnemyCastles.length; j++) {
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
                for (let j = 0; j < self.foundChurches.length; j++) {
                    if (util.pairEq(self.foundChurches[j], pos))
                        alreadyFound = true;
                }
                if (!alreadyFound) {
                    self.foundChurches.push(pos);
                }
            }
            else {
                for (let j = 0; j < self.foundEnemyChurches.length; j++) {
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

pilgrimUtil$1.pilgrimDontDoNothing = (self) => {
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
        util.initMaps(self);
        resource.mainInit(self);
        self.log("self.clusters:");
        for (let i = 0; i < self.clusters.length; i++)
            self.log(self.clusters[i]);
        self.foundCastles = [];
        self.foundChurches = [];
        self.foundEnemyCastles = [];
        self.foundEnemyChurches = [];
        self.lastStuck = false;
        self.usingNoRobotMap = false;
    }

    pilgrimUtil$1.searchCastlesOrChurches(self);

    if (self.me.turn === 1) {
        let receivedMessage = false;
        for (let i = 0; i < self.visible.length; i++) {
            let r = self.visible[i];
            if (r.team === self.me.team
                && (r.unit === SPECS.CASTLE || r.unit === SPECS.CHURCH)
                && self.isRadioing(r) && (r.signal >> 15)
                && util.sqDist(self.loc, { x: r.x, y: r.y }) <= 2) {
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
                    if (r.unit === SPECS.CHURCH) {
                        signalling.newPilgrimExists(self, self.targetMineID, 10);
                    }
                }
                else {
                    self.myClusterID = message - self.allResources.length;
                    self.targetMineID = self.clusters[self.myClusterID].karb[0];
                    self.targetResource = 0;
                    self.targetMinePos = self.allResources[self.targetMineID].pos;
                    self.base = self.clusters[self.myClusterID].churchPos;
                    self.state = "going to build church";
                }
                self.castleTalk((1 << 7) + message);
                util.findSymmetry(self); // why does the pilgrim need this?
                // update avoid mines map
                self.avoidMinesMap[self.targetMinePos.y][self.targetMinePos.x] = true;
                self.avoidMinesMap[self.base.y][self.base.x] = false;
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

    nav.updateNoRobotMap(self);

    if (self.state === "going to build church") {
        // TODO: add check to see if desired church is already built
        self.log("Pilgrim state: " + self.state);
        if (util.sqDist(self.loc, self.base) <= 2) {
            self.state = "building church";
            self.usingNoRobotMap = false;
            self.log("Already arrived at build location, state switching to " + self.state);
        }
        else {
            let chosenMove = -1;
            if (self.usingNoRobotMap) {
                chosenMove = nav.move(self.loc, self.base, self.bfsFromBaseNoRobot, self.noMineRobotMap, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
            }
            else {
                chosenMove = nav.move(self.loc, self.base, self.bfsFromBase, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
            }
            self.log("Move: " + util.pairToString(chosenMove));
            if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                if (self.lastStuck){
                    self.log("Switching to no robot map");
                    self.usingNoRobotMap = true;
                    self.bfsFromBaseNoRobot = nav.fullBFS(self.base, self.noMineRobotMap, SPECS.UNITS[self.me.unit].SPEED, true);
                    chosenMove = nav.move(self.loc, self.base, self.bfsFromBaseNoRobot, self.noMineRobotMap, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);

                    self.log("New move: " + util.pairToString(chosenMove));
                    if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                        self.log("Still stuck, even with no robot map");
                        return pilgrimUtil$1.pilgrimDontDoNothing(self);
                    }
                    else {
                        self.lastStuck = false;
                    }
                }
                else {
                    self.lastStuck = true;
                    if (self.usingNoRobotMap) {
                        chosenMove = nav.move(self.loc, self.base, self.bfsFromBaseNoRobot, self.noMineRobotMap, self.robotMap, SPECS.UNITS[self.me.unit].SPEED, true);
                    }
                    else {
                        chosenMove = nav.move(self.loc, self.base, self.bfsFromBase, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED, true);
                    }
                    self.log("I'm stuck, random move: " + util.pairToString(chosenMove));
                    if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                        self.log("Completely stuck");
                        return pilgrimUtil$1.pilgrimDontDoNothing(self);
                    }
                }
            }
            else {
                self.lastStuck = false;
            }
            if (util.sqDist(util.addPair(self.loc, chosenMove), self.base) <= 2 && util.enoughFuelToMove(self, chosenMove)) {
                self.state = "building church";
                self.usingNoRobotMap = false;
                self.log("Will arrive at build location next turn, state switching to " + self.state);
            }
            return self.move(chosenMove.x, chosenMove.y);
        }
    }

    if (self.state === "building church") {
        if (util.sqDist(self.loc, self.base) > 2) {
            self.log("ERROR! state is " + self.state + " but not currently adjacent to build location");
            self.state = "going to mine";
        }
        else {
            if (util.empty(self.base, self.map, self.robotMap) && util.canBuild(self, SPECS.CHURCH)) {
                self.log("Building church at " + util.pairToString(self.base));
                let shift = util.subtractPair(self.base, self.loc);
                self.castleTalk((1 << 7) + self.targetMineID);
                signalling.pilgrimToNewChurch(self, self.targetMineID, shift);
                self.state = "going to mine";
                return self.buildUnit(SPECS.CHURCH, shift.x, shift.y);
            }
            else {
                self.log("Saving up for church");
                return pilgrimUtil$1.pilgrimDontDoNothing(self);
            }
        }
    }

    if (self.state === "going to mine") {
        self.log("Pilgrim state: " + self.state);
        if (util.pairEq(self.loc, self.targetMinePos)) {
            self.state = "mining"; // can start mining on the same turn
            self.usingNoRobotMap = false;
            self.log("Already arrived at mine, state changed to " + self.state);
        }
        else {
            let chosenMove = -1;
            if (self.usingNoRobotMap) {
                chosenMove = nav.move(self.loc, self.mine, self.bfsFromMineNoRobot, self.noMineRobotMap, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
            }
            else {
                chosenMove = nav.move(self.loc, self.mine, self.bfsFromMine, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
            }
            self.log("Move: " + util.pairToString(chosenMove));
            if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                if (self.lastStuck){
                    self.log("Switching to no robot map");
                    self.usingNoRobotMap = true;
                    self.bfsFromMineNoRobot = nav.fullBFS(self.mine, self.noMineRobotMap, SPECS.UNITS[self.me.unit].SPEED);
                    chosenMove = nav.move(self.loc, self.mine, self.bfsFromMineNoRobot, self.noMineRobotMap, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);

                    self.log("New move: " + util.pairToString(chosenMove));
                    if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                        self.log("Still stuck, even with no robot map");
                        return pilgrimUtil$1.pilgrimDontDoNothing(self);
                    }
                    else {
                        self.lastStuck = false;
                    }
                }
                else {
                    self.lastStuck = true;
                    if (self.usingNoRobotMap) {
                        chosenMove = nav.move(self.loc, self.mine, self.bfsFromMineNoRobot, self.noMineRobotMap, self.robotMap, SPECS.UNITS[self.me.unit].SPEED, true);
                    }
                    else {
                        chosenMove = nav.move(self.loc, self.mine, self.bfsFromMine, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED, true);
                    }
                    self.log("I'm stuck, random move: " + util.pairToString(chosenMove));
                    if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                        self.log("Completely stuck");
                        return pilgrimUtil$1.pilgrimDontDoNothing(self);
                    }
                }
            }
            else {
                self.lastStuck = false;
            }
            // TODO: make pilgrims follow fuel buffer
            if (util.pairEq(util.addPair(self.loc, chosenMove), self.targetMinePos) && util.enoughFuelToMove(self, chosenMove)) {
                self.state = "mining";
                self.usingNoRobotMap = false;
            }
            return self.move(chosenMove.x, chosenMove.y);
        }
    }

    if (self.state === "mining") {
        self.log("Pilgrim state: " + self.state);
        if (self.fuel >= SPECS.MINE_FUEL_COST) {
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
            return pilgrimUtil$1.pilgrimDontDoNothing(self);
        }
    }

    if (self.state === "going to base") {
        self.log("Pilgrim state: " + self.state);
        if (util.sqDist(self.loc, self.base) <= 2) {
            self.state = "depositing";
            self.usingNoRobotMap = false;
            self.log("Already arrived at base, state switching to " + self.state);
        }
        else {
            let chosenMove = -1;
            if (self.usingNoRobotMap) {
                chosenMove = nav.move(self.loc, self.base, self.bfsFromBaseNoRobot, self.noMineRobotMap, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
            }
            else {
                chosenMove = nav.move(self.loc, self.base, self.bfsFromBase, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
            }
            self.log("Move: " + util.pairToString(chosenMove));
            if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                if (self.lastStuck){
                    self.log("Switching to no robot map");
                    self.usingNoRobotMap = true;
                    self.bfsFromBaseNoRobot = nav.fullBFS(self.base, self.noMineRobotMap, SPECS.UNITS[self.me.unit].SPEED, true);
                    chosenMove = nav.move(self.loc, self.base, self.bfsFromBaseNoRobot, self.noMineRobotMap, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);

                    self.log("New move: " + util.pairToString(chosenMove));
                    if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                        self.log("Still stuck, even with no robot map");
                        return pilgrimUtil$1.pilgrimDontDoNothing(self);
                    }
                    else {
                        self.lastStuck = false;
                    }
                }
                else {
                    self.lastStuck = true;
                    if (self.usingNoRobotMap) {
                        chosenMove = nav.move(self.loc, self.base, self.bfsFromBaseNoRobot, self.noMineRobotMap, self.robotMap, SPECS.UNITS[self.me.unit].SPEED, true);
                    }
                    else {
                        chosenMove = nav.move(self.loc, self.base, self.bfsFromBase, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED, true);
                    }
                    self.log("I'm stuck, random move: " + util.pairToString(chosenMove));
                    if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                        self.log("Completely stuck");
                        return pilgrimUtil$1.pilgrimDontDoNothing(self);
                    }
                }
            }
            else {
                self.lastStuck = false;
            }
            if (util.sqDist(util.addPair(self.loc, chosenMove), self.base) <= 2 && util.enoughFuelToMove(self, chosenMove)) {
                self.state = "depositing";
                self.usingNoRobotMap = false;
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
            return pilgrimUtil$1.pilgrimDontDoNothing(self);
        }
    }

    self.log("ERROR! self is the end of pilgrim's turn(), it shouldn't get self far");
    return pilgrimUtil$1.pilgrimDontDoNothing(self);
};

const crusader = {};

const prophet = {};

prophet.takeTurn = (self) => {
    self.loc = { x: self.me.x, y: self.me.y };
    self.log("Ranger Position: " + util.pairToString(self.loc));

    if (self.me.turn === 1) {
        self.receivedFirstMessage = false;
        self.state = "waiting for init messages";
        util.initMaps(self);
        resource.mainInit(self);
        self.lastStuck = false;
        self.usingNoRobotMap = false;
    }


    if (self.state === "waiting for init messages") {
        self.log("Ranger state: " + self.state);
        let receivedMessage = false;
        for (let i = 0; i < self.visible.length; i++) {
            let r = self.visible[i];
            if (r.team === self.me.team
                && (r.unit === SPECS.CASTLE || r.unit === SPECS.CHURCH)
                && self.isRadioing(r) && (r.signal >> 15) === 1) {
                // signal is meant for me!
                self.log("I got a message!");
                receivedMessage = true;

                self.base = { x: r.x, y: r.y };
                self.baseIsChurch = (r.unit === SPECS.CHURCH);
                // self.bfsFromBase = nav.fullBFS(self.base, self.avoidMinesMap, SPECS.UNITS[self.me.unit].SPEED);
                self.myClusterID = resource.getClusterID(self, self.base);

                let hash = r.signal;
                self.attacker = (hash >> 11) & 1;

                let dx = ((hash >> 5) & ((1 << 5) - 1)) - 16;
                let dy = (hash & ((1 << 5) - 1)) - 16;
                self.destination = util.addPair(self.base, { x: dx, y: dy });
                self.bfsFromDestination = nav.fullBFS(self.destination, self.avoidMinesMap, SPECS.UNITS[self.me.unit].SPEED);

                signalling.militaryUnitExists(self, self.attacker, self.myClusterID, self.me.unit);
                self.state = "going to destination";

                self.log("I'm a ranger that just got initialized");
                self.log("Base castle: " + util.pairToString(self.base));
                self.log("Attacker: " + self.attacker);
                self.log("Destination: " + util.pairToString(self.destination));
            }
        }
        if (!receivedMessage) {
            self.log("No message received, state is still " + self.state);
        }
    }

    nav.updateNoRobotMap(self);

    if (util.findEnemies(self, self.visible).length > 0) {
        self.log("Ranger sees enemies!");
        let bestShift = { x: -100, y: -100 };
        let minDist = 100;
        let r = Math.ceil(Math.sqrt(SPECS.UNITS[self.me.unit].ATTACK_RADIUS[1]));
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                let shift = { x: dx, y: dy };
                let targetSquare = util.addPair(self.loc, shift);
                if (!util.canAttack(self, targetSquare))
                    continue;

                let id = self.robotMap[targetSquare.y][targetSquare.x];
                if (id > 0 && self.getRobot(id).team !== self.me.team) {
                    if (util.norm(shift) < minDist){
                        minDist = util.norm(shift);
                        bestShift = shift;
                    }
                }
            }
        }
        self.log("Attacking " + util.pairToString(util.addPair(self.loc, bestShift)));
        return self.attack(bestShift.x, bestShift.y);
    }

    if (self.state === "going to destination") {
        self.log("Ranger state: " + self.state);
        let chosenMove = -1;
        if (self.usingNoRobotMap) {
            chosenMove = nav.move(self.loc, self.destination, self.bfsFromDestinationNoRobot, self.noMineRobotMap, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
        }
        else {
            chosenMove = nav.move(self.loc, self.destination, self.bfsFromDestination, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
        }
        self.log("Move: " + util.pairToString(chosenMove));
        if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
            if (self.lastStuck){
                self.log("Switching to no robot map");
                self.usingNoRobotMap = true;
                self.bfsFromDestinationNoRobot = nav.fullBFS(self.destination, self.noMineRobotMap, SPECS.UNITS[self.me.unit].SPEED);
                chosenMove = nav.move(self.loc, self.destination, self.bfsFromDestinationNoRobot, self.noMineRobotMap, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);

                self.log("New move: " + util.pairToString(chosenMove));
                if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                    self.log("Still stuck, even with no robot map");
                    return pilgrimUtil.pilgrimDontDoNothing(self);
                }
                else {
                    self.lastStuck = false;
                }
            }
            else {
                self.lastStuck = true;
                if (self.usingNoRobotMap) {
                    chosenMove = nav.move(self.loc, self.destination, self.bfsFromDestinationNoRobot, self.noMineRobotMap, self.robotMap, SPECS.UNITS[self.me.unit].SPEED, true);
                }
                else {
                    chosenMove = nav.move(self.loc, self.destination, self.bfsFromDestination, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED, true);
                }
                self.log("I'm stuck, random move: " + util.pairToString(chosenMove));
                
                if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                    self.log("Completely stuck");
                    return pilgrimUtil.pilgrimDontDoNothing(self);
                }
            }
        }
        else {
            self.lastStuck = false;
        }
        if (util.pairEq(util.addPair(self.loc, chosenMove), self.destination) && util.enoughFuelToMove(self, chosenMove))
            self.state = "waiting";
        return self.move(chosenMove.x, chosenMove.y);
    }

    // if (self.state === "defense") {
    //     self.log("Ranger state: " + self.state);
    //     let chosenMove = nav.move(self.loc, self.bfsFromEnemy, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
    //     self.log("Move: " + util.pairToString(chosenMove));
    //     if (util.pairEq(util.addPair(self.loc, chosenMove), self.enemy) && util.enoughFuelToMove(self, chosenMove))
    //         self.state = "waiting";
    //     return self.move(chosenMove.x, chosenMove.y);
    // }

    // if (self.state === "attack") {
    //     self.log("Ranger state: " + self.state);
    //     if (util.sqDist(self.loc, self.enemyCastle) <= SPECS.UNITS[self.me.unit].VISION_RADIUS
    //         && self.getRobot(robotMap[self.enemyCastle.y][self.enemyCastle.x]).unit !== SPECS.CASTLE) {
    //         self.log("Don't see an enemy castle in the expected location, must have been killed");
    //         self.state = "returning";
    //     }
    //     let chosenMove = nav.move(self.loc, self.bfsFromEnemyCastle, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
    //     self.log("Move: " + util.pairToString(chosenMove));
    //     if (util.sqDist(util.addPair(self.loc, chosenMove), self.enemyCastle) && util.enoughFuelToMove(self, chosenMove))
    //         self.state = "returning";
    //     return self.move(chosenMove.x, chosenMove.y);
    // }

    // if (self.state === "returning") {
    //     self.log("Ranger state: " + self.state);
    //     let chosenMove = nav.move(self.loc, self.bfsFromBase, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED); // slow retreat
    //     self.log("Move: " + util.pairToString(chosenMove));
    //     if (util.sqDist(util.addPair(self.loc, chosenMove), self.base) <= 16 && util.enoughFuelToMove(self, chosenMove))
    //         self.state = "waiting";
    //     return self.move(chosenMove.x, chosenMove.y);
    // }
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
        for (let i = 0; i < self.visible.length; i++) {
            let r = self.visible[i];
            if (r.team === self.me.team
                && (r.unit === SPECS.CASTLE || r.unit === SPECS.CHURCH)
                && self.isRadioing(r) && (r.signal >> 15) === 1) {
                // signal is meant for me!
                self.log("I got a message!");
                receivedMessage = true;

                self.base = { x: r.x, y: r.y };
                self.bfsFromBase = nav.fullBFS(self.base, self.avoidMinesMap, SPECS.UNITS[self.me.unit].SPEED);

                let hash = r.signal;
                self.attacker = (hash >> 11) & 1;

                let dx = ((hash >> 5) & ((1 << 5) - 1)) - 16;
                let dy = (hash & ((1 << 5) - 1)) - 16;
                self.destination = util.addPair(self.base, { x: dx, y: dy });
                self.bfsFromDestination = nav.fullBFS(self.destination, self.avoidMinesMap, SPECS.UNITS[self.me.unit].SPEED);

                self.state = "going to destination";

                self.log("I'm a mage that just got initialized");
                self.log("Base castle: " + util.pairToString(self.base));
                self.log("Attacker: " + self.attacker);
                self.log("Destination: " + util.pairToString(self.destination));
            }
        }
        if (!receivedMessage) {
            self.log("No message received, state is still " + self.state);
        }
    }

    if (util.findEnemies(self, self.visible).length > 0) {
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

    if (self.state === "going to destination") {
        self.log("Mage state: " + self.state);
        let chosenMove = -1;
        if (self.usingNoRobotMap) {
            chosenMove = nav.move(self.loc, self.destination, self.bfsFromDestinationNoRobot, self.noMineRobotMap, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
        }
        else {
            chosenMove = nav.move(self.loc, self.destination, self.bfsFromDestination, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
        }
        self.log("Move: " + util.pairToString(chosenMove));
        if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
            if (self.lastStuck){
                self.log("Switching to no robot map");
                self.usingNoRobotMap = true;
                self.bfsFromDestinationNoRobot = nav.fullBFS(self.destination, self.noMineRobotMap, SPECS.UNITS[self.me.unit].SPEED);
                chosenMove = nav.move(self.loc, self.destination, self.bfsFromDestinationNoRobot, self.noMineRobotMap, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);

                self.log("New move: " + util.pairToString(chosenMove));
                if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                    self.log("Still stuck, even with no robot map");
                    return pilgrimUtil.pilgrimDontDoNothing(self);
                }
                else {
                    self.lastStuck = false;
                }
            }
            else {
                self.lastStuck = true;
                if (self.usingNoRobotMap) {
                    chosenMove = nav.move(self.loc, self.destination, self.bfsFromDestinationNoRobot, self.noMineRobotMap, self.robotMap, SPECS.UNITS[self.me.unit].SPEED, true);
                }
                else {
                    chosenMove = nav.move(self.loc, self.destination, self.bfsFromDestination, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED, true);
                }
                self.log("I'm stuck, random move: " + util.pairToString(chosenMove));
                
                if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                    self.log("Completely stuck");
                    return pilgrimUtil.pilgrimDontDoNothing(self);
                }
            }
        }
        else {
            self.lastStuck = false;
        }
        if (util.pairEq(util.addPair(self.loc, chosenMove), self.destination) && util.enoughFuelToMove(self, chosenMove))
            self.state = "waiting";
        return self.move(chosenMove.x, chosenMove.y);
    }

    // if (self.state === "defense") {
    //     self.log("Mage state: " + self.state);
    //     let chosenMove = nav.move(self.loc, self.bfsFromEnemy, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
    //     self.log("Move: " + util.pairToString(chosenMove));
    //     if (util.pairEq(util.addPair(self.loc, chosenMove), self.enemy) && util.enoughFuelToMove(self, chosenMove))
    //         self.state = "returning";
    //     return self.move(chosenMove.x, chosenMove.y);
    // }

    // if (self.state === "attack") {
    //     self.log("Mage state: " + self.state);
    //     if (util.sqDist(self.loc, self.enemyCastle) <= SPECS.UNITS[self.me.unit].VISION_RADIUS
    //         && self.getRobot(robotMap[self.enemyCastle.y][self.enemyCastle.x]).unit !== SPECS.CASTLE) {
    //         self.log("Don't see an enemy castle in the expected location, must have been killed");
    //         self.state = "returning";
    //     }
    //     let chosenMove = nav.move(self.loc, self.bfsFromEnemyCastle, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
    //     self.log("Move: " + util.pairToString(chosenMove));
    //     if (util.sqDist(util.addPair(self.loc, chosenMove), self.enemyCastle) && util.enoughFuelToMove(self, chosenMove))
    //         self.state = "returning";
    //     return self.move(chosenMove.x, chosenMove.y);
    // }

    // if (self.state === "returning") {
    //     self.log("Mage state: " + self.state);
    //     let chosenMove = nav.move(self.loc, self.bfsFromBase, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED); // slow retreat
    //     self.log("Move: " + util.pairToString(chosenMove));
    //     if (util.sqDist(util.addPair(self.loc, chosenMove), self.base) <= 16 && util.enoughFuelToMove(self, chosenMove))
    //         self.state = "waiting";
    //     return self.move(chosenMove.x, chosenMove.y);
    // }
};

// clear && bc19compile -d Churches_V2 -o debug.js -f && bc19run --bc debug.js --rc debug.js
// 3 castle test seed: 1505486586
// times out: 1909424986 (pilgrim bfs)
// only makes two pilgrims: 1298989386. Distance of mines from you and enemy are equal because pilgrim jump is ignored.
// Good eco teams: big red battlecode, oak's last disciple, vvvvv, knights of cowmelot, deus vult, panda lovers

// TODO: replace array.push with array[i] = x to optimize code
// clique with one resource: 1482125857
// remove edge (-1, -1): 1482125857
// one castle many clusters: 216042253
// weird display: 11548711
// castle error: 442739537
// churches on mines: 1160890303
// good for rush: 1160890303
// blue pilgrim stuck behind mages: 289962426, pilgrim stuck at top: 592544751
// pilgrim doesn't move: 1140985075


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
            else if (this.me.unit === SPECS.PROPHET)
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
