import { BCAbstractRobot, SPECS } from 'battlecode';
import util from './util.js';
import resource from './resource.js';
import signalling from './signalling.js';

const churchUtil = {};

churchUtil.findMyClusterID = (self) => {
    for (let i = 0; i < self.clusters.length; i++) {
        if (util.pairEq(self.clusters[i].churchPos, self.loc)) {
            self.myClusterID = i;
        }
    }
}

churchUtil.initMyClusterProgress = (self) => {
    self.myClusterProgress = {
        karb: new Array(self.clusters[self.myClusterID].karb.length).fill(-1), // ID of assigned worker
        fuel: new Array(self.clusters[self.myClusterID].fuel.length).fill(-1),
        karbPilgrims: 0,
        fuelPilgrims: 0,
        prophets: [],
    };
}


churchUtil.addNewUnits = (self) => {
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
                self.log("New military unit, attack = " + attack + ", clusterID = " + clusterID + ", unitType = " + unitType);
                self.unitInfo[r.id].type = unitType;
                self.unitInfo[r.id].info = attack;
                self.unitInfo[r.id].clusterID = clusterID;
                if (clusterID !== self.myClusterID) {
                    self.log("ERROR! New military unit sent existence signal to wrong church");
                    continue;
                }
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
}

churchUtil.updateUnitInfo = (self) => {
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
        else if (self.unitInfo[id].type === SPECS.PROPHET) {
            if (self.unitInfo[id].clusterID === self.myClusterID) {
                self.myClusterProgress.prophets.splice(self.myClusterProgress.prophets.indexOf(id), 1);
            }
            for (let i = 0; i < self.attackProgress.length; i++) {
                if (self.attackProgress[i].id === id) {
                    self.attackProgress[i].id = -1;
                    self.attackProgress[i].type = -1;
                }
            }
            for (let i = 0; i < self.defenseProgress.length; i++) {
                if (self.defenseProgress[i].id === id) {
                    self.defenseProgress[i].id = -1;
                    self.defenseProgress[i].type = -1;
                }
            }
        }
        // TODO: add for other unit types
        self.unitInfo[id] = { type: -1, info: -1, clusterID: -1 };
    }

    // check new units
    churchUtil.addNewUnits(self);
}

// TODO: fix case when pilgrim killed while id unknown (0). Do this in update by checking new visible units
churchUtil.buildKarbPilgrim = (self) => {
    for (let i = 0; i < self.myClusterProgress.karb.length; i++) {
        if (self.myClusterProgress.karb[i] === -1) {
            // found first needed karb pilgrim
            // self.myClusterProgress.karb[i] = 0; // 0 means pilgrim exists but id unknown
            let resourceID = self.clusters[self.myClusterID].karb[i];
            let destination = self.allResources[resourceID].pos
            let shift = util.closestAdjacent(self, destination);

            self.log("Buliding karb pilgrim at " + util.pairToString(util.addPair(self.loc, shift))
                + " to target karb at " + util.pairToString(destination));
            signalling.pilgrimInitSignal(self, resourceID, shift);
            return self.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
        }
    }
    self.log("ERROR! Tried to build karb pilgrim when desired number is already reached")
}

// TODO: fix case when pilgrim killed while id unknown (0). Do this in update by checking new visible units
churchUtil.buildFuelPilgrim = (self) => {
    for (let i = 0; i < self.myClusterProgress.fuel.length; i++) {
        if (self.myClusterProgress.fuel[i] === -1) {
            // found first needed fuel pilgrim
            // self.myClusterProgress.fuel[i] = 0; // 0 means pilgrim exists but id unknown
            let resourceID = self.clusters[self.myClusterID].fuel[i];
            let destination = self.allResources[resourceID].pos
            let shift = util.closestAdjacent(self, destination);

            self.log("Buliding fuel pilgrim at " + util.pairToString(util.addPair(self.loc, shift))
                + " to target fuel at " + util.pairToString(destination));
            signalling.pilgrimInitSignal(self, resourceID, shift);
            return self.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
        }
    }
    self.log("ERROR! Tried to build fuel pilgrim when desired number is already reached")
}

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

churchUtil.buildDefenseUnit = (self, unitType, pos) => {
    self.log("Building defense unit of type " + unitType + " at " + util.pairToString(pos));
    let shift = util.closestAdjacent(self, pos);
    if (util.pairEq(shift, { x: -100, y: -100 })) {
        self.log("ERROR! Nowhere to place new defense unit");
        return;
    }
    signalling.baseToMilitaryUnit(self, 0, pos, util.norm(shift));
    return self.buildUnit(unitType, shift.x, shift.y);
}

churchUtil.neededDefenseProphets = (self) => {
    return Math.floor(self.me.turn / 15);
}

churchUtil.canMaintainBuffer = (self, unitType) => {
    return (self.karbonite - SPECS.UNITS[unitType].CONSTRUCTION_KARBONITE >= self.karbBuffer
        && self.fuel - SPECS.UNITS[unitType].CONSTRUCTION_FUEL >= self.fuelBuffer);
}

churchUtil.initDefensePositions = (self) => {
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
}

churchUtil.initAttackPositions = (self) => {
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
}

churchUtil.getDefensePosIndex = (self) => {
    for (let i = 0; i < self.defenseProgress.length; i++) {
        if (self.defenseProgress[i].type === -1) {
            return i;
        }
    }
}

churchUtil.getClosestDefensePos = (self, enemyPos, unitType) => {
    for (let i = 0; i < self.defensePositions.length; i++) {
        if (self.defenseProgress[i].type === -1 && util.sqDist(self.defensePositions[i], enemyPos) <= SPECS.UNITS[unitType].ATTACK_RADIUS[1]) {
            return i;
        }
    }
}


export default churchUtil;