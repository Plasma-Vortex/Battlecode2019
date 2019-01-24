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
}

castleUtil.updateDone = (self, clusterIndex) => {
    self.clusterProgress[clusterIndex].done = (self.clusterProgress[clusterIndex].karbPilgirms >= self.clusters[clusterIndex].karb.length
        && self.clusterProgress[clusterIndex].fuelPilgirms >= self.clusters[clusterIndex].fuel.length
        && self.clusterProgress[clusterIndex].prophets.length >= castleUtil.neededDefenseProphets(self, clusterIndex));
}

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
            let shift = castleUtil.closestAdjacent(self, destination);

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
            let shift = castleUtil.closestAdjacent(self, destination);

            self.log("Buliding fuel pilgrim at " + util.pairToString(util.addPair(self.loc, shift))
                + " to target fuel at " + util.pairToString(destination));
            signalling.pilgrimInitSignal(self, resourceID, shift);
            return self.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
        }
    }
    self.log("ERROR! Tried to build fuel pilgrim when desired number is already reached")
}

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
}

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
    let shift = castleUtil.closestAdjacent(self, self.clusters[clusterIndex].churchPos);
    signalling.churchPilgrimInitSignal(self, self.clusters[clusterIndex].id, util.norm(shift));
    return self.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
}

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
}

export default castleUtil;