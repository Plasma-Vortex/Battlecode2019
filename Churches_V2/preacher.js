import { BCAbstractRobot, SPECS } from 'battlecode';
import nav from './nav.js';
import util from './util.js';
import resource from './resource.js';
import signalling from './signalling.js';


const preacher = {};

preacher.takeTurn = (self) => {
    self.loc = { x: self.me.x, y: self.me.y };
    self.log("Mage Position: " + util.pairToString(self.loc));
    if (self.me.turn === 1) {
        self.receivedFirstMessage = false;
        self.state = "waiting for init messages";
    }

    if (self.state === "waiting for init messages") {
        self.log("Mage state: " + self.state);
        let receivedMessage = false;
        for (let i = 0; i < self.visible.length; i++) {
            let r = self.visible[i];
            if (r.team === self.me.team
                && (r.unit === SPECS.CASTLE || r.unit === SPECS.CHURCH)
                && self.isRadioing(r) && (r.signal >> 15) === 1) {
                // signal is meant for me!
                self.log("I got a message!");
                receivedMessage = true;

                self.base = { x: r.x, y: r.y };
                self.bfsFromBase = nav.fullBFS(self.base, self.avoidMinesMap, SPECS.UNITS[self.me.unit].SPEED);

                let hash = r.signal;
                self.attacker = (hash >> 11) & 1;

                let dx = ((hash >> 5) & ((1 << 5) - 1)) - 16;
                let dy = (hash & ((1 << 5) - 1)) - 16;
                self.destination = util.addPair(self.base, { x: dx, y: dy });
                self.bfsFromDestination = nav.fullBFS(self.destination, self.avoidMinesMap, SPECS.UNITS[self.me.unit].SPEED);

                self.state = "going to destination";

                self.log("I'm a mage that just got initialized");
                self.log("Base castle: " + util.pairToString(self.base));
                self.log("Attacker: " + self.attacker);
                self.log("Destination: " + util.pairToString(self.destination));
            }
        }
        if (!receivedMessage) {
            self.log("No message received, state is still " + self.state);
        }
    }

    if (util.findEnemies(self, self.visible).length > 0) {
        self.log("Mage sees enemies!");
        let bestShift = { x: -100, y: -100 };
        let maxHits = -100;
        let closestHit = 100;
        for (let dx = -4; dx <= 4; dx++) {
            for (let dy = -4; dy <= 4; dy++) {
                let shift = { x: dx, y: dy };
                let targetSquare = util.addPair(self.loc, shift);
                if (!util.canAttack(self, targetSquare))
                    continue;
                // calculate splash result
                let hits = 0;
                let closestDist = 100;
                for (let dx2 = -1; dx2 <= 1; dx2++) {
                    for (let dy2 = -1; dy2 <= 1; dy2++) {
                        let splashed = util.addPair(targetSquare, { x: dx2, y: dy2 });
                        if (!util.inGrid(splashed, self.map))
                            continue;
                        let id = self.robotMap[splashed.y][splashed.x];
                        if (id > 0) {
                            if (self.getRobot(id).team !== self.me.team) {
                                hits++;
                                closestDist = Math.min(closestDist, util.norm({ x: dx + dx2, y: dy + dy2 }));
                            }
                            else {
                                hits--;
                            }
                        }
                    }
                }
                if (hits > maxHits) {
                    bestShift = shift;
                    maxHits = hits;
                    closestHit = closestDist;
                }
                else if (hits === maxHits) {
                    if (closestDist < closestHit) {
                        bestShift = shift;
                        maxHits = hits;
                        closestHit = closestDist;
                    }
                }
            }
        }
        self.log("Attacking " + util.pairToString(util.addPair(self.loc, bestShift)));
        return self.attack(bestShift.x, bestShift.y);
    }

    if (self.state === "going to destination") {
        self.log("Mage state: " + self.state);
        let chosenMove = -1;
        if (self.usingNoRobotMap) {
            chosenMove = nav.move(self.loc, self.destination, self.bfsFromDestinationNoRobot, self.noMineRobotMap, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
        }
        else {
            chosenMove = nav.move(self.loc, self.destination, self.bfsFromDestination, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
        }
        self.log("Move: " + util.pairToString(chosenMove));
        if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
            if (self.lastStuck){
                self.log("Switching to no robot map");
                self.usingNoRobotMap = true;
                self.bfsFromDestinationNoRobot = nav.fullBFS(self.destination, self.noMineRobotMap, SPECS.UNITS[self.me.unit].SPEED);
                chosenMove = nav.move(self.loc, self.destination, self.bfsFromDestinationNoRobot, self.noMineRobotMap, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);

                self.log("New move: " + util.pairToString(chosenMove));
                if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                    self.log("Still stuck, even with no robot map");
                    return pilgrimUtil.pilgrimDontDoNothing(self);
                }
                else {
                    self.lastStuck = false;
                }
            }
            else {
                self.lastStuck = true;
                if (self.usingNoRobotMap) {
                    chosenMove = nav.move(self.loc, self.destination, self.bfsFromDestinationNoRobot, self.noMineRobotMap, self.robotMap, SPECS.UNITS[self.me.unit].SPEED, true);
                }
                else {
                    chosenMove = nav.move(self.loc, self.destination, self.bfsFromDestination, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED, true);
                }
                self.log("I'm stuck, random move: " + util.pairToString(chosenMove));
                
                if (util.pairEq(chosenMove, { x: 0, y: 0 })) {
                    self.log("Completely stuck");
                    return pilgrimUtil.pilgrimDontDoNothing(self);
                }
            }
        }
        else {
            self.lastStuck = false;
        }
        if (util.pairEq(util.addPair(self.loc, chosenMove), self.destination) && util.enoughFuelToMove(self, chosenMove))
            self.state = "waiting";
        return self.move(chosenMove.x, chosenMove.y);
    }

    // if (self.state === "defense") {
    //     self.log("Mage state: " + self.state);
    //     let chosenMove = nav.move(self.loc, self.bfsFromEnemy, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
    //     self.log("Move: " + util.pairToString(chosenMove));
    //     if (util.pairEq(util.addPair(self.loc, chosenMove), self.enemy) && util.enoughFuelToMove(self, chosenMove))
    //         self.state = "returning";
    //     return self.move(chosenMove.x, chosenMove.y);
    // }

    // if (self.state === "attack") {
    //     self.log("Mage state: " + self.state);
    //     if (util.sqDist(self.loc, self.enemyCastle) <= SPECS.UNITS[self.me.unit].VISION_RADIUS
    //         && self.getRobot(robotMap[self.enemyCastle.y][self.enemyCastle.x]).unit !== SPECS.CASTLE) {
    //         self.log("Don't see an enemy castle in the expected location, must have been killed");
    //         self.state = "returning";
    //     }
    //     let chosenMove = nav.move(self.loc, self.bfsFromEnemyCastle, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
    //     self.log("Move: " + util.pairToString(chosenMove));
    //     if (util.sqDist(util.addPair(self.loc, chosenMove), self.enemyCastle) && util.enoughFuelToMove(self, chosenMove))
    //         self.state = "returning";
    //     return self.move(chosenMove.x, chosenMove.y);
    // }

    // if (self.state === "returning") {
    //     self.log("Mage state: " + self.state);
    //     let chosenMove = nav.move(self.loc, self.bfsFromBase, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED); // slow retreat
    //     self.log("Move: " + util.pairToString(chosenMove));
    //     if (util.sqDist(util.addPair(self.loc, chosenMove), self.base) <= 16 && util.enoughFuelToMove(self, chosenMove))
    //         self.state = "waiting";
    //     return self.move(chosenMove.x, chosenMove.y);
    // }
}

export default preacher;
