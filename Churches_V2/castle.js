import { BCAbstractRobot, SPECS } from 'battlecode';
import util from './util.js';
import castleUtil from './castleUtil.js';
import resource from './resource.js';
import signalling from './signalling.js';
import Deque from './FastQueue.js';

const castle = {};

castle.takeTurn = (self) => {
    self.loc = { x: self.me.x, y: self.me.y }; // change to let loc
    self.log("Castle Position: " + util.pairToString(self.loc));

    if (self.me.turn === 1) {
        self.castles = [];
        self.castlePos = [];
        self.churchPos = [];
        for (let i = 0; i < self.visible.length; i++) {
            let r = self.visible[i];
            if (r.team === self.me.team) { // cannot check r.unit === SPECS.CASTLE because r.unit is undefined when r is not visible
                self.castles.push(-1);
                self.castlePos.push({ x: -1, y: -1 });
            }
        }
        self.castleNumber = 0;
        for (let i = 0; i < self.visible.length; i++) {
            let r = self.visible[i];
            if (r.team === self.me.team && r.id !== self.me.id) {
                if ((r.castle_talk >> 6) !== 0) {
                    let rCastleNumber = (r.castle_talk >> 6) - 1;
                    self.castles[rCastleNumber] = r.id;
                    self.castlePos[rCastleNumber].x = r.castle_talk & ((1 << 6) - 1);
                    self.castleNumber++;
                }
            }
        }
        self.castles[self.castleNumber] = self.me.id;
        self.castlePos[self.castleNumber] = { x: self.me.x, y: self.me.y };
        self.castleTalk(((self.castleNumber + 1) << 6) + self.me.x);

        // other init things
        self.lastCreated = null;
        self.prioritySignalQueue = new Deque();
        self.signalQueue = new Deque();
        return;
    }
    else if (self.me.turn === 2) {
        for (let i = 0; i < self.visible.length; i++) {
            let r = self.visible[i];
            if (r.team === self.me.team && r.id !== self.me.id) {
                if ((r.castle_talk >> 6) !== 0) {
                    let rCastleNumber = (r.castle_talk >> 6) - 1;
                    if (rCastleNumber < self.castleNumber) { // r's second signal is y coordinate
                        self.castlePos[rCastleNumber].y = r.castle_talk & ((1 << 6) - 1);
                    }
                    else { // r's first signal is x coordinate
                        self.castles[rCastleNumber] = r.id;
                        self.castlePos[rCastleNumber].x = r.castle_talk & ((1 << 6) - 1);
                    }
                }
            }
        }
        self.castleTalk(((self.castleNumber + 1) << 6) + self.me.y);
        return;
    }
    else if (self.me.turn === 3) {
        for (let i = 0; i < self.visible.length; i++) {
            let r = self.visible[i];
            if (r.team === self.me.team && r.id !== self.me.id) {
                if ((r.castle_talk >> 6) !== 0) {
                    let rCastleNumber = (r.castle_talk >> 6) - 1;
                    if (rCastleNumber > self.castleNumber) { // r's second signal is y coordinate
                        // self.log("Castle " + rCastleNumber + " sent castleTalk message " + r.castle_talk & ((1 << 6) - 1));
                        self.castlePos[rCastleNumber].y = r.castle_talk & ((1 << 6) - 1);
                    }
                }
            }
        }

        self.log("I am castle number #" + self.castleNumber);
        // self.log("Castles IDs:");
        // self.log(self.castles);
        // self.log("is ID 438 new? " + self.isNewID(438));
        // self.log("Found castle positions");
        // self.log(self.castlePos);

        util.findSymmetry(self);
        self.enemyCastlePos = [];
        for (let i = 0; i < self.castles.length; i++) {
            self.enemyCastlePos.push(util.reflect(self, self.castlePos[i]));
        }

        self.maxKarbPilgrims = 16;
        self.maxFuelPilgrims = 16;

        self.assignedArea = resource.assignAreaToCastles(self);
        resource.initResourceList(self);

        // self.log("Target karb:");
        // for (let i = 0; i<self.targetKarb.length; i++){
        //     self.log(JSON.stringify(self.targetKarb[i]));
        // }
        // self.log("Target fuel:");
        // for (let i = 0; i<self.targetFuel.length; i++){
        //     self.log(JSON.stringify(self.targetFuel[i]));
        // }

        self.churches = [];
        self.karbPilgrims = [];
        self.fuelPilgrims = [];
        self.crusaders = [];
        self.prophets = []; // rangers
        self.preachers = []; // mages/tanks

        self.desiredKarbPilgrims = Math.min(4, self.targetKarb.length);
        self.desiredFuelPilgrims = Math.min(4, self.targetFuel.length);
        self.karbBuffer = 60; // TODO: make it dynamic
        self.fuelBuffer = 300; // TODO: make it dynamic
    }

    castleUtil.updateAllUnitLists(self, self.visible);

    let karbGoal = resource.karbGoalStatus(self, self.desiredKarbPilgrims);
    let fuelGoal = resource.fuelGoalStatus(self, self.desiredFuelPilgrims);
    let visibleEnemies = util.findEnemies(self, self.visible);
    // self.log("Karb goal: " + JSON.stringify(karbGoal));
    // self.log("Fuel goal: " + JSON.stringify(fuelGoal));

    self.log(visibleEnemies);

    if (util.hasSpaceAround(self)) {
        if (visibleEnemies.length > 0) {
            self.log("Under attack!");
            visibleEnemies.sort(compareDist);
            if (util.canBuild(self, SPECS.PREACHER)) {
                return self.buildDefenseMage(visibleEnemies[0]);
            }
        }
        else if (!karbGoal.reached) {
            if (karbGoal.canHelp && resource.canMaintainBuffer(self, SPECS.PILGRIM)) {
                return castleUtil.buildKarbPilgrim(self);
            }
            else {
                // wait for other castle to do it, if !canHelp
                // or if it's my job, prioritize safety buffer
                signalling.sendSignal(self);
                return;
            }
        }
        else if (!fuelGoal.reached) {
            if (fuelGoal.canHelp && resource.canMaintainBuffer(self, SPECS.PILGRIM)) {
                return castleUtil.buildFuelPilgrim(self);
            }
            else {
                // wait for other castle to do it, if !canHelp
                // or if it's my job, prioritize safety buffer
                signalling.sendSignal(self);
                return;
            }
        }
        // else if (self.canMaintainBuffer(SPECS.CRUSADER)) {
        //     self.log("Building crusader");
        //     self.sendSignal();
        //     return self.buildAround(SPECS.CRUSADER);
        // }
        else {
            self.lastCreated = null;
        }
    }
    // self.log("Current number of karb pilgrims: " + self.karbPilgrims.length);
    // self.log("Current number of fuel pilgrims: " + self.fuelPilgrims.length);

    signalling.sendSignal(self);
};


export default castle;
