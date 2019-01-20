import { BCAbstractRobot, SPECS } from 'battlecode';
import util from './util.js';
import signalling from './signalling.js';

const castleUtil = {};

// for castles only
// for addNewUnits
castleUtil.knownID = (self, id) => {
    return (self.castles.includes(id) || self.churches.includes(id)
        || self.karbPilgrims.includes(id) || self.fuelPilgrims.includes(id)
        || self.crusaders.includes(id) || self.prophets.includes(id) || self.preachers.includes(id));
}

// for castles only
castleUtil.addNewUnits = (self, visible) => {
    for (let i = 0; i < visible.length; i++) {
        let r = visible[i];
        if (r.team === self.me.team && (r.castle_talk >> 7)) {
            if (castleUtil.knownID(self, r.id))
                continue;
            // newly created robot
            self.log("Notified of a new robot!");
            let message = r.castle_talk;
            let unitType = ((message >> 5) & ((1 << 2) - 1)) + 2;
            if (unitType === SPECS.PILGRIM) {
                if ((message >> 4) & 1) { // fuel pilgrim
                    self.log("It's a fuel pilgrim with id " + r.id);
                    self.fuelPilgrims.push(r.id);
                    let fuelID = message & ((1 << 4) - 1);
                    self.log("It targets fuel #" + fuelID);
                    self.targetFuel[fuelID].assignedWorker = r.id;
                }
                else {
                    self.log("It's a karb pilgrim with id " + r.id);
                    self.karbPilgrims.push(r.id);
                    let karbID = message & ((1 << 4) - 1);
                    self.log("It targets karb #" + karbID);
                    self.targetKarb[karbID].assignedWorker = r.id;
                }
            }
            else if (unitType === SPECS.CRUSADER) {
                self.crusaders.push(r.id);
            }
            else if (unitType === SPECS.PROPHET) {
                self.prophets.push(r.id);
            }
            else if (unitType === SPECS.PREACHER) {
                self.preachers.push(r.id);
            }
            else {
                self.log("ERROR! When adding new unit, unitType is invalid");
            }
        }
    }
}

castleUtil.updateUnitList = (unitList, visible) => {
    unitList = unitList.filter((id) => {
        for (let i = 0; i < visible.length; i++) {
            if (id === visible[i].id)
                return true;
        }
        return false;
    });
}

castleUtil.updateAllUnitLists = (self, visible) => {
    // check deaths
    let updatedKarbPilgrims = [];
    for (let i = 0; i < self.targetKarb.length; i++) {
        let id = self.targetKarb[i].assignedWorker;
        if (id > 0) {
            let stillAlive = false;
            for (let j = 0; j < visible.length; j++) {
                if (id === visible[j].id) {
                    stillAlive = true;
                }
            }
            if (stillAlive) {
                updatedKarbPilgrims.push(id);
            }
            else {
                self.targetKarb[i].assignedWorker = -1;
            }
        }
    }
    self.karbPilgrims = updatedKarbPilgrims;

    let updatedFuelPilgrims = [];
    for (let i = 0; i < self.targetFuel.length; i++) {
        let id = self.targetFuel[i].assignedWorker;
        if (id > 0) {
            let stillAlive = false;
            for (let j = 0; j < visible.length; j++) {
                if (id === visible[j].id) {
                    stillAlive = true;
                }
            }
            if (stillAlive) {
                updatedFuelPilgrims.push(id);
            }
            else {
                self.targetFuel[i].assignedWorker = -1;
            }
        }
    }
    self.FuelPilgrims = updatedFuelPilgrims;

    castleUtil.updateUnitList(self.churches, visible);
    castleUtil.updateUnitList(self.crusaders, visible);
    castleUtil.updateUnitList(self.prophets, visible);
    castleUtil.updateUnitList(self.preachers, visible);

    // check new units
    castleUtil.addNewUnits(self, visible);

    // add new way of finding newly build churches via pilgrim castleTalk
}

// TODO: if new unit gets killed when assignedWorker = 0, need to replace 
castleUtil.buildKarbPilgrim = (self) => {
    // is min necessary when desired is always at most targetKarb.length?
    for (let i = 0; i < Math.min(self.targetKarb.length, self.desiredKarbPilgrims); i++) {
        if (self.targetKarb[i].assignedCastle === self.castleNumber
            && self.targetKarb[i].assignedWorker === -1) {
            // found first needed karb pilgrim
            self.targetKarb[i].assignedWorker = 0; // 0 means pilgrim exists but id unknown

            // make clone instead of reference
            let destination = util.copyPair(self.targetKarb[i].pos);

            // choose best starting placement around castle
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

            self.log("Buliding Karb Pilgrim at " + util.pairToString(util.addPair(self.loc, bestShift))
                + " to target karb #" + i + " at " + util.pairToString(destination));

            self.lastCreated = [SPECS.PILGRIM, bestShift, "karb", i];
            signalling.queueInitSignal(self);
            signalling.sendSignal(self);
            return self.buildUnit(SPECS.PILGRIM, bestShift.x, bestShift.y);
        }
    }
    self.log("ERROR! Tried to build karb pilgrim when desired number is already reached")
}

// copy karb shift
// TODO: if new unit gets killed when assignedWorker = 0, need to replace 
castleUtil.buildFuelPilgrim = (self) => {
    // is min necessary when desired is always at most targetFuel.length?
    for (let i = 0; i < Math.min(self.targetFuel.length, self.desiredFuelPilgrims); i++) {
        if (self.targetFuel[i].assignedCastle === self.castleNumber
            && self.targetFuel[i].assignedWorker === -1) {
            // found first needed fuel pilgrim
            self.targetFuel[i].assignedWorker = 0; // 0 means pilgrim exists but id unknown

            // make clone instead of reference
            let destination = util.copyPair(self.targetFuel[i].pos);

            // choose best starting placement around castle
            let minDist = 1000000;
            let bestPos = { x: -1, y: -1 };
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    let pos = { x: self.loc.x + dx, y: self.loc.y + dy };
                    // self.log("Starting placement in consideration: " + pairToString(pos));
                    if (util.empty(pos, self.map, self.robotMap)) {
                        if (util.sqDist(pos, destination) < minDist) {
                            minDist = util.sqDist(pos, destination);
                            bestPos = pos;
                        }
                        else {
                            // self.log("Failed because " + pairToString(pos) + " is farther than the min distance of " + minDist);
                        }
                    }
                    else {
                        // self.log("Failed because " + pairToString(pos) + " is occupied");
                    }
                }
            }

            self.log("Buliding Fuel Pilgrim at " + util.pairToString(bestPos)
                + " to target fuel #" + i + " at " + util.pairToString(destination));
            let shift = util.subtractPair(bestPos, self.loc);
            self.lastCreated = [SPECS.PILGRIM, shift, "fuel", i];
            signalling.queueInitSignal(self);
            signalling.sendSignal(self);
            return self.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
        }
    }
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


export default castleUtil;