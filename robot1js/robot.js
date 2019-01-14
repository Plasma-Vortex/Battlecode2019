import { BCAbstractRobot, SPECS } from 'battlecode';
// import {reflect, getDir, rotate, toCoordinateDir, toCompassDir, goto, sqDist} from 'nav';

import { addPair, subtractPair, pairEq, pairToString, sqDist, hashShift, unhashShift, norm, empty, bfs, move, findClosestKarbonite, findClosestFuel, findClosestPosition, customSort } from './nav.js';
import { Queue } from './Queue.src.js';


class MyRobot extends BCAbstractRobot {
    canBuild(unitType) {
        return (this.karbonite >= SPECS.UNITS[unitType].CONSTRUCTION_KARBONITE && this.fuel >= SPECS.UNITS[unitType].CONSTRUCTION_FUEL);
    }

    hasSpaceAround() {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (empty({ x: this.loc.x + dx, y: this.loc.y + dy }, this.map, this.getVisibleRobotMap())) {
                    return true;
                }
            }
        }
        return false;
    }

    buildAround(unitType) {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (empty({ x: this.loc.x + dx, y: this.loc.y + dy }, this.map, this.getVisibleRobotMap())) {
                    return this.buildUnit(unitType, dx, dy);
                }
            }
        }
    }

    findSymmetry() {
        for (let x = 0; x < this.map.length; x++) {
            for (let y = 0; y < this.map.length; y++) {
                if (this.map[y][x] !== this.map[y][this.map.length - x - 1]
                    || this.karbonite_map[y][x] !== this.karbonite_map[y][this.map.length - x - 1]
                    || this.fuel_map[y][x] !== this.fuel_map[y][this.map.length - x - 1]) {
                    this.symmetry = "y";
                    return;
                }
            }
        }
        for (let x = 0; x < this.map.length; x++) {
            for (let y = 0; y < this.map.length; y++) {
                if (this.map[y][x] !== this.map[this.map.length - y - 1][x]
                    || this.karbonite_map[y][x] !== this.karbonite_map[this.map.length - y - 1][x]
                    || this.fuel_map[y][x] !== this.fuel_map[this.map.length - y - 1][x]) {
                    this.symmetry = "x";
                    return;
                }
            }
        }
        // should also check if two of your castles are reflections of each other
        this.symmetry = "xy";
    }

    reflect(pt) {
        if (this.symmetry === "x" || this.symmetry === "xy") {
            return { x: pt.x, y: this.map.length - pt.y - 1 };
        }
        else {
            return { x: this.map.length - pt.x - 1, y: pt.y };
        }
    }

    assignAreaToCastles() {
        let area = [];
        for (let x = 0; x < this.map.length; x++)
            area.push(new Array(this.map.length));
        this.castleBFS = [];
        this.enemyCastleBFS = [];
        for (let i = 0; i < this.castles.length; i++) {
            this.castleBFS.push(bfs(this.castles[i], this.map));
            this.enemyCastleBFS.push(bfs(this.enemyCastles[i], this.map));
        }
        for (let x = 0; x < this.map.length; x++) {
            for (let y = 0; y < this.map.length; y++) {
                let yourMinDist = 1000000;
                let yourBestCastle = -1;
                for (let i = 0; i < this.castles.length; i++) {
                    if (this.castleBFS[i][y][x] < yourMinDist) {
                        yourBestCastle = i;
                        yourMinDist = this.castleBFS[i][y][x];
                    }
                }
                let enemyMinDist = 1000000;
                let enemyBestCastle = -1;
                for (let i = 0; i < this.enemyCastles.length; i++) {
                    if (this.enemyCastleBFS[i][y][x] < enemyMinDist) {
                        enemyBestCastle = i;
                        enemyMinDist = this.enemyCastleBFS[i][y][x];
                    }
                }
                if (yourMinDist < enemyMinDist) {
                    area[y][x] = { team: this.me.team, castle: yourBestCastle, dist: yourMinDist };
                }
                else if (enemyMinDist < yourMinDist) {
                    area[y][x] = { team: this.me.team ^ 1, castle: enemyBestCastle, dist: enemyMinDist }; // combine into -enemyBestCastle?
                }
                else {
                    area[y][x] = { team: -1, castle: yourBestCastle, dist: yourMinDist };
                }
            }
        }
        return area;
    }

    // information taken from lastCreated
    queueInitSignal() {
        if (this.lastCreated === null) {
            return;
        }
        if (this.lastCreated[0] === SPECS.PILGRIM) {
            let hash = 1 << 15; // meant for newest robot
            let shift = this.lastCreated[1];
            hash |= hashShift(shift) << 12; // bits 12-14 specify position relative to castle
            hash |= this.castles.length << 10; // bits 10-11 say how many castles there are, so the new unit knows how long to stay
            hash |= (this.castleNumber + 1) << 8; // bits 8-9 say which castle this is. extra castle positions are listed in increasing order of castle number
            hash |= this.churches.length << 6; // bits 6-7 say how many churches there are. Note that we can't have over 3 churches.
            // specify pilgrim goal
            if (this.lastCreated[2] === "fuel") {
                hash |= 1 << 4;
            }
            hash |= this.lastCreated[3];
            this.signalQueue.enqueue({ signal: hash, dist: norm(shift) });

            for (let i = 0; i < this.castles.length; i++) {
                if (i === this.castleNumber)
                    continue;
                hash = 1 << 15;
                hash |= hashShift(shift) << 12;
                hash |= this.castles[i].x << 6;
                hash |= this.castles[i].y;
                this.signalQueue.enqueue({ signal: hash, dist: norm(shift) });
            }
        }
    }

    sendSignal() {
        if (this.signalQueue.isEmpty())
            return;
        if (this.alreadySignaled) {
            this.log("ERROR! Tried to signal twice in the same turn");
            return;
        }
        let message = this.signalQueue.dequeue();
        this.log("Sending signal " + message.signal);
        this.signal(message.signal, message.dist);
        this.alreadySignaled = true;
    }

    // consider sorting by sqDist if bfsDist is equal, to reduce travel cost
    initResourceList() {
        this.targetKarb = [];
        this.targetFuel = [];
        for (let x = 0; x < this.map.length; x++) {
            for (let y = 0; y < this.map.length; y++) {
                if (this.karbonite_map[y][x]) {
                    if (this.assignedArea[y][x].team === this.me.team) {
                        this.targetKarb.push([this.assignedArea[y][x].dist, this.assignedArea[y][x].castle, x, y]);
                    }
                }
                if (this.fuel_map[y][x]) {
                    if (this.assignedArea[y][x].team === this.me.team) {
                        this.targetFuel.push([this.assignedArea[y][x].dist, this.assignedArea[y][x].castle, x, y]);
                    }
                }
            }
        }

        this.targetKarb.sort(customSort);
        this.targetFuel.sort(customSort);
        while (this.targetKarb.length > this.maxKarbPilgrims) {
            this.targetKarb.pop();
        }
        while (this.targetFuel.length > this.maxFuelPilgrims) {
            this.targetFuel.pop();
        }
    }

    initMyTargetResources() {
        this.myTargetKarb = [];
        this.myTargetFuel = [];
        for (let i = 0; i < this.targetKarb.length; i++) {
            if (this.targetKarb[i][1] === this.castleNumber) {
                this.myTargetKarb.push({ karbID: i, assignedWorker: -1 });
            }
        }
        for (let i = 0; i < this.targetFuel.length; i++) {
            if (this.targetFuel[i][1] === this.castleNumber) {
                this.myTargetFuel.push({ fuelID: i, assignedWorker: -1 });
            }
        }
    }

    needKarbPilgrims(karbPilgrimsNeeded) {
        for (let i = 0; i < this.myTargetKarb.length; i++) {
            if (this.myTargetKarb[i].karbID < karbPilgrimsNeeded && this.myTargetKarb[i].assignedWorker === -1) {
                return true;
            }
        }
        return false;
    }

    needFuelPilgrims(fuelPilgrimsNeeded) {
        for (let i = 0; i < this.myTargetFuel.length; i++) {
            if (this.myTargetFuel[i].fuelID < fuelPilgrimsNeeded && this.myTargetFuel[i].assignedWorker === -1) {
                return true;
            }
        }
        return false;
    }

    canMaintainBuffer(unitType) {
        return (this.karbonite - SPECS.UNITS[unitType].CONSTRUCTION_KARBONITE >= this.karbBuffer
            && this.fuel - SPECS.UNITS[unitType].CONSTRUCTION_FUEL >= this.fuelBuffer);
    }

    addNewestToUnitList(visible) {
        for (let i = 0; i < visible.length; i++) {
            let r = visible[i];
            if (r.team === this.me.team && r.castle_talk > 0 && r.castle_talk < 4) {
                // newly created robot
                if (r.castle_talk === this.castleNumber + 1) {
                    // created by me
                    if (r.unit === this.lastCreated[0]) {
                        // add to list of alive units
                        if (r.unit === SPECS.PILGRIM) {
                            if (this.lastCreated[2] === "karb") {
                                this.karbPilgrims.push(r.id);
                                for (let j = 0; j < this.myTargetKarb.length; j++) {
                                    if (this.myTargetKarb[j].karbID === this.lastCreated[3]) {
                                        this.myTargetKarb[j].assignedWorker = r.id;
                                    }
                                }
                            }
                            else {
                                this.fuelPilgrims.push(r.id);
                                for (let j = 0; j < this.myTargetFuel.length; j++) {
                                    if (this.myTargetFuel[j].karbID === this.lastCreated[3]) {
                                        this.myTargetFuel[j].assignedWorker = r.id;
                                    }
                                }
                            }
                        }
                        else if (r.unit === SPECS.CRUSADER) {
                            this.crusaders.push(r.id);
                        }
                        else if (r.unit === SPECS.PROPHET) {
                            this.prophets.push(r.id);
                        }
                        else if (r.unit === SPECS.PREACHER) {
                            this.preachers.push(r.id);
                        }
                    }
                    else {
                        this.log("ERROR! newest unit does not match type specified in lastCreated");
                    }
                }
            }
        }
    }

    // add assignWorker = -1 when pilgrim dies
    updateUnitList(unitList, visible) {
        unitList = unitList.filter((id) => {
            for (let i = 0; i < visible.length; i++) {
                if (id === visible[i].id)
                    return true;
            }
            return false;
        });
    }

    updateAllUnitLists(visible) {
        // check deaths
        this.updateUnitList(this.churches, visible);
        this.updateUnitList(this.karbPilgrims, visible);
        this.updateUnitList(this.fuelPilgrims, visible);
        this.updateUnitList(this.crusaders, visible);
        this.updateUnitList(this.prophets, visible);
        this.updateUnitList(this.preachers, visible);

        // check new births
        if (this.lastCreated !== null) {
            this.addNewestToUnitList(visible);
        }

        // add new way of finding newly build churches via pilgrim castleTalk
    }

    buildKarbPilgrim() {
        for (let i = 0; i < this.myTargetKarb.length; i++) {
            if (this.myTargetKarb[i].karbID < this.desiredKarbPilgrims && this.myTargetKarb[i].assignedWorker === -1) {
                // found first needed karb pilgrim
                let destination = {
                    x: this.targetKarb[this.myTargetKarb[i].karbID][2],
                    y: this.targetKarb[this.myTargetKarb[i].karbID][3]
                };

                // choose best starting placement around castle
                let minDist = 1000000;
                let bestPos = { x: -1, y: -1 };
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        let pos = { x: this.loc.x + dx, y: this.loc.y + dy };
                        if (empty(pos, this.map, this.getVisibleRobotMap())) {
                            if (sqDist(pos, destination) < minDist) {
                                minDist = sqDist(pos, destination);
                                bestPos = pos;
                            }
                        }
                    }
                }

                this.log("Buliding Karb Pilgrim at " + pairToString(bestPos)
                    + " to target karb #" + this.myTargetKarb[i].karbID
                    + " at (" + this.targetKarb[this.myTargetKarb[i].karbID][2] + ", " + this.targetKarb[this.myTargetKarb[i].karbID][3] + ")");

                let shift = subtractPair(bestPos, this.loc);
                this.lastCreated = [SPECS.PILGRIM, shift, "karb", this.myTargetKarb[i].karbID];
                this.queueInitSignal();
                this.sendSignal();
                return this.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
            }
        }
    }

    buildFuelPilgrim() {
        for (let i = 0; i < this.myTargetFuel.length; i++) {
            if (this.myTargetFuel[i].fuelID < this.desiredFuelPilgrims && this.myTargetFuel[i].assignedWorker === -1) {
                // found first needed fuel pilgrim
                let destination = {
                    x: this.targetFuel[this.myTargetFuel[i].fuelID][2],
                    y: this.targetFuel[this.myTargetFuel[i].fuelID][3]
                };

                // choose best starting placement around castle
                let minDist = 1000000;
                let bestPos = { x: -1, y: -1 };
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        let pos = { x: this.loc.x + dx, y: this.loc.y + dy };
                        // this.log("Starting placement in consideration: " + pairToString(pos));
                        if (empty(pos, this.map, this.getVisibleRobotMap())) {
                            if (sqDist(pos, destination) < minDist) {
                                minDist = sqDist(pos, destination);
                                bestPos = pos;
                            }
                            else {
                                // this.log("Failed because " + pairToString(pos) + " is farther than the min distance of " + minDist);
                            }
                        }
                        else {
                            // this.log("Failed because " + pairToString(pos) + " is occupied");
                        }
                    }
                }

                this.log("Buliding Fuel Pilgrim at " + pairToString(bestPos)
                    + " to target fuel #" + this.myTargetFuel[i].fuelID
                    + " at (" + this.targetFuel[this.myTargetFuel[i].fuelID][2] + ", " + this.targetFuel[this.myTargetFuel[i].fuelID][3] + ")");

                let shift = subtractPair(bestPos, this.loc);
                this.lastCreated = [SPECS.PILGRIM, shift, "fuel", this.myTargetFuel[i].fuelID];
                this.queueInitSignal();
                this.sendSignal();
                return this.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
            }
        }
    }

    enoughFuelToMove(chosenMove) {
        return this.fuel >= norm(chosenMove) * SPECS.UNITS[this.me.unit].FUEL_PER_MOVE;
    }

    pilgrimInit() {
        this.findSymmetry();
        this.enemyCastles = [];
        for (let i = 0; i < this.castles.length; i++) {
            this.enemyCastles.push(this.reflect(this.castles[i]));
        }
        this.assignedArea = this.assignAreaToCastles();
        this.initResourceList();
        if (this.targetResource === "karb") {
            this.targetMine = {
                x: this.targetKarb[this.targetID][2],
                y: this.targetKarb[this.targetID][3]
            };
        }
        else {
            this.targetMine = {
                x: this.targetFuel[this.targetID][2],
                y: this.targetFuel[this.targetID][3]
            };
        }
        this.bfsFromBase = bfs(this.base, this.map);
        this.bfsFromMine = bfs(this.targetMine, this.map);
        this.log("I am a pilgrim that just got initialized");
        this.log("Target Resource: " + this.targetResource);
        this.log("Base castle: " + JSON.stringify(this.base));
        this.log("Target Mine: " + JSON.stringify(this.targetMine));
    }

    pilgrimDontDoNothing() {
        this.log("Trying to not do nothing");
        if (this.karbonite_map[this.loc.y][this.loc.x]
            && this.me.karbonite < SPECS.UNTIS[this.me.unit].KARBONITE_CAPACITY
            && this.fuel >= this.MINE_FUEL_COST) {
                this.lastMoveNothing = false;
                this.log("Mining random karb mine");
                return this.mine();
        }
        if (this.fuel_map[this.loc.y][this.loc.x]
            && this.me.fuel < SPECS.UNTIS[this.me.unit].FUEL_CAPACITY
            && this.fuel >= this.MINE_FUEL_COST) {
                this.lastMoveNothing = false;
                this.log("Mining random fuel mine");
                return this.mine();
        }
    }

    turn() {
        this.log("START TURN " + this.me.turn);
        this.alreadySignaled = false;
        let visible = this.getVisibleRobots();

        if (this.me.unit === SPECS.PILGRIM) {
            this.loc = { x: this.me.x, y: this.me.y };
            this.log("Pilgrim Position: " + pairToString(this.loc));

            if (this.me.turn === 1) {
                for (let i = 0; i < visible.length; i++) {
                    let r = visible[i];
                    if (r.team === this.me.team && r.unit === SPECS.CASTLE && this.isRadioing(r)) {
                        let hash = r.signal;
                        if (hash >> 15) {
                            let shiftHash = (hash >> 12) & ((1 << 3) - 1);
                            let shift = unhashShift(shiftHash);
                            if (pairEq(subtractPair(this.loc, { x: r.x, y: r.y }), shift)) {
                                // signal is meant for me!
                                this.castles = new Array((hash >> 10) & ((1 << 2) - 1));
                                this.castles[((hash >> 8) & ((1 << 2) - 1)) - 1] = { x: r.x, y: r.y };

                                this.log("Known castle locations:");
                                this.log(JSON.stringify(this.castles));

                                this.base = { x: r.x, y: r.y };
                                this.churches = new Array((hash >> 6) & ((1 << 2) - 1));
                                if (hash & (1 << 4))
                                    this.targetResource = "fuel";
                                else
                                    this.targetResource = "karb";
                                this.targetID = hash & ((1 << 4) - 1);
                                this.castleTalk((hash >> 8) & ((1 << 2) - 1));

                                if (this.castles.length > 1) {
                                    this.state = "waiting for castle locations";
                                    return;
                                }
                                else {
                                    this.pilgrimInit();
                                    this.state = "going to mine"; // can start moving on the same turn
                                }
                            }
                        }
                    }
                }
            }

            if (this.state === "waiting for castle locations") {
                this.log("Pilgrim state: " + this.state);
                for (let i = 0; i < visible.length; i++) {
                    let r = visible[i];
                    if (r.team === this.me.team && r.unit === SPECS.CASTLE && this.isRadioing(r)) {
                        let hash = r.signal;
                        if (hash >> 15) {
                            let shiftHash = (hash >> 12) & ((1 << 3) - 1);
                            let shift = unhashShift(shiftHash);
                            if (pairEq(subtractPair(this.loc, { x: r.x, y: r.y }), shift)) {
                                // signal is meant for me!
                                for (let j = 0; j < this.castles.length; j++) {
                                    if (this.castles[j] === undefined) {
                                        this.castles[j] = { x: (r.signal >> 6) & ((1 << 6) - 1), y: r.signal & ((1 << 6) - 1) };
                                        break;
                                    }
                                }
                                this.log("Known castle locations:");
                                this.log(JSON.stringify(this.castles));
                                let foundAllCastles = true;
                                for (let j = 0; j < this.castles.length; j++) {
                                    if (this.castles[j] === undefined) {
                                        foundAllCastles = false;
                                    }
                                }
                                if (foundAllCastles) {
                                    this.pilgrimInit();
                                    this.state = "going to mine"; // can start moving on the same turn
                                }
                                // if !foundAllCastles, this.state is still "waiting for castle locations"
                            }
                        }
                    }
                }
            }

            if (this.state === "going to mine") {
                this.log("Pilgrim state: " + this.state);
                if (pairEq(this.loc, this.targetMine)) {
                    this.state = "mining";
                    this.loc("Already arrived at mine, state changed to " + this.state);
                }
                else {
                    let chosenMove = move(this.loc, this.bfsFromMine, this.map, this.getVisibleRobotMap(), SPECS.UNITS[this.me.unit].SPEED, this.lastMoveNothing);
                    this.log("Move: " + pairToString(chosenMove));
                    if (pairEq(chosenMove, { x: 0, y: 0 })) {
                        this.lastMoveNothing = true; // stuck
                        return this.pilgrimDontDoNothing();
                    }
                    else {
                        this.lastMoveNothing = false;
                        if (pairEq(addPair(this.loc, chosenMove), this.targetMine) && this.enoughFuelToMove(chosenMove))
                            this.state = "mining";
                        return this.move(chosenMove.x, chosenMove.y);
                    }
                }
            }

            if (this.state === "mining") {
                this.log("Pilgrim state: " + this.state);
                this.lastMoveNothing = false;
                if (this.fuel >= SPECS.MINE_FUEL_COST) {
                    if (this.targetResource === "karb") {
                        if (this.me.karb + SPECS.KARBONITE_YIELD >= SPECS.UNITS[this.me.unit].KARBONITE_CAPACITY) {
                            this.state = "going to base";
                        }
                    }
                    else {
                        if (this.me.karb + SPECS.KARBONITE_YIELD >= SPECS.UNITS[this.me.unit].KARBONITE_CAPACITY) {
                            this.state = "going to base";
                        }
                    }
                    return this.mine();
                }
                else {
                    this.log("Not enough fuel to mine");
                    this.lastMoveNothing = true;
                    return this.pilgrimDontDoNothing();
                }
            }

            if (this.state === "going to base") {
                this.log("Pilgrim state: " + this.state);
                if (sqDist(this.loc, this.base) <= 2) {
                    this.state = "depositing";
                }
                else {
                    let chosenMove = move(this.loc, this.bfsFromBase, this.map, this.getVisibleRobotMap(), SPECS.UNITS[this.me.unit].SPEED, this.lastMoveNothing);
                    this.log("Move: " + pairToString(chosenMove));
                    if (pairEq(chosenMove, { x: 0, y: 0 })) {
                        this.lastMoveNothing = true;
                        return this.pilgrimDontDoNothing();
                    }
                    else {
                        this.lastMoveNothing = false;
                        if (sqDist(addPair(this.loc, chosenMove), this.base) <= 2 && this.enoughFuelToMove(chosenMove))
                            this.state = "depositing";
                        return this.move(chosenMove.x, chosenMove.y);
                    }
                }
            }

            if (this.state === "depositing") {
                this.log("Pilgrim state: " + this.state);
                if (this.me.karbonite > 0 || this.me.fuel > 0) {
                    this.log("Depositing resources");
                    this.lastMoveNothing = false;
                    this.state = "going to mine";
                    return this.give(this.base.x - this.loc.x, this.base.y - this.loc.y, this.me.karbonite, this.me.fuel);
                }
                else {
                    this.log("ERROR! pilgrim was in state deposit without any resources");
                    this.state = "going to mine";
                    return this.pilgrimDontDoNothing();
                }
            }
        }
        else if (this.me.unit === SPECS.CASTLE) {
            this.loc = { x: this.me.x, y: this.me.y }; // change to let loc
            this.log("Castle Position: " + pairToString(this.loc));

            if (this.me.turn === 1) {
                this.castles = [];
                this.churches = [];
                for (let i = 0; i < visible.length; i++) {
                    let r = visible[i];
                    if (r.team === this.me.team) { // cannot check r.unit === SPECS.CASTLE because r.unit is undefined when r is not visible
                        this.castles.push({ x: -1, y: -1 });
                    }
                }
                this.castleNumber = 0;
                for (let i = 0; i < visible.length; i++) {
                    let r = visible[i];
                    if (r.team === this.me.team && r.id !== this.me.id) {
                        if ((r.castle_talk >> 6) !== 0) {
                            let rCastleNumber = (r.castle_talk >> 6) - 1;
                            this.castles[rCastleNumber].x = r.castle_talk & ((1 << 6) - 1);
                            this.castleNumber++;
                        }
                    }
                }
                this.castles[this.castleNumber] = { x: this.me.x, y: this.me.y };
                this.castleTalk(((this.castleNumber + 1) << 6) + this.me.x);

                // other init things
                this.lastCreated = null;
                this.signalQueue = new Queue();
                return;
            }
            else if (this.me.turn === 2) {
                for (let i = 0; i < visible.length; i++) {
                    let r = visible[i];
                    if (r.team === this.me.team && r.id !== this.me.id) {
                        if ((r.castle_talk >> 6) !== 0) {
                            let rCastleNumber = (r.castle_talk >> 6) - 1;
                            if (rCastleNumber < this.castleNumber) { // r's second signal is y coordinate
                                this.castles[rCastleNumber].y = r.castle_talk & ((1 << 6) - 1);
                            }
                            else { // r's first signal is x coordinate
                                this.castles[rCastleNumber].x = r.castle_talk & ((1 << 6) - 1);
                            }
                        }
                    }
                }
                this.castleTalk(((this.castleNumber + 1) << 6) + this.me.y);
                return;
            }
            else if (this.me.turn === 3) {
                for (let i = 0; i < visible.length; i++) {
                    let r = visible[i];
                    if (r.team === this.me.team && r.id !== this.me.id) {
                        if ((r.castle_talk >> 6) !== 0) {
                            let rCastleNumber = (r.castle_talk >> 6) - 1;
                            if (rCastleNumber > this.castleNumber) { // r's second signal is y coordinate
                                // this.log("Castle " + rCastleNumber + " sent castleTalk message " + r.castle_talk & ((1 << 6) - 1));
                                this.castles[rCastleNumber].y = r.castle_talk & ((1 << 6) - 1);
                            }
                        }
                    }
                }

                this.log("I am castle number " + this.castleNumber);
                this.log("Found castle positions");
                this.log(this.castles);

                this.findSymmetry();
                this.enemyCastles = [];
                for (let i = 0; i < this.castles.length; i++) {
                    this.enemyCastles.push(this.reflect(this.castles[i]));
                }

                this.maxKarbPilgrims = 16;
                this.maxFuelPilgrims = 16;

                this.assignedArea = this.assignAreaToCastles();
                this.initResourceList();
                this.initMyTargetResources();

                // this.log("Target karb:");
                // for (let i = 0; i<this.targetKarb.length; i++){
                //     this.log(this.targetKarb[i]);
                // }
                // this.log("Target fuel:");
                // for (let i = 0; i<this.targetFuel.length; i++){
                //     this.log(this.targetFuel[i]);
                // }
                // this.log("My target karb:");
                // for (let i = 0; i<this.myTargetKarb.length; i++){
                //     this.log(JSON.stringify(this.myTargetKarb[i]));
                // }
                // this.log("My target fuel:");
                // for (let i = 0; i<this.myTargetFuel.length; i++){
                //     this.log(JSON.stringify(this.myTargetFuel[i]));
                // }

                this.churches = [];
                this.karbPilgrims = [];
                this.fuelPilgrims = [];
                this.crusaders = [];
                this.prophets = []; // rangers
                this.preachers = []; // mages/tanks

                this.desiredKarbPilgrims = 4;
                this.desiredFuelPilgrims = 4;
                this.karbBuffer = 60; // make it dynamic
                this.fuelBuffer = 200; // make it dynamic
            }

            this.updateAllUnitLists(visible);

            if (this.hasSpaceAround()) {
                // add defending against attacks as top priority
                if (this.needKarbPilgrims(this.desiredKarbPilgrims)) {
                    if (!this.canMaintainBuffer(SPECS.PILGRIM)) {
                        this.sendSignal();
                        return; // save up resources instead of risking safety buffer
                    }
                    return this.buildKarbPilgrim();
                }
                else if (this.needFuelPilgrims(this.desiredFuelPilgrims)) {
                    if (!this.canMaintainBuffer(SPECS.PILGRIM)) {
                        this.sendSignal();
                        return; // save up resources instead of risking safety buffer
                    }
                    return this.buildFuelPilgrim();
                }
                // else if (this.canMaintainBuffer(SPECS.CRUSADER)) {
                //     this.log("Building crusader");
                //     this.sendSignal();
                //     return this.buildAround(SPECS.CRUSADER);
                // }
                else {
                    this.lastCreated = null;
                }
            }
            this.sendSignal();
        }
        else { // other attacking unit
            this.loc = { x: this.me.x, y: this.me.y };

            var self = this // 'this' fails to properly identify MyRobot when used inside of anonymous function below :(

            // get attackable robots
            var attackable = visible.filter((r) => {
                if (!self.isVisible(r)) {
                    return false
                }
                var dist = (r.x - self.me.x) ** 2 + (r.y - self.me.y) ** 2
                if (r.team !== self.me.team
                    && SPECS.UNITS[SPECS.CRUSADER].ATTACK_RADIUS[0] <= dist
                    && dist <= SPECS.UNITS[SPECS.CRUSADER].ATTACK_RADIUS[1]) {
                    return true
                }
                return false
            })
            // this.log(attackable)

            if (attackable.length > 0) {
                // attack first robot
                var r = attackable[0]
                this.log("" + r)
                this.log('attacking! ' + r + ' at loc ' + (r.x - this.me.x, r.y - this.me.y))
                return this.attack(r.x - this.me.x, r.y - this.me.y)
            }

            const choices = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
            const choice = choices[Math.floor(Math.random() * choices.length)]
            return this.move(...choice);
        }
    }
}

var robot = new MyRobot();
