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
            if (message < self.allResources.length) { // resource pilgrim
                self.unitInfo[r.id].type = SPECS.PILGRIM;
                self.unitInfo[r.id].info = message; // resource ID
                let clusterID = self.allResources[self.unitInfo[r.id].info].clusterID;
                for (let j = 0; j < self.clusters[clusterID].karb.length; j++) {
                    if (self.clusters[clusterID].karb[j] === self.unitInfo[r.id].info) { // karb pilgrim
                        self.myClusterProgress.karb[j] = r.id;
                        self.myClusterProgress.karbPilgrims++;
                    }
                }
                for (let j = 0; j < self.clusters[clusterID].fuel.length; j++) {
                    if (self.clusters[clusterID].fuel[j] === self.unitInfo[r.id].info) { // fuel pilgrim
                        self.myClusterProgress.fuel[j] = r.id;
                        self.myClusterProgress.fuelPilgrims++;
                    }
                }
            } // TODO: add comms for new units of other types
            else {
                self.log("ERROR! When adding new unit, unitType is invalid");
                self.log("ID: " + r.id);
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
        // TODO: add for other unit types
        self.unitInfo[id] = { type: -1, info: -1 };
    }

    // check new units
    churchUtil.addNewUnits(self);
}

// TODO: fix case when pilgrim killed while id unknown (0). Do this in update by checking new visible units
churchUtil.buildKarbPilgrim = (self) => {
    for (let i = 0; i < self.myClusterProgress.karb.length; i++) {
        if (self.myClusterProgress.karb[i] === -1) {
            // found first needed karb pilgrim
            self.myClusterProgress.karb[i] = 0; // 0 means pilgrim exists but id unknown
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
            self.myClusterProgress.fuel[i] = 0; // 0 means pilgrim exists but id unknown
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

churchUtil.buildDefenseMage = (self, enemy) => { // enemy.relPos is relative position to castle
    // self.log("In build defense mage: There is an enemy unit at " + util.pairToString(util.addPair(self.loc, enemy.relPos)));
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

churchUtil.neededDefenseProphets = (self) => {
    return 0;
}

churchUtil.canMaintainBuffer = (self, unitType) => {
    return (self.karbonite - SPECS.UNITS[unitType].CONSTRUCTION_KARBONITE >= self.karbBuffer
        && self.fuel - SPECS.UNITS[unitType].CONSTRUCTION_FUEL >= self.fuelBuffer);
}

export default churchUtil;