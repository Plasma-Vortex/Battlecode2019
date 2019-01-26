import { BCAbstractRobot, SPECS } from 'battlecode';
import util from './util.js';
import churchUtil from './churchUtil.js';
import resource from './resource.js';
import signalling from './signalling.js';

const church = {};

church.takeTurn = (self) => {
    self.loc = { x: self.me.x, y: self.me.y };
    self.log("Church Position: " + util.pairToString(self.loc));
    self.log("Team karb: " + self.karbonite + ", team fuel: " + self.fuel);

    if (self.me.turn === 1) {
        self.unitInfo = new Array(4097);
        for (let i = 0; i <= 4096; i++) {
            self.unitInfo[i] = { type: -1, info: -1 };
        }
        util.findSymmetry(self);
        util.initAvoidMinesMap(self);
        resource.mainInit(self);
        churchUtil.findMyClusterID(self);
        signalling.churchExists(self);
        churchUtil.initMyClusterProgress(self);

        self.karbBuffer = 30; // TODO: make it dynamic
        self.fuelBuffer = 200; // TODO: make it dynamic
    }

    churchUtil.updateUnitInfo(self, self.visible);

    let visibleEnemies = util.findEnemies(self, self.visible);
    visibleEnemies.sort(util.compareDist);

    if (util.hasSpaceAround(self)) {
        if (visibleEnemies.length > 0) { // change to if any cluster is under attack
            self.log("Under attack!");
            // self.log("There is an enemy unit at " + util.pairToString(util.addPair(self.loc, visibleEnemies[0].relPos)));
            if (util.canBuild(self, SPECS.PREACHER)) {
                return churchUtil.buildDefenseMage(self, visibleEnemies[0]);
            }
        }
        else {
            if (self.myClusterProgress.karbPilgrims < self.clusters[self.myClusterID].karb.length) {
                // build more karb pilgrims
                if (churchUtil.canMaintainBuffer(self, SPECS.PILGRIM)) {
                    return churchUtil.buildKarbPilgrim(self); // add way to properly choose mine for pilgrim
                }
                else {
                    // build up more resources before expanding, to maintain buffer
                    self.log("Saving for karb pilgrim");
                    return;
                }
            }
            else if (self.myClusterProgress.fuelPilgrims < self.clusters[self.myClusterID].fuel.length) {
                if (churchUtil.canMaintainBuffer(self, SPECS.PILGRIM)) {
                    return churchUtil.buildFuelPilgrim(self);
                }
                else {
                    // build up more resources before expanding, to maintain buffer
                    self.log("Saving for fuel pilgrim");
                    return;
                }
            } // neededDefenseProphets should take turn number (and previous enemy attacks?) into account
            else if (self.myClusterProgress.prophets.length < churchUtil.neededDefenseProphets(self)) {
                if (churchUtil.canMaintainBuffer(self, SPECS.PROPHET)) {
                    self.log("Should have built defense prophet");
                    // return churchUtil.buildDefenseProphet(self);
                }
                else {
                    // build up more resources before expanding, to maintain buffer
                    self.log("Saving for defense mage");
                    return;
                }
            }
            else {
                self.log("Church finished making all pilgrims and prophets for cluster!");
                return;
            }
        }
    }
}

export default church;
