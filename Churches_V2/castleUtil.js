import { BCAbstractRobot, SPECS } from 'battlecode';
import util from './util.js';
import signalling from './signalling.js';

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
                    self.unitInfo[r.id].clusterID = self.allResources[self.unitInfo[r.id].info].clusterID
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
}

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
}

castleUtil.updateChurchesInProgress = (self) => {
    self.churchesInProgress = 0;
    for (let i = 0; i < self.clusterProgress.length; i++) {
        if (self.clusterProgress[i].church === 1)
            self.churchesInProgress++;
    }
}




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
}

castleUtil.isDone = (self, clusterIndex) => {
    return (self.clusterProgress[clusterIndex].karbPilgrims >= self.clusters[clusterIndex].karb.length
        && self.clusterProgress[clusterIndex].fuelPilgrims >= self.clusters[clusterIndex].fuel.length
        && self.clusterProgress[clusterIndex].prophets.length >= castleUtil.neededDefenseProphets(self, clusterIndex));
}

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
}

// for castles and churches only
// always for current cluster
// TODO: fix case when pilgrim killed while id unknown (0). Do this in update by checking new visible units
castleUtil.buildKarbPilgrim = (self) => {
    for (let i = 0; i < self.clusterProgress[self.myCluster].karb.length; i++) {
        if (self.clusterProgress[self.myCluster].karb[i] === -1) {
            // found first needed karb pilgrim
            // self.clusterProgress[self.myCluster].karb[i] = 0; // 0 means pilgrim exists but id unknown
            let resourceID = self.clusters[self.myCluster].karb[i];
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

// for castles and churches only
// always for current cluster
// TODO: fix case when pilgrim killed while id unknown (0). Do this in update by checking new visible units
castleUtil.buildFuelPilgrim = (self) => {
    for (let i = 0; i < self.clusterProgress[self.myCluster].fuel.length; i++) {
        if (self.clusterProgress[self.myCluster].fuel[i] === -1) {
            // found first needed fuel pilgrim
            // self.clusterProgress[self.myCluster].fuel[i] = 0; // 0 means pilgrim exists but id unknown
            let resourceID = self.clusters[self.myCluster].fuel[i];
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
}

// for castles and churches
// TODO: take into account distance to enemy castles / middle
castleUtil.neededDefenseProphets = (self, clusterIndex) => {
    // return self.clusters[self.myCluster].mines.length;
    for (let i = 0; i<self.clusterProgress.length; i++) {
        if (self.clusterProgress.church === 0){
            return Math.floor(self.me.turn / 50);
        }
    }
    if (self.me.turn > 800)
        return 1000000;
    return Math.floor(self.me.turn / 20);
}

castleUtil.buildChurchPilgrim = (self, clusterIndex) => {
    // assign pilgrim to closest karb
    // let assignedMine = self.clusters[clusterIndex].karb[0]; // if pilgrims can already calculate, why signal to them?
    let shift = util.closestAdjacent(self, self.clusters[clusterIndex].churchPos);
    self.log("Building church pilgrim at " + util.pairToString(util.addPair(self.loc, shift))
        + " for cluster " + clusterIndex);
    self.log("Church is supposed to be built at " + util.pairToString(self.clusters[clusterIndex].churchPos));
    signalling.churchPilgrimInitSignal(self, self.clusters[clusterIndex].id, util.norm(shift));
    return self.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
}

castleUtil.canMaintainBuffer = (self, unitType) => {
    return (self.karbonite - SPECS.UNITS[unitType].CONSTRUCTION_KARBONITE >= castleUtil.getKarbBuffer(self)
        && self.fuel - SPECS.UNITS[unitType].CONSTRUCTION_FUEL >= castleUtil.getFuelBuffer(self));
}

castleUtil.initDefensePositions = (self) => {
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
}

castleUtil.getDefensePosIndex = (self) => {
    for (let i = 0; i < self.defenseProgress.length; i++) {
        if (self.defenseProgress[i].type === -1) {
            return i;
        }
    }
}

castleUtil.getClosestDefensePos = (self, enemyPos, unitType) => {
    for (let i = 0; i < self.defensePositions.length; i++) {
        if (self.defenseProgress[i].type === -1 && util.sqDist(self.defensePositions[i], enemyPos) <= SPECS.UNITS[unitType].ATTACK_RADIUS[1]) {
            return i;
        }
    }
}

castleUtil.getFuelBuffer = (self) => {
    let totalProphets = 0
    for (let i = 0; i < self.clusterProgress.length; i++) {
        totalProphets += self.clusterProgress[i].prophets.length;
    }
    let fuelBuffer = 200;
    fuelBuffer += totalProphets * SPECS.UNITS[SPECS.PROPHET].ATTACK_FUEL_COST * 2; // 2 attacks per prophet
    fuelBuffer += self.churchesInProgress * SPECS.UNITS[SPECS.CHURCH].CONSTRUCTION_FUEL;
    return fuelBuffer;
}

castleUtil.getKarbBuffer = (self) => {
    let numChurches = 0;
    for (let i = 0; i<self.clusterProgress.length; i++) {
        if (self.clusterProgress[i].church == 2){
            numChurches++;
        }
    }
    numChurches -= self.castles.length;
    let karbBuffer = 30;
    karbBuffer += numChurches * 50; // 2 prophets per church
    karbBuffer += self.churchesInProgress * SPECS.UNITS[SPECS.CHURCH].CONSTRUCTION_KARBONITE;
    return karbBuffer;
}

export default castleUtil;