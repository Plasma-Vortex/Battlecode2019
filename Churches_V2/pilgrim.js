import { BCAbstractRobot, SPECS } from 'battlecode';
import nav from './nav.js';
import util from './util.js';
import pilgrimUtil from './pilgrimUtil.js';

const pilgrim = {};

pilgrim.takeTurn = (self) => {
    self.loc = { x: self.me.x, y: self.me.y };
    self.log("Pilgrim Position: " + util.pairToString(self.loc));
    self.log("I have " + self.me.karbonite + " karb and " + self.me.fuel + " fuel");

    if (self.me.turn === 1) {
        self.receivedFirstMessage = false;
        self.state = "waiting for init messages";
    }

    if (self.state === "waiting for init messages") {
        self.log("Pilgrim state: " + self.state);
        let receivedMessage = false;
        for (let i = 0; i < self.visible.length; i++) {
            let r = self.visible[i];
            if (r.team === self.me.team && r.unit === SPECS.CASTLE && self.isRadioing(r)) {
                let hash = r.signal;
                if (hash >> 15) {
                    let shiftHash = (hash >> 12) & ((1 << 3) - 1);
                    let shift = util.unhashShift(shiftHash);
                    if (util.pairEq(util.subtractPair(self.loc, { x: r.x, y: r.y }), shift)) {
                        // signal is meant for me!
                        self.log("I got a message!");
                        receivedMessage = true;
                        if (!self.receivedFirstMessage) {
                            self.log("self is my first message");
                            self.receivedFirstMessage = true;

                            self.castles = new Array((hash >> 10) & ((1 << 2) - 1));
                            self.castlePos = new Array(self.castles.length);
                            self.baseCastleNumber = ((hash >> 8) & ((1 << 2) - 1)) - 1;
                            self.castles[self.baseCastleNumber] = r.id;
                            self.castlePos[self.baseCastleNumber] = { x: r.x, y: r.y };

                            self.log("Known castle locations:");
                            self.log(self.castlePos);

                            self.base = { x: r.x, y: r.y };
                            self.churches = new Array((hash >> 6) & ((1 << 2) - 1)); // TODO: don't send church info
                            if (hash & (1 << 4))
                                self.targetResource = "fuel";
                            else
                                self.targetResource = "karb";
                            self.targetID = hash & ((1 << 4) - 1);

                            // let other castles know that you're a newly created robot
                            // 7th bit shows that you're new, 5-6 shows your type, 0-4 shows your job
                            self.castleTalk((1 << 7) | ((self.me.unit - 2) << 5) | (hash & ((1 << 5) - 1)));

                            if (self.castles.length === 1) {
                                pilgrimUtil.pilgrimInit(self);
                                self.state = "going to mine"; // can start moving on the same turn
                            }
                            else {
                                self.log("Must wait for more init messages");
                                return pilgrimUtil.pilgrimDontDoNothing(self);
                            }
                        }
                        else {
                            for (let j = 0; j < self.castles.length; j++) {
                                if (self.castles[j] === undefined) {
                                    self.castles[j] = r.id;
                                    self.castlePos[j] = { x: (r.signal >> 6) & ((1 << 6) - 1), y: r.signal & ((1 << 6) - 1) };
                                    break;
                                }
                            }
                            self.log("Known castle locations:");
                            self.log(self.castlePos);

                            for (let j = 0; j < self.castles.length; j++) {
                                if (self.castles[j] === undefined) {
                                    self.log("Must wait for more init messages");
                                    return pilgrimUtil.pilgrimDontDoNothing(self);
                                }
                            }
                            pilgrimUtil.pilgrimInit(self);
                            self.state = "going to mine"; // can start moving on the same turn
                        }
                    }
                }
            }
        }
        if (!receivedMessage) {
            self.log("No message received, state is still " + self.state);
            return pilgrimUtil.pilgrimDontDoNothing(self);
        }
    }

    if (self.state === "going to mine") {
        self.log("Pilgrim state: " + self.state);
        if (util.pairEq(self.loc, self.targetMine)) {
            self.state = "mining"; // can start mining on the same turn
            self.log("Already arrived at mine, state changed to " + self.state);
        }
        else {
            // let chosenMove = move(self.loc, self.bfsFromMine, self.map, self.getVisibleRobotMap(), SPECS.UNITS[self.me.unit].SPEED);
            let chosenMove = nav.move(self.loc, self.avoidMinesResourceBFS, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
            self.log("Move: " + util.pairToString(chosenMove));
            if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                // chosenMove = move(self.loc, self.bfsFromMine, self.map, self.getVisibleRobotMap(), SPECS.UNITS[self.me.unit].SPEED);
                self.log("New move: " + util.pairToString(chosenMove));
                if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                    // self.lastMoveNothing = true; // stuck
                    // TODO: signal when stuck
                    return pilgrimUtil.pilgrimDontDoNothing(self);
                }
            }
            // self.lastMoveNothing = false;
            // TODO: make pilgrims follow fuel buffer
            if (util.pairEq(util.addPair(self.loc, chosenMove), self.targetMine)
                && util.enoughFuelToMove(self, chosenMove))
                self.state = "mining";
            return self.move(chosenMove.x, chosenMove.y);
        }
    }

    if (self.state === "mining") {
        self.log("Pilgrim state: " + self.state);
        if (self.fuel >= SPECS.MINE_FUEL_COST) {
            // self.lastMoveNothing = false;
            if (self.targetResource === "karb") {
                if (self.me.karbonite + SPECS.KARBONITE_YIELD >= SPECS.UNITS[self.me.unit].KARBONITE_CAPACITY) {
                    self.log("Storage will be full next round, swiching state to go to base");
                    self.state = "going to base";
                }
            }
            else {
                self.log("Mining my target fuel");
                if (self.me.fuel + SPECS.FUEL_YIELD >= SPECS.UNITS[self.me.unit].FUEL_CAPACITY) {
                    self.log("Storage will be full next round, swiching state to go to base");
                    self.state = "going to base";
                }
            }
            return self.mine();
        }
        else {
            self.log("Not enough fuel to mine");
            // self.lastMoveNothing = true;
            return pilgrimUtil.pilgrimDontDoNothing(self);
        }
    }

    if (self.state === "going to base") {
        self.log("Pilgrim state: " + self.state);
        if (util.sqDist(self.loc, self.base) <= 2) {
            self.state = "depositing";
            self.log("Already arrived at base, state switching to " + self.state);
        }
        else {
            let chosenMove = nav.move(self.loc, self.avoidMinesBaseBFS, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
            // let chosenMove = move(self.loc, self.bfsFromBase, self.map, self.getVisibleRobotMap(), SPECS.UNITS[self.me.unit].SPEED, self.lastMoveNothing);
            self.log("Move: " + util.pairToString(chosenMove));
            if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                // chosenMove = move(self.loc, self.bfsFromBase, self.map, self.getVisibleRobotMap(), SPECS.UNITS[self.me.unit].SPEED);
                self.log("New move: " + util.pairToString(chosenMove));
                if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                    // self.lastMoveNothing = true;
                    return pilgrimUtil.pilgrimDontDoNothing(self);
                }
            }
            // self.lastMoveNothing = false;
            if (util.sqDist(util.addPair(self.loc, chosenMove), self.base) <= 2 && util.enoughFuelToMove(self, chosenMove)) {
                self.state = "depositing";
                self.log("Will arrive at base next turn, state switching to " + self.state);
            }
            return self.move(chosenMove.x, chosenMove.y);
        }
    }

    if (self.state === "depositing") {
        self.log("Pilgrim state: " + self.state);
        if (self.me.karbonite > 0 || self.me.fuel > 0) {
            self.log("Depositing resources at base");
            // self.lastMoveNothing = false;
            self.state = "going to mine";
            self.log("State for next round changed to " + self.state);
            return self.give(self.base.x - self.loc.x, self.base.y - self.loc.y, self.me.karbonite, self.me.fuel);
        }
        else {
            self.log("ERROR! pilgrim was in state deposit without any resources");
            self.state = "going to mine";
            return pilgrimUtil.pilgrimDontDoNothing(self);
        }
    }

    self.log("ERROR! self is the end of pilgrim's turn(), it shouldn't get self far");
    return pilgrimUtil.pilgrimDontDoNothing(self);
}

export default pilgrim;
