import { BCAbstractRobot, SPECS } from 'battlecode';
const util = {};

util.addPair = (a, b) => {
    return {
        x: a.x + b.x,
        y: a.y + b.y
    };
}

util.subtractPair = (a, b) => {
    return {
        x: a.x - b.x,
        y: a.y - b.y
    };
}

util.sqDist = (a, b) => {
    return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
}

util.pairEq = (a, b) => {
    return a.x === b.x && a.y === b.y;
}

util.pairToString = (p) => {
    return "(" + p.x + ", " + p.y + ")";
}

util.inGrid = (pos, map) => {
    return pos.x >= 0 && pos.y >= 0 && pos.x < map[0].length && pos.y < map.length;
}

util.inRect = (pos, minX, minY, maxX, maxY) => {
    return pos.x >= minX && pos.y >= minY && pos.x <= maxX && pos.y <= maxY;
}

util.empty = (loc, map, robotMap = null) => {
    return util.inGrid(loc, map) && map[loc.y][loc.x] && (robotMap === null || robotMap[loc.y][loc.x] <= 0);
}

util.norm = (v) => {
    return v.x * v.x + v.y * v.y;
}

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
}

util.unhashShift = (hash) => {
    return util.shifts[hash];
}

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
}

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
}

// util.compareDistToPoint = (pt) => {
//     return function (a, b) {
//         return util.sqDist(a, pt) - util.sqDist(b, pt);
//     };
// }

util.copyPair = (p) => {
    return { x: p.x, y: p.y };
}

// needs self
util.canBuild = (self, unitType) => {
    return (self.karbonite >= SPECS.UNITS[unitType].CONSTRUCTION_KARBONITE && self.fuel >= SPECS.UNITS[unitType].CONSTRUCTION_FUEL);
}

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
}

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
}

// changed
util.reflect = (self, pt) => {
    if (self.symmetry === "x") {
        return { x: self.map.length - pt.x - 1, y: pt.y };
    }
    else {
        return { x: pt.x, y: self.map.length - pt.y - 1 };
    }
}

// needs self
util.enoughFuelToMove = (self, move) => {
    return self.fuel >= util.norm(move) * SPECS.UNITS[self.me.unit].FUEL_PER_MOVE;
}

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
}

// needs self
util.canAttack = (self, pos) => {
    return util.inGrid(pos, self.map)
        && util.sqDist(pos, self.loc) >= SPECS.UNITS[self.me.unit].ATTACK_RADIUS[0]
        && util.sqDist(pos, self.loc) <= SPECS.UNITS[self.me.unit].ATTACK_RADIUS[1];
}

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
}

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
}

util.L1Norm = (a, b) => {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

util.dfs = (adj, v, visited) => {
    visited[v] = true;
    for (let i = 0; i < adj[v].length; i++) {
        if (!visited[adj[v][i]]) {
            util.dfs(adj, adj[v][i], visited);
        }
    }
}

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
}

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
}

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
}

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
}

export default util;

// done change