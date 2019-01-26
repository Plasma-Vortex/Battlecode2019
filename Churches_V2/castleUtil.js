import { BCAbstractRobot, SPECS } from 'battlecode';
import util from './util.js';
import signalling from './signalling.js';

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
                    let clusterIndex = self.clusterIDtoIndex[self.allResources[self.unitInfo[r.id].info].clusterID];
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
                    castleUtil.updateDone(self, clusterIndex);
                }
                else {
                    // church pilgrim
                    let clusterIndex = self.clusterIDtoIndex[self.unitInfo[r.id].info - self.allResources.length];
                    self.clusterProgress[clusterIndex].church = 1;
                }
            }
            else if (message >> 7) { // church
                let clusterID = message - ((1 << 7) + self.allResources.length + self.clusters.length);
                self.unitInfo[r.id].type = SPECS.CHURCH;
                self.unitInfo[r.id].info = clusterID;
                let clusterIndex = self.clusterIDtoIndex[clusterID];
                self.clusterProgress[clusterIndex].church = 2;
                castleUtil.updateDone(self, clusterIndex);
            } // TODO: add comms for new units of other types
            else {
                self.log("ERROR! When adding new unit, unitType is invalid");
                self.log("ID: " + r.id);
            }
        }
    }
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
            prophets: [],
            done: false
        };
        if (self.clusters[i].castle > 0) {
            self.clusterProgress[i].church = 2;
        }
        else if (self.clusters[i].castle < 0) {
            self.clusterProgress[i].church = -1;
        }
    }
}

castleUtil.updateDone = (self, clusterIndex) => {
    // self.log("Updating done");
    // self.log("Cluster index = " + clusterIndex);
    // self.log("" + self.clusterProgress[clusterIndex]);
    self.clusterProgress[clusterIndex].done = (self.clusterProgress[clusterIndex].karbPilgrims >= self.clusters[clusterIndex].karb.length
        && self.clusterProgress[clusterIndex].fuelPilgrims >= self.clusters[clusterIndex].fuel.length
        && self.clusterProgress[clusterIndex].prophets.length >= castleUtil.neededDefenseProphets(self, clusterIndex));
}

// for castles only
// TODO: search for church = 0 first, then church = -1 to avoid attacking
castleUtil.getTargetCluster = (self) => {
    if (!self.clusterProgress[self.myCluster].done)
        return self.myCluster; // first priority is to finish your own cluster
    for (let i = 0; i < self.clusters.length; i++) {
        if (self.clusters[i].castle > 0 && !self.clusterProgress[i].done)
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
            self.clusterProgress[self.myCluster].karb[i] = 0; // 0 means pilgrim exists but id unknown
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
            self.clusterProgress[self.myCluster].fuel[i] = 0; // 0 means pilgrim exists but id unknown
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

castleUtil.buildDefenseMage = (self, enemy) => { // enemy.relPos is relative position to castle
    self.log("Building defense mage to protect against enemy at "
        + util.pairToString(util.addPair(self.loc, enemy.relPos)));
    let shift = util.closestAdjacent(self, util.addPair(self.loc, enemy.relPos));
    if (util.pairEq(shift, { x: -100, y: -100 })) {
        self.log("Nowhere to place new mage");
        return;
    }
    signalling.baseToDefenseMage(self, enemy.relPos, util.norm(shift));
    return self.buildUnit(SPECS.PREACHER, shift.x, shift.y);
}

// for castles and churches
// TODO: take into account distance to enemy castles / middle
castleUtil.neededDefenseProphets = (self, clusterIndex) => {
    // return self.clusters[self.myCluster].mines.length;
    return 0;
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
    return (self.karbonite - SPECS.UNITS[unitType].CONSTRUCTION_KARBONITE >= self.karbBuffer + self.churchesInProgress * SPECS.UNITS[SPECS.CHURCH].CONSTRUCTION_KARBONITE
        && self.fuel - SPECS.UNITS[unitType].CONSTRUCTION_FUEL >= self.fuelBuffer + self.churchesInProgress * SPECS.UNITS[SPECS.CHURCH].CONSTRUCTION_FUEL);
}

castleUtil.initDefensePositions = (self) => {
    self.defensePositions = [];
    let r = Math.ceil(Math.sqrt(SPECS.UNITS[self.me.unit].VISION_RADIUS));
    for (let x = Math.max(0, self.loc.x - r); x <= Math.min(self.map.length - 1, self.loc.x + r); x++) {
        for (let y = Math.max(0, self.loc.y - r); y <= Math.min(self.map.length - 1, self.loc.y + r); y++) {
            let dist = util.sqDist(self.loc, { x: x, y: y });
            if (dist <= SPECS.UNITS[self.me.unit].VISION_RADIUS) {
                if ((x + y) % 2 === (self.loc.x + self.loc.y) % 2 && self.avoidMinesMap[y][x]) {
                    self.defensePositions.push({ x: x, y: y });
                }
            }
        }
    }
    self.defensePositions.sort(util.sortByDistToPoint(self.loc));
}

castleUtil.initAttackPositions = (self) => {
    self.attackPositions = [];
    let r = Math.ceil(Math.sqrt(SPECS.UNITS[self.me.unit].VISION_RADIUS));
    for (let x = Math.max(0, self.loc.x - r); x <= Math.min(self.map.length - 1, self.loc.x + r); x++) {
        for (let y = Math.max(0, self.loc.y - r); y <= Math.min(self.map.length - 1, self.loc.y + r); y++) {
            let dist = util.sqDist(self.loc, { x: x, y: y });
            if (dist <= SPECS.UNITS[self.me.unit].VISION_RADIUS) {
                if ((x + y) % 2 !== (self.loc.x + self.loc.y) % 2 && self.avoidMinesMap[y][x]) {
                    self.attackPositions.push({ x: x, y: y });
                }
            }
        }
    }
    self.attackPositions.sort(util.sortByDistToPoint(self.loc));
}


export default castleUtil;