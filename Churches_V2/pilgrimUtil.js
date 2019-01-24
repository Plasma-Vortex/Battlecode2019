import { BCAbstractRobot, SPECS } from 'battlecode';
import util from './util.js';
import resource from './resource.js';
import nav from './nav.js';
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
}

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
}

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
}

export default pilgrimUtil;