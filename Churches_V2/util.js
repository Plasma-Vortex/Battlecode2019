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

util.inGrid = (pos, length) => {
    return pos.x >= 0 && pos.y >= 0 && pos.x < length && pos.y < length;
}

util.empty = (loc, map, robotMap = null) => {
    return util.inGrid(loc, map.length) && map[loc.y][loc.x] && (robotMap === null || robotMap[loc.y][loc.x] <= 0);
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

util.compareDist = (a, b) => {
    if (util.norm(a.relPos) !== util.norm(b.relPos))
        return a.relPos - b.relPos;
    else
        return b.unitType - a.unitType;
}

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
    if (!util.inGrid(loc, self.robotMap.length))
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
    return util.inGrid(pos, self.map.length)
        && util.sqDist(pos, self.loc) >= SPECS.UNITS[self.me.unit].ATTACK_RADIUS[0]
        && util.sqDist(pos, self.loc) <= SPECS.UNITS[self.me.unit].ATTACK_RADIUS[1];
}


util.findEnemies = (self, visible) => {
    let enemyUnits = [];
    for (let i = 0; i < visible.length; i++) {
        let r = visible[i];
        if (r.team !== self.me.team) {
            enemyUnits.push({ unitType: r.unit, relPos: util.subtractPair({ x: r.x, y: r.y }, self.loc) });
        }
    }
    return enemyUnits;
}

util.L1Norm = (a, b) => {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

util.dfs = (adj, v, visited) => {
    visited[v] = true;
    for (let i = 0; i < adj[v].length; i++) {
        if (!visited[adj[v][i]]) {
            util.dfs(adj[v][i]);
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
    bestPair = [-1, -1];
    maxMissing = -1;
    for (let v = 0; v<cc.length; v++){
        for (let i = 0; i<adj[v].length; i++){
            let u = adj[v][i];
            // consider edge v, u
            let missing = 0;
            for (let j=0; j<adj[v].length; j++) {
                if (!adj[u].includes(adj[v][j]))
                    missing++;
            }
            for (let j=0; j<adj[u].length; j++) {
                if (!adj[v].includes(adj[u][j]))
                    missing++;
            }
            if (missing > maxMissing){
                bestPair = [v, u];
            }
        }
    }
    return bestPair;
}

export default util;

// done change