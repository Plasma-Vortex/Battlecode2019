import { BCAbstractRobot, SPECS } from 'battlecode';
import util from './util.js';
import castleUtil from './castleUtil.js';
import resource from './resource.js';
import signalling from './signalling.js';

const castle = {};

castle.takeTurn = (self) => {
    self.loc = { x: self.me.x, y: self.me.y }; // change to let loc
    self.log("Castle Position: " + util.pairToString(self.loc));
    self.log("Team karb: " + self.karbonite + ", team fuel: " + self.fuel);

    if (self.me.turn === 1) {
        self.unitInfo = new Array(4097);
        for (let i = 0; i <= 4096; i++) {
            self.unitInfo[i] = { type: -1, info: -1, clusterID: -1 };
        }

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
                    self.unitInfo[r.id].type = SPECS.CASTLE;
                    self.unitInfo[r.id].info = rCastleNumber;
                }
            }
        }
        self.castles[self.castleNumber] = self.me.id;
        self.castlePos[self.castleNumber] = { x: self.me.x, y: self.me.y };
        self.castleTalk(((self.castleNumber + 1) << 6) + self.me.x);
        self.unitInfo[self.me.id].type = SPECS.CASTLE;
        self.unitInfo[self.me.id].info = self.castleNumber;

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
                        self.unitInfo[r.id].type = SPECS.CASTLE;
                        self.unitInfo[r.id].info = rCastleNumber;
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

        util.initMaps(self);
        resource.mainInit(self);
        for (let i = 0; i < self.clusters.length; i++) {
            if (self.clusters[i].castle === self.castleNumber + 1) {
                self.myCluster = i;
            }
        }
        castleUtil.initClusterProgress(self);
        castleUtil.initDefensePositions(self);
        castleUtil.initAttackPositions(self);
        self.log("Defense positions:");
        self.log(self.defensePositions);
        

        // self.castles already exists
        // self.churches = [];
        // self.pilgrims = [];
        // self.crusaders = [];
        // self.prophets = []; // rangers
        // self.preachers = []; // mages/tanks
    }

    castleUtil.updateUnitInfo(self, self.visible); // TODO: add updates to clusterProgress
    castleUtil.updateChurchesInProgress(self);

    let visibleEnemies = util.findEnemies(self, self.visible);
    let targetCluster = castleUtil.getTargetCluster(self);

    self.log("Cluster Progress:");
    for (let i = 0; i < self.clusters.length; i++)
        self.log(self.clusterProgress[i]);
    self.log("Target Cluster: " + targetCluster);

    if (util.hasSpaceAround(self)) {
        if (visibleEnemies.length > 0) { // change to if any cluster is under attack
            self.log("Under attack!");
            if (util.canBuild(self, SPECS.PROPHET)) {
                let defensePosIndex = castleUtil.getClosestDefensePos(self, visibleEnemies[0].pos, SPECS.PROPHET);
                self.lastDefensePosIndex = defensePosIndex;
                return castleUtil.buildDefenseUnit(self, SPECS.PROPHET, self.defensePositions[defensePosIndex]);
            }
            else if (util.canAttack(self, visibleEnemies[0].pos)) {
                self.attack(visibleEnemies[0].pos.x - self.loc.x, visibleEnemies[0].pos.y - self.pos.y);
            }
        }
        else if (targetCluster === self.myCluster) {
            if (self.clusterProgress[self.myCluster].karbPilgrims < self.clusters[self.myCluster].karb.length) {
                // build more karb pilgrims
                if (castleUtil.canMaintainBuffer(self, SPECS.PILGRIM)) {
                    return castleUtil.buildKarbPilgrim(self); // add way to properly choose mine for pilgrim
                }
                else {
                    // build up more resources before expanding, to maintain buffer
                    self.log("Saving for karb pilgrim");
                    return;
                }
            }
            else if (self.clusterProgress[self.myCluster].fuelPilgrims < self.clusters[self.myCluster].fuel.length) {
                if (castleUtil.canMaintainBuffer(self, SPECS.PILGRIM)) {
                    return castleUtil.buildFuelPilgrim(self);
                }
                else {
                    // build up more resources before expanding, to maintain buffer
                    self.log("Saving for fuel pilgrim");
                    return;
                }
            } // neededDefenseProphets should take turn number (and previous enemy attacks?) into account
            else if (self.clusterProgress[self.myCluster].prophets.length < castleUtil.neededDefenseProphets(self)) {
                if (castleUtil.canMaintainBuffer(self, SPECS.PROPHET)) {
                    self.log("Building defense prophet");
                    let defensePosIndex = castleUtil.getDefensePosIndex(self);
                    self.log("index = "+defensePosIndex);
                    self.log(self.defensePositions[defensePosIndex]);
                    self.lastDefensePosIndex = defensePosIndex;
                    return castleUtil.buildDefenseUnit(self, SPECS.PROPHET, self.defensePositions[defensePosIndex]);
                }
                else {
                    // build up more resources before expanding, to maintain buffer
                    self.log("Saving for defense prophet");
                    return;
                }
            }
            else {
                self.log("ERROR! my cluster already has all karb pilgrims, fuel pilgrims, and prophets needed");
                return;
            }
        }
        else if (targetCluster !== -1) {
            // cluster mines are fully occupied by pilgrims and has enough defense. Time to expand
            if (self.clusterProgress[targetCluster].church === 0) {
                if (castleUtil.canMaintainBuffer(self, SPECS.CHURCH)) {
                    return castleUtil.buildChurchPilgrim(self, targetCluster);
                }
                else {
                    self.log("Saving for a church at cluster " + targetCluster);
                }
            }
            else if (self.clusterProgress[targetCluster].church === -1) {
                self.log("Saving up for attack on cluster " + targetCluster);
                // save up units for attack
            }
            else {
                self.log("ERROR! target cluster's church status is neither 0 not 1");
            }
        }
        else {
            self.log("Waiting for other castles to finish their cluster or build new churches");
            if (visibleEnemies.length > 0) {
                if (util.canAttack(self, util.addPair(self.loc, visibleEnemies[0].relPos))) {
                    self.attack(visibleEnemies[0].relPos.x, visibleEnemies[0].relPos.y);
                }
            }
        }
    }
};


export default castle;
