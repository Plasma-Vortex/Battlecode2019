import { BCAbstractRobot, SPECS } from 'battlecode';
import util from './util.js';
import Deque from './FastQueue.js';

const signalling = {};

// for castles or churches only
signalling.pilgrimInitSignal = (self, resourceID, shift) => {
    if (self.alreadySignalled) {
        self.log("ERROR! Tried to signal twice in the same turn");
        return;
    }
    self.signal((1 << 15) + resourceID, util.norm(shift));
    self.alreadySignalled = true;
}

// for castles only
signalling.churchPilgrimInitSignal = (self, clusterID, dist) => {
    if (self.alreadySignalled) {
        self.log("ERROR! Tried to signal twice in the same turn");
        return;
    }
    self.signal((1 << 15) + self.allResources.length + clusterID, dist);
    self.alreadySignalled = true;
}

signalling.pilgrimToNewChurch = (self, resourceID, shift) => {
    if (self.alreadySignalled) {
        self.log("ERROR! Tried to signal twice in the same turn");
        return;
    }
    self.log("Sending signal " + ((1 << 14) + resourceID) + " to new church");
    self.signal((1 << 14) + (1<<7) + resourceID, util.norm(shift));
    self.alreadySignalled = true;
}

signalling.churchExists = (self) => {
    self.castleTalk((1 << 7) + self.allResources.length + self.clusters.length + self.myClusterID);
}

// pilgrim to base church
signalling.newPilgrimExists = (self, resourceID, dist) => {
    if (self.alreadySignalled) {
        self.log("ERROR! Tried to signal twice in the same turn");
        return;
    }
    self.log("Signalling " + ((1 << 14) + resourceID) + " to base church");
    self.signal((1 << 14) + (1<<7) + resourceID, dist);
    self.alreadySignalled = true;
}

signalling.baseToDefenseMage = (self, relPos, dist) => {
    if (self.alreadySignalled) {
        self.log("ERROR! Tried to signal twice in the same turn");
        return;
    }
    let hash = 1 << 15;
    hash |= 1 << 11; // bit 11 specifies whether mage should defend or attack
    hash |= (relPos.x + 16) << 5; // specify shifted relative x-coord of enemy
    hash |= relPos.y + 16; // specify shifted relative y-coord of enemy
    self.log("Signalling " + hash + " to new defense mage");
    self.signal(hash, dist);
    self.alreadySignalled = true;
}

signalling.baseToMilitaryUnit = (self, attacker, pos, dist) => {
    if (self.alreadySignalled) {
        self.log("ERROR! Tried to signal twice in the same turn");
        return;
    }
    let relPos = util.subtractPair(pos, self.loc);
    let hash = 1 << 15;
    hash |= attacker << 11; // bit 11 specifies whether unit should defend or attack
    hash |= (relPos.x + 16) << 5; // specify shifted relative x-coord of enemy
    hash |= relPos.y + 16; // specify shifted relative y-coord of enemy
    self.log("Signalling " + hash + " to new defense unit");
    self.signal(hash, dist);
    self.alreadySignalled = true;
}

signalling.militaryUnitExists = (self, attacker, clusterID, unitType) => {
    let message = (attacker << 6) + 3 * clusterID + unitType;
    self.castleTalk(message);
    if (self.baseIsChurch) {
        let dist = 0;
        if (self.me.unit === SPECS.CRUSADER)
            dist = 18;
        else
            dist = 10;
        self.signal((1<<14) + message, dist);
    }
}

export default signalling;

// done change