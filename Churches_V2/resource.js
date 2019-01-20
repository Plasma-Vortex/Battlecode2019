import { BCAbstractRobot, SPECS } from 'battlecode';
import nav from './nav.js';
import util from './util.js';

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
}

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
}


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
}

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
}

resource.canMaintainBuffer = (self, unitType) => {
    return (self.karbonite - SPECS.UNITS[unitType].CONSTRUCTION_KARBONITE >= self.karbBuffer
        && self.fuel - SPECS.UNITS[unitType].CONSTRUCTION_FUEL >= self.fuelBuffer);
}

export default resource;