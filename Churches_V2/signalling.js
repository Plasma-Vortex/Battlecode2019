import { BCAbstractRobot, SPECS } from 'battlecode';
import util from './util.js';
import Deque from './FastQueue.js';

const signalling = {};

// information taken from lastCreated
// only for castle and church
signalling.queueInitSignal = (self, priority = false) => {
    if (self.lastCreated === null) {
        return;
    }
    if (self.lastCreated[0] === SPECS.PILGRIM) {
        let hash = 1 << 15; // meant for newest robot
        let shift = self.lastCreated[1];
        hash |= util.hashShift(shift) << 12; // bits 12-14 specify position relative to castle
        hash |= self.castles.length << 10; // bits 10-11 say how many castles there are, so the new unit knows how long to stay
        hash |= (self.castleNumber + 1) << 8; // bits 8-9 say which castle self is. extra castle positions are listed in increasing order of castle number
        hash |= self.churches.length << 6; // bits 6-7 say how many churches there are. Note that we can't have over 3 churches.
        // specify pilgrim goal
        if (self.lastCreated[2] === "fuel") {
            hash |= 1 << 4;
        }
        hash |= self.lastCreated[3];
        if (priority) {
            self.prioritySignalQueue.push({ signal: hash, dist: util.norm(shift) });
        }
        else {
            self.signalQueue.push({ signal: hash, dist: util.norm(shift) });
        }

        for (let i = 0; i < self.castles.length; i++) {
            if (i === self.castleNumber)
                continue;
            hash = 1 << 15;
            hash |= util.hashShift(shift) << 12;
            hash |= self.castlePos[i].x << 6;
            hash |= self.castlePos[i].y;
            if (priority)
                self.prioritySignalQueue.push({ signal: hash, dist: util.norm(shift) });
            else
                self.signalQueue.push({ signal: hash, dist: util.norm(shift) });
        }
    }
    else if (self.lastCreated[0] === SPECS.PREACHER) {
        self.log("Queueing mage init signal");
        let hash = 1 << 15; // meant for newest robot
        let shift = self.lastCreated[1];
        self.log("Shift: " + util.pairToString(shift));
        self.log("Distance: " + util.norm(shift));
        hash |= util.hashShift(shift) << 12; // bits 12-14 specify position relative to castle
        if (self.lastCreated[2] === "defense") {
            hash |= 1 << 11; // bit 11 specifies whether mage should defend or attack
        }
        hash |= Number(self.lastCreated[3]) << 10; // bit 10 says whether mage should go fast or not
        hash |= (self.lastCreated[4].x + 16) << 5; // specify shifted relative x-coord of enemy
        hash |= self.lastCreated[4].y + 16; // specify shifted relative y-coord of enemy
        if (priority)
            self.prioritySignalQueue.push({ signal: hash, dist: util.norm(shift) });
        else
            self.signalQueue.push({ signal: hash, dist: util.norm(shift) });
    }
}

signalling.sendSignal = (self) => {
    if (self.alreadySignaled) {
        self.log("ERROR! Tried to signal twice in the same turn");
        return;
    }
    if (self.prioritySignalQueue.isEmpty() && self.signalQueue.isEmpty())
        return;

    let message = 0; // will be overwritten
    if (!self.prioritySignalQueue.isEmpty()) {
        if (self.fuel < self.prioritySignalQueue.peekFront().dist) {
            self.log("Not enough fuel to send message of distance " + self.prioritySignalQueue.peek().dist);
            return; // must save up fuel
        }
        message = self.prioritySignalQueue.shift();
    }
    else {
        if (self.fuel < self.signalQueue.peekFront().dist) {
            self.log("Not enough fuel to send message of distance " + self.signalQueue.peekFront().dist);
            return; // must save up fuel
        }
        message = self.signalQueue.shift();
    }
    self.log("Sending signal " + message.signal);
    self.signal(message.signal, message.dist);
    self.alreadySignaled = true;
}

export default signalling;

// done change