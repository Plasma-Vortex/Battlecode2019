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

        self.unitInfo = [];
        for (let i = 0; i <= 4096; i++) {
            self.unitInfo.push({ type: -1, info: -1 });
        }
        // other init things
        // self.lastCreated = null;
        // self.prioritySignalQueue = new Deque();
        // self.signalQueue = new Deque();
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

        castleUtil.initAvoidMinesMap(self);
        resource.mainInit(self);
        for (let i = 0; i < self.clusters.length; i++) {
            if (self.clusters[i].castle === self.castleNumber + 1) {
                self.myCluster = i;
            }
        }
        castleUtil.initClusterProgress(self);

        // self.castles already exists
        // self.churches = [];
        // self.pilgrims = [];
        // self.crusaders = [];
        // self.prophets = []; // rangers
        // self.preachers = []; // mages/tanks

        self.karbBuffer = 60; // TODO: make it dynamic
        self.fuelBuffer = 300; // TODO: make it dynamic
    }

    castleUtil.updateUnitInfo(self, self.visible); // add updates to clusterProgress

    let visibleEnemies = util.findEnemies(self, self.visible);
    let targetCluster = castleUtil.getTargetCluster(self);

    if (util.hasSpaceAround(self)) {
        if (visibleEnemies.length > 0) { // change to if any cluster is under attack
            self.log("Under attack!");
            visibleEnemies.sort(compareDist);
            if (util.canBuild(self, SPECS.PREACHER)) {
                return self.buildDefenseMage(visibleEnemies[0]);
            }
        }
        else if (targetCluster === self.myCluster) {
            if (self.clusterProgress[self.myCluster].karbPilgrims < self.clusters[self.myCluster].karb.length) {
                // build more karb pilgrims
                if (resource.canMaintainBuffer(self, SPECS.PILGRIM)) {
                    return castleUtil.buildKarbPilgrim(self); // add way to properly choose mine for pilgrim
                }
                else {
                    // build up more resources before expanding, to maintain buffer
                    self.log("Saving for karb pilgrim");
                    signalling.sendSignal(self);
                    return;
                }
            }
            else if (self.clusterProgress[self.myCluster].fuelPilgrims < self.clusters[self.myCluster].fuel.length) {
                if (resource.canMaintainBuffer(self, SPECS.PILGRIM)) {
                    return castleUtil.buildFuelPilgrim(self);
                }
                else {
                    // build up more resources before expanding, to maintain buffer
                    self.log("Saving for fuel pilgrim");
                    signalling.sendSignal(self);
                    return;
                }
            } // neededDefenseProphets should take turn number (and previous enemy attacks?) into account
            else if (self.clusterProgress[self.myCluster].prophets.length < castleUtil.neededDefenseProphets(self)) {
                if (resource.canMaintainBuffer(self, SPECS.PROPHET)) {
                    self.log("Should have built defense prophet");
                    // return castleUtil.buildDefenseProphet(self);
                }
                else {
                    // build up more resources before expanding, to maintain buffer
                    self.log("Saving for defense mage");
                    signalling.sendSignal(self);
                    return;
                }
            }
            else {
                self.log("ERROR! my cluster already has all karb pilgrims, fuel pilgrims, and prophets needed");
                signalling.sendSignal(self);
                return;
            }
        }
        else if (targetCluster !== -1) {
            // cluster mines are fully occupied by pilgrims and has enough defense. Time to expand
            if (self.clusterProgress[targetCluster].church === 0) {
                return castleUtil.buildChurchPilgrim(self, targetCluster);
            }
            else if (self.clusterProgress[targetCluster].church === -1) {
                // save up units for attack
            }
            else {
                self.log("ERROR! target cluster's church status is neither 0 not 1");
            }
        }
        else {
            self.log("Waiting for other castles to finish their cluster or build new churches");
        }
    }
    // self.log("Current number of karb pilgrims: " + self.karbPilgrims.length);
    // self.log("Current number of fuel pilgrims: " + self.fuelPilgrims.length);

    signalling.sendSignal(self);
};


export default castle;
