import {BCAbstractRobot, SPECS} from 'battlecode';
import nav from './nav.js';
import util from './util.js';

const prophet = {};

prophet.takeTurn = (self) => {
    self.loc = { x: self.me.x, y: self.me.y };
    self.log("Ranger Position: " + util.pairToString(self.loc));

    if (self.me.turn === 1) {
        self.receivedFirstMessage = false;
        self.state = "waiting for init messages";
    }

    if (self.state === "waiting for init messages") {
        self.log("Ranger state: " + self.state);
        let receivedMessage = false;
        for (let i = 0; i < self.visible.length; i++) {
            let r = self.visible[i];
            if (r.team === self.me.team
                && (r.unit === SPECS.CASTLE || r.unit === SPECS.CHURCH)
                && self.isRadioing(r) && (r.signal >> 15) === 1) {
                // signal is meant for me!
                self.log("I got a message!");
                receivedMessage = true;

                self.baseCastle = { x: r.x, y: r.y };
                self.bfsFromBase = nav.bfs(self.baseCastle, self.map);
                
                let hash = r.signal;
                if ((hash >> 11) & 1) {
                    self.state = "defense";
                    let enemyShiftX = ((hash >> 5) & ((1 << 5) - 1)) - 16;
                    let enemyShiftY = (hash & ((1 << 5) - 1)) - 16;
                    self.enemy = util.addPair(self.baseCastle, { x: enemyShiftX, y: enemyShiftY });
                    self.bfsFromEnemy = nav.bfs(self.enemy, self.map);
                    self.log("I'm a defense ranger that just got initialized");
                    self.log("Base castle: " + util.pairToString(self.baseCastle));
                    self.log("Heading to enemy at " + util.pairToString(self.enemy));
                }
                else {
                    self.state = "attack";
                    util.findSymmetry(self);
                    self.enemyCastle = util.reflect(self, self.baseCastle);
                    self.bfsFromEnemy = nav.bfs(self.enemyCastle, self.map);
                    self.log("I'm an attack ranger that just got initialized");
                    self.log("Base castle: " + util.pairToString(self.baseCastle));
                    self.log("Heading to enemy at " + util.pairToString(self.enemyCastle));
                }
            }
        }
        if (!receivedMessage) {
            self.log("No message received, state is still " + self.state);
        }
    }

    if (util.findEnemies(self, self.visible).length > 0) {
        self.log("Ranger sees enemies!");
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

    if (self.state === "defense") {
        self.log("Ranger state: " + self.state);
        let chosenMove = nav.move(self.loc, self.bfsFromEnemy, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
        self.log("Move: " + util.pairToString(chosenMove));
        if (util.pairEq(util.addPair(self.loc, chosenMove), self.enemy) && util.enoughFuelToMove(self, chosenMove))
            self.state = "waiting";
        return self.move(chosenMove.x, chosenMove.y);
    }

    if (self.state === "attack") {
        self.log("Ranger state: " + self.state);
        if (util.sqDist(self.loc, self.enemyCastle) <= SPECS.UNITS[self.me.unit].VISION_RADIUS
            && self.getRobot(robotMap[self.enemyCastle.y][self.enemyCastle.x]).unit !== SPECS.CASTLE) {
            self.log("Don't see an enemy castle in the expected location, must have been killed");
            self.state = "returning";
        }
        let chosenMove = nav.move(self.loc, self.bfsFromEnemyCastle, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED);
        self.log("Move: " + util.pairToString(chosenMove));
        if (util.sqDist(util.addPair(self.loc, chosenMove), self.enemyCastle) && util.enoughFuelToMove(self, chosenMove))
            self.state = "returning";
        return self.move(chosenMove.x, chosenMove.y);
    }

    if (self.state === "returning") {
        self.log("Ranger state: " + self.state);
        let chosenMove = nav.move(self.loc, self.bfsFromBase, self.map, self.robotMap, SPECS.UNITS[self.me.unit].SPEED); // slow retreat
        self.log("Move: " + util.pairToString(chosenMove));
        if (util.sqDist(util.addPair(self.loc, chosenMove), self.baseCastle) <= 16 && util.enoughFuelToMove(self, chosenMove))
            self.state = "waiting";
        return self.move(chosenMove.x, chosenMove.y);
    }
}


export default prophet;
