import { BCAbstractRobot, SPECS } from 'battlecode';
// import {reflect, getDir, rotate, toCoordinateDir, toCompassDir, goto, sqDist} from 'nav';

import { addPair, subtractPair, pairEq, inGrid, pairToString, sqDist, hashShift, unhashShift, norm, empty, bfs, fullBFS, move, findClosestKarbonite, findClosestFuel, findClosestPosition, customSort, compareDist, copyPair, } from './nav.js';
import { Queue } from './Queue.src.js';

// 3 castle test seed: 1505486586
// pilgrim goes to enemy mine seed: 2045874012

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

    // buildAround(unitType) {
    //     for (let dx = -1; dx <= 1; dx++) {
    //         for (let dy = -1; dy <= 1; dy++) {
    //             if (empty({ x: this.loc.x + dx, y: this.loc.y + dy }, this.map, this.getVisibleRobotMap())) {
    //                 return this.buildUnit(unitType, dx, dy);
    //             }
    //         }
    //     }
    // }

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
            return { x: this.map.length - pt.x - 1, y: pt.y };
        }
        else {
            return { x: pt.x, y: this.map.length - pt.y - 1 };
        }
    }

    assignAreaToCastles() {
        let area = [];
        for (let x = 0; x < this.map.length; x++)
            area.push(new Array(this.map.length));
        this.castleBFS = [];
        this.enemyCastleBFS = [];
        for (let i = 0; i < this.castles.length; i++) {
            this.castleBFS.push(bfs(this.castlePos[i], this.map));
            this.enemyCastleBFS.push(bfs(this.enemyCastlePos[i], this.map));
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
                for (let i = 0; i < this.enemyCastlePos.length; i++) {
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
    queueInitSignal(priority = false) {
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
            if (priority) {
                this.prioritySignalQueue.enqueue({ signal: hash, dist: norm(shift) });
            }
            else {
                this.signalQueue.enqueue({ signal: hash, dist: norm(shift) });
            }

            for (let i = 0; i < this.castles.length; i++) {
                if (i === this.castleNumber)
                    continue;
                hash = 1 << 15;
                hash |= hashShift(shift) << 12;
                hash |= this.castlePos[i].x << 6;
                hash |= this.castlePos[i].y;
                if (priority)
                    this.prioritySignalQueue.enqueue({ signal: hash, dist: norm(shift) });
                else
                    this.signalQueue.enqueue({ signal: hash, dist: norm(shift) });
            }
        }
        else if (this.lastCreated[0] === SPECS.PREACHER) {
            this.log("Queueing mage init signal");
            let hash = 1 << 15; // meant for newest robot
            let shift = this.lastCreated[1];
            this.log("Shift: " + pairToString(shift));
            this.log("Distance: " + norm(shift));
            hash |= hashShift(shift) << 12; // bits 12-14 specify position relative to castle
            if (this.lastCreated[2] === "defense") {
                hash |= 1 << 11; // bit 11 specifies whether mage should defend or attack
            }
            hash |= Number(this.lastCreated[3]) << 10; // bit 10 says whether mage should go fast or not
            hash |= (this.lastCreated[4].x + 16) << 5; // specify shifted relative x-coord of enemy
            hash |= this.lastCreated[4].y + 16; // specify shifted relative y-coord of enemy
            if (priority)
                this.prioritySignalQueue.enqueue({ signal: hash, dist: norm(shift) });
            else
                this.signalQueue.enqueue({ signal: hash, dist: norm(shift) });
        }
    }

    sendSignal() {
        if (this.alreadySignaled) {
            this.log("ERROR! Tried to signal twice in the same turn");
            return;
        }
        if (this.prioritySignalQueue.isEmpty() && this.signalQueue.isEmpty())
            return;

        let message = 0; // will be overwritten
        if (!this.prioritySignalQueue.isEmpty()) {
            if (this.fuel < this.prioritySignalQueue.peek().dist) {
                this.log("Not enough fuel to send message of distance " + this.prioritySignalQueue.peek().dist);
                return; // must save up fuel
            }
            message = this.prioritySignalQueue.dequeue();
        }
        else {
            if (this.fuel < this.signalQueue.peek().dist) {
                this.log("Not enough fuel to send message of distance " + this.signalQueue.peek().dist);
                return; // must save up fuel
            }
            message = this.signalQueue.dequeue();
        }
        this.log("Sending signal " + message.signal);
        this.signal(message.signal, message.dist);
        this.alreadySignaled = true;
    }

    // consider sorting by sqDist if bfsDist is equal, to reduce travel cost
    // need to update all targetKarb for new structure
    initResourceList() {
        this.log("Init Resource List");
        this.targetKarb = [];
        this.targetFuel = [];
        for (let x = 0; x < this.map.length; x++) {
            for (let y = 0; y < this.map.length; y++) {
                if (this.karbonite_map[y][x]) {
                    // this.log(pairToString({x:x, y:y})+" has karb!");
                    if (this.assignedArea[y][x].team === this.me.team) {
                        // this.log(pairToString({x:x, y:y})+" is assinged to my team");
                        this.targetKarb.push({
                            dist: this.assignedArea[y][x].dist,
                            assignedCastle: this.assignedArea[y][x].castle,
                            pos: { x: x, y: y },
                            assignedWorker: -1 // only used for castles, not pilgrims
                        });
                    }
                }
                if (this.fuel_map[y][x]) {
                    if (this.assignedArea[y][x].team === this.me.team) {
                        this.targetFuel.push({
                            dist: this.assignedArea[y][x].dist,
                            assignedCastle: this.assignedArea[y][x].castle,
                            pos: { x: x, y: y },
                            assignedWorker: -1
                        });
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

    karbGoalStatus(goal) {
        let goalReached = true;
        let canHelp = false;
        for (let i = 0; i < Math.min(this.targetKarb.length, goal); i++) {
            if (this.targetKarb[i].assignedWorker === -1) {
                goalReached = false;
                if (this.targetKarb[i].assignedCastle === this.castleNumber)
                    canHelp = true;
            }
        }
        return { reached: goalReached, canHelp: canHelp };
    }

    fuelGoalStatus(goal) {
        let goalReached = true;
        let canHelp = false;
        for (let i = 0; i < Math.min(this.targetFuel.length, goal); i++) {
            if (this.targetFuel[i].assignedWorker === -1) {
                goalReached = false;
                if (this.targetFuel[i].assignedCastle === this.castleNumber)
                    canHelp = true;
            }
        }
        return { reached: goalReached, canHelp: canHelp };
    }

    canMaintainBuffer(unitType) {
        return (this.karbonite - SPECS.UNITS[unitType].CONSTRUCTION_KARBONITE >= this.karbBuffer
            && this.fuel - SPECS.UNITS[unitType].CONSTRUCTION_FUEL >= this.fuelBuffer);
    }

    // for castles only
    // for addNewUnits
    knownID(id) {
        return (this.castles.includes(id) || this.churches.includes(id)
            || this.karbPilgrims.includes(id) || this.fuelPilgrims.includes(id)
            || this.crusaders.includes(id) || this.prophets.includes(id) || this.preachers.includes(id));
    }

    // for castles only
    addNewUnits(visible) {
        for (let i = 0; i < visible.length; i++) {
            let r = visible[i];
            if (r.team === this.me.team && (r.castle_talk >> 7)) {
                if (this.knownID(r.id))
                    continue;
                // newly created robot
                this.log("Notified of a new robot!");
                let message = r.castle_talk;
                let unitType = ((message >> 5) & ((1 << 2) - 1)) + 2;
                if (unitType === SPECS.PILGRIM) {
                    if ((message >> 4) & 1) { // fuel pilgrim
                        this.log("It's a fuel pilgrim with id " + r.id);
                        this.fuelPilgrims.push(r.id);
                        let fuelID = message & ((1 << 4) - 1);
                        this.log("It targets fuel #" + fuelID);
                        this.targetFuel[fuelID].assignedWorker = r.id;
                    }
                    else {
                        this.log("It's a karb pilgrim with id " + r.id);
                        this.karbPilgrims.push(r.id);
                        let karbID = message & ((1 << 4) - 1);
                        this.log("It targets karb #" + karbID);
                        this.targetKarb[karbID].assignedWorker = r.id;
                    }
                }
                else if (unitType === SPECS.CRUSADER) {
                    this.crusaders.push(r.id);
                }
                else if (unitType === SPECS.PROPHET) {
                    this.prophets.push(r.id);
                }
                else if (unitType === SPECS.PREACHER) {
                    this.preachers.push(r.id);
                }
                else {
                    this.log("ERROR! When adding new unit, unitType is invalid");
                }
            }
        }
    }

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
        let updatedKarbPilgrims = [];
        for (let i = 0; i < this.targetKarb.length; i++) {
            let id = this.targetKarb[i].assignedWorker;
            if (id > 0) {
                let stillAlive = false;
                for (let j = 0; j < visible.length; j++) {
                    if (id === visible[j].id) {
                        stillAlive = true;
                    }
                }
                if (stillAlive) {
                    updatedKarbPilgrims.push(id);
                }
                else {
                    this.targetKarb[i].assignedWorker = -1;
                }
            }
        }
        this.karbPilgrims = updatedKarbPilgrims;

        let updatedFuelPilgrims = [];
        for (let i = 0; i < this.targetFuel.length; i++) {
            let id = this.targetFuel[i].assignedWorker;
            if (id > 0) {
                let stillAlive = false;
                for (let j = 0; j < visible.length; j++) {
                    if (id === visible[j].id) {
                        stillAlive = true;
                    }
                }
                if (stillAlive) {
                    updatedFuelPilgrims.push(id);
                }
                else {
                    this.targetFuel[i].assignedWorker = -1;
                }
            }
        }
        this.FuelPilgrims = updatedFuelPilgrims;

        this.updateUnitList(this.churches, visible);
        this.updateUnitList(this.crusaders, visible);
        this.updateUnitList(this.prophets, visible);
        this.updateUnitList(this.preachers, visible);

        // check new units
        this.addNewUnits(visible);

        // add new way of finding newly build churches via pilgrim castleTalk
    }

    // TODO: if new unit gets killed when assignedWorker = 0, need to replace 
    buildKarbPilgrim() {
        // is min necessary when desired is always at most targetKarb.length?
        for (let i = 0; i < Math.min(this.targetKarb.length, this.desiredKarbPilgrims); i++) {
            if (this.targetKarb[i].assignedCastle === this.castleNumber
                && this.targetKarb[i].assignedWorker === -1) {
                // found first needed karb pilgrim
                this.targetKarb[i].assignedWorker = 0; // 0 means pilgrim exists but id unknown

                // make clone instead of reference
                let destination = copyPair(this.targetKarb[i].pos);

                // choose best starting placement around castle
                let minDist = 1000000;
                let bestShift = { x: -100, y: -100 };
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        let shift = { x: dx, y: dy };
                        let pos = addPair(this.loc, shift);
                        if (empty(pos, this.map, this.getVisibleRobotMap())) {
                            if (sqDist(pos, destination) < minDist) {
                                minDist = sqDist(pos, destination);
                                bestShift = shift;
                            }
                        }
                    }
                }

                this.log("Buliding Karb Pilgrim at " + pairToString(addPair(this.loc, bestShift))
                    + " to target karb #" + i + " at " + pairToString(destination));

                this.lastCreated = [SPECS.PILGRIM, bestShift, "karb", i];
                this.queueInitSignal();
                this.sendSignal();
                return this.buildUnit(SPECS.PILGRIM, bestShift.x, bestShift.y);
            }
        }
        this.log("ERROR! Tried to build karb pilgrim when desired number is already reached")
    }

    // TODO: if new unit gets killed when assignedWorker = 0, need to replace 
    buildFuelPilgrim() {
        // is min necessary when desired is always at most targetFuel.length?
        for (let i = 0; i < Math.min(this.targetFuel.length, this.desiredFuelPilgrims); i++) {
            if (this.targetFuel[i].assignedCastle === this.castleNumber
                && this.targetFuel[i].assignedWorker === -1) {
                // found first needed fuel pilgrim
                this.targetFuel[i].assignedWorker = 0; // 0 means pilgrim exists but id unknown

                // make clone instead of reference
                let destination = copyPair(this.targetFuel[i].pos);

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
                    + " to target fuel #" + i + " at " + pairToString(destination));
                let shift = subtractPair(bestPos, this.loc);
                this.lastCreated = [SPECS.PILGRIM, shift, "fuel", i];
                this.queueInitSignal();
                this.sendSignal();
                return this.buildUnit(SPECS.PILGRIM, shift.x, shift.y);
            }
        }
    }

    enoughFuelToMove(chosenMove) {
        return this.fuel >= norm(chosenMove) * SPECS.UNITS[this.me.unit].FUEL_PER_MOVE;
    }

    buildDefenseMage(enemy) { // enemy.relPos is relative position to castle
        this.log("Building defense mage to protect against enemy at "
            + pairToString(addPair(this.loc, enemy.relPos)));
        let minDist = 1000000;
        let bestShift = { x: -100, y: -100 };
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                let shift = { x: dx, y: dy };
                let pos = addPair(this.loc, shift);
                this.log("Considering position " + pairToString(pos));
                if (empty(pos, this.map, this.getVisibleRobotMap())) {
                    this.log("Not empty");
                    if (sqDist(shift, enemy.relPos) < minDist) {
                        this.log("Closest distance so far");
                        bestShift = shift;
                        minDist = sqDist(shift, enemy.relPos);
                    }
                }
            }
        }
        if (pairEq(bestShift, { x: -100, y: -100 })) {
            this.log("Nowhere to place new mage");
            return;
        }
        this.lastCreated = [
            SPECS.PREACHER,
            bestShift,
            "defense",
            (enemy.unitType === SPECS.PROPHET),
            copyPair(enemy.relPos)
        ];
        this.queueInitSignal(true);
        this.sendSignal();
        return this.buildUnit(SPECS.PREACHER, bestShift.x, bestShift.y);
    }

    // TODO: replace this.targetMine with mineIDs
    pilgrimInit() {
        this.log("Initializing pilgrim");
        this.findSymmetry();
        this.enemyCastlePos = [];
        for (let i = 0; i < this.castles.length; i++) {
            this.enemyCastlePos.push(this.reflect(this.castlePos[i]));
        }
        this.assignedArea = this.assignAreaToCastles();
        this.initResourceList();
        // this.log("Target karb right after initializing it");
        // this.log(this.targetKarb);
        if (this.targetResource === "karb") {
            this.targetMine = copyPair(this.targetKarb[this.targetID].pos);
        }
        else {
            this.targetMine = copyPair(this.targetFuel[this.targetID].pos);
        }
        this.bfsFromBase = bfs(this.base, this.map);
        // this.log("Original target mine: " + pairToString(this.targetKarb[this.targetID].pos));
        // this.log("Target mine: " + pairToString(this.targetMine));
        this.bfsFromMine = bfs(this.targetMine, this.map);

        this.avoidMinesMap = [];
        for (let x = 0; x < this.map.length; x++)
            this.avoidMinesMap.push(new Array(this.map.length));
        for (let x = 0; x < this.map.length; x++) {
            for (let y = 0; y < this.map.length; y++) {
                // must be passable with no mine, except for personal mine
                this.avoidMinesMap[y][x] = (this.map[y][x] && !this.karbonite_map[y][x] && !this.fuel_map[y][x]);
                if (pairEq(this.targetMine, { x: x, y: y }))
                    this.avoidMinesMap[y][x] = true;
            }
        }
        this.avoidMinesBaseBFS = fullBFS(this.base, this.avoidMinesMap, SPECS.UNITS[this.me.unit].SPEED, true);
        this.avoidMinesResourceBFS = fullBFS(this.targetMine, this.avoidMinesMap, SPECS.UNITS[this.me.unit].SPEED);
        this.log("I am a pilgrim that just got initialized");
        this.log("Target Resource: " + this.targetResource);
        this.log("Base castle: " + pairToString(this.base));
        this.log("Target Mine: " + pairToString(this.targetMine));
        this.log("All target karb:");
        this.log(this.targetKarb);
    }

    hasUnit(x, y, unitType) {
        if (x < 0 || y < 0 || x >= this.map.length || y >= this.map.length)
            return false;
        if (this.getVisibleRobotMap()[y][x] > 0) {
            let r = this.getRobot(this.getVisibleRobotMap()[y][x]);
            if (r.team === this.me.team && r.unit === unitType)
                return true;
        }
        return false;
    }

    pilgrimDontDoNothing() {
        this.log("Trying to not do nothing");
        // if (this.karbonite_map[this.loc.y][this.loc.x]){
        //     this.log("I'm standing on a karb mine!");
        // }
        // if (this.fuel_map[this.loc.y][this.loc.x]) {
        //     this.log("I'm standing on a fuel mine!");
        //     if (this.me.fuel < SPECS.UNITS[this.me.unit].FUEL_CAPACITY)
        //         this.log("I'm not carrying my max fuel, so I should mine it");
        //     if (this.fuel >= SPECS.MINE_FUEL_COST) 
        //         this.log("My team has enough fuel for me to use this.mine()");
        // }
        if (this.karbonite_map[this.loc.y][this.loc.x]
            && this.me.karbonite < SPECS.UNITS[this.me.unit].KARBONITE_CAPACITY
            && this.fuel >= SPECS.MINE_FUEL_COST) {
            this.lastMoveNothing = false;
            this.log("Mining random karb mine");
            if (this.state !== "waiting for castle locations" && this.targetResource === "karb") {
                if (this.me.karbonite + SPECS.KARBONITE_YIELD >= SPECS.UNITS[this.me.unit].KARBONITE_CAPACITY) {
                    // accidentally mined all of target karb from another mine
                    this.state = "going to base";
                }
            }
            return this.mine();
        }
        if (this.fuel_map[this.loc.y][this.loc.x]
            && this.me.fuel < SPECS.UNITS[this.me.unit].FUEL_CAPACITY
            && this.fuel >= SPECS.MINE_FUEL_COST) {
            this.lastMoveNothing = false;
            this.log("Mining random fuel mine");
            if (this.state !== "waiting for castle locations" && this.targetResource === "fuel") {
                if (this.me.fuel + SPECS.FUEL_YIELD >= SPECS.UNITS[this.me.unit].FUEL_CAPACITY) {
                    // accidentally mined all of target fuel from another mine
                    this.state = "going to base";
                }
            }
            return this.mine();
        }
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (this.hasUnit(this.loc.x + dx, this.loc.y + dy, SPECS.CASTLE)
                    || this.hasUnit(this.loc.x + dx, this.loc.y + dy, SPECS.CHURCH)) {
                    if (this.me.karbonite > 0 || this.me.fuel > 0) {
                        this.lastMoveNothing = false;
                        this.log("Depositing resources at random castle/church");
                        return this.give(dx, dy, this.me.karbonite, this.me.fuel);
                    }
                }
            }
        }
        this.lastMoveNothing = true;
        this.log("I wasted my turn");
        return;
    }

    findEnemies(visible) {
        let enemyUnits = [];
        for (let i = 0; i < visible.length; i++) {
            let r = visible[i];
            if (r.team !== this.me.team) {
                enemyUnits.push({ unitType: r.unit, relPos: subtractPair({ x: r.x, y: r.y }, this.loc) });
            }
        }
        return enemyUnits;
    }

    canAttack(pos) {
        return inGrid(pos, this.map.length)
            && sqDist(pos, this.loc) >= SPECS.UNITS[this.me.unit].ATTACK_RADIUS[0]
            && sqDist(pos, this.loc) <= SPECS.UNITS[this.me.unit].ATTACK_RADIUS[1];
    }

    turn() {
        this.log("START TURN " + this.me.turn);
        this.alreadySignaled = false;
        let visible = this.getVisibleRobots();

        if (this.me.unit === SPECS.PILGRIM) {
            this.loc = { x: this.me.x, y: this.me.y };
            this.log("Pilgrim Position: " + pairToString(this.loc));
            this.log("I have " + this.me.karbonite + " karb and " + this.me.fuel + " fuel");

            if (this.me.turn === 1) {
                this.receivedFirstMessage = false;
                this.state = "waiting for init messages";
            }

            if (this.state === "waiting for init messages") {
                this.log("Pilgrim state: " + this.state);
                let receivedMessage = false;
                for (let i = 0; i < visible.length; i++) {
                    let r = visible[i];
                    if (r.team === this.me.team && r.unit === SPECS.CASTLE && this.isRadioing(r)) {
                        let hash = r.signal;
                        if (hash >> 15) {
                            let shiftHash = (hash >> 12) & ((1 << 3) - 1);
                            let shift = unhashShift(shiftHash);
                            if (pairEq(subtractPair(this.loc, { x: r.x, y: r.y }), shift)) {
                                // signal is meant for me!
                                this.log("I got a message!");
                                receivedMessage = true;
                                if (!this.receivedFirstMessage) {
                                    this.log("This is my first message");
                                    this.receivedFirstMessage = true;

                                    this.castles = new Array((hash >> 10) & ((1 << 2) - 1));
                                    this.castlePos = new Array(this.castles.length);
                                    this.baseCastleNumber = ((hash >> 8) & ((1 << 2) - 1)) - 1;
                                    this.castles[this.baseCastleNumber] = r.id;
                                    this.castlePos[this.baseCastleNumber] = { x: r.x, y: r.y };

                                    this.log("Known castle locations:");
                                    this.log(this.castlePos);

                                    this.base = { x: r.x, y: r.y };
                                    this.churches = new Array((hash >> 6) & ((1 << 2) - 1));
                                    if (hash & (1 << 4))
                                        this.targetResource = "fuel";
                                    else
                                        this.targetResource = "karb";
                                    this.targetID = hash & ((1 << 4) - 1);

                                    // let other castles know that you're a newly created robot
                                    // 7th bit shows that you're new, 5-6 shows your type, 0-4 shows your job
                                    this.castleTalk((1 << 7) | ((this.me.unit - 2) << 5) | (hash & ((1 << 5) - 1)));

                                    if (this.castles.length === 1) {
                                        this.pilgrimInit();
                                        this.state = "going to mine"; // can start moving on the same turn
                                    }
                                    else {
                                        this.log("Must wait for more init messages");
                                        return this.pilgrimDontDoNothing();
                                    }
                                }
                                else {
                                    for (let j = 0; j < this.castles.length; j++) {
                                        if (this.castles[j] === undefined) {
                                            this.castles[j] = r.id;
                                            this.castlePos[j] = { x: (r.signal >> 6) & ((1 << 6) - 1), y: r.signal & ((1 << 6) - 1) };
                                            break;
                                        }
                                    }
                                    this.log("Known castle locations:");
                                    this.log(this.castlePos);

                                    for (let j = 0; j < this.castles.length; j++) {
                                        if (this.castles[j] === undefined) {
                                            this.log("Must wait for more init messages");
                                            return this.pilgrimDontDoNothing();
                                        }
                                    }
                                    this.pilgrimInit();
                                    this.state = "going to mine"; // can start moving on the same turn
                                }
                            }
                        }
                    }
                }
                if (!receivedMessage) {
                    this.log("No message received, state is still " + this.state);
                    return this.pilgrimDontDoNothing();
                }
            }

            if (this.state === "going to mine") {
                this.log("Pilgrim state: " + this.state);
                if (pairEq(this.loc, this.targetMine)) {
                    this.state = "mining"; // can start mining on the same turn
                    this.log("Already arrived at mine, state changed to " + this.state);
                }
                else {
                    let chosenMove = move(this.loc, this.bfsFromMine, this.map, this.getVisibleRobotMap(), SPECS.UNITS[this.me.unit].SPEED);
                    this.log("Move: " + pairToString(chosenMove));
                    if (pairEq(chosenMove, { x: 0, y: 0 })) {
                        this.lastMoveNothing = true; // stuck
                        // let fullBFS = fullBFS(this.base, this.avoidMinesMap, SPECS.UNITS[this.me.unit].SPEED);
                        chosenMove = move(this.loc)
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
                if (this.fuel >= SPECS.MINE_FUEL_COST) {
                    this.lastMoveNothing = false;
                    if (this.targetResource === "karb") {
                        if (this.me.karbonite + SPECS.KARBONITE_YIELD >= SPECS.UNITS[this.me.unit].KARBONITE_CAPACITY) {
                            this.log("Storage will be full next round, swiching state to go to base");
                            this.state = "going to base";
                        }
                    }
                    else {
                        this.log("Mining my target fuel");
                        if (this.me.fuel + SPECS.FUEL_YIELD >= SPECS.UNITS[this.me.unit].FUEL_CAPACITY) {
                            this.log("Storage will be full next round, swiching state to go to base");
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
                    this.log("Already arrived at base, state switching to " + this.state);
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
                        if (sqDist(addPair(this.loc, chosenMove), this.base) <= 2 && this.enoughFuelToMove(chosenMove)) {
                            this.state = "depositing";
                            this.log("Will arrive at base next turn, state switching to " + this.state);
                        }
                        return this.move(chosenMove.x, chosenMove.y);
                    }
                }
            }

            if (this.state === "depositing") {
                this.log("Pilgrim state: " + this.state);
                if (this.me.karbonite > 0 || this.me.fuel > 0) {
                    this.log("Depositing resources at base");
                    this.lastMoveNothing = false;
                    this.state = "going to mine";
                    this.log("State for next round changed to " + this.state);
                    return this.give(this.base.x - this.loc.x, this.base.y - this.loc.y, this.me.karbonite, this.me.fuel);
                }
                else {
                    this.log("ERROR! pilgrim was in state deposit without any resources");
                    this.state = "going to mine";
                    return this.pilgrimDontDoNothing();
                }
            }

            this.log("ERROR! this is the end of pilgrim's turn(), it shouldn't get this far");
            return this.pilgrimDontDoNothing();
        }
        else if (this.me.unit === SPECS.CASTLE) {
            this.loc = { x: this.me.x, y: this.me.y }; // change to let loc
            this.log("Castle Position: " + pairToString(this.loc));

            if (this.me.turn === 1) {
                this.castles = [];
                this.castlePos = [];
                this.churches = [];
                for (let i = 0; i < visible.length; i++) {
                    let r = visible[i];
                    if (r.team === this.me.team) { // cannot check r.unit === SPECS.CASTLE because r.unit is undefined when r is not visible
                        this.castles.push(-1);
                        this.castlePos.push({ x: -1, y: -1 });
                    }
                }
                this.castleNumber = 0;
                for (let i = 0; i < visible.length; i++) {
                    let r = visible[i];
                    if (r.team === this.me.team && r.id !== this.me.id) {
                        if ((r.castle_talk >> 6) !== 0) {
                            let rCastleNumber = (r.castle_talk >> 6) - 1;
                            this.castles[rCastleNumber] = r.id;
                            this.castlePos[rCastleNumber].x = r.castle_talk & ((1 << 6) - 1);
                            this.castleNumber++;
                        }
                    }
                }
                this.castles[this.castleNumber] = this.me.id;
                this.castlePos[this.castleNumber] = { x: this.me.x, y: this.me.y };
                this.castleTalk(((this.castleNumber + 1) << 6) + this.me.x);

                // other init things
                this.lastCreated = null;
                this.prioritySignalQueue = new Queue();
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
                                this.castlePos[rCastleNumber].y = r.castle_talk & ((1 << 6) - 1);
                            }
                            else { // r's first signal is x coordinate
                                this.castles[rCastleNumber] = r.id;
                                this.castlePos[rCastleNumber].x = r.castle_talk & ((1 << 6) - 1);
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
                                this.castlePos[rCastleNumber].y = r.castle_talk & ((1 << 6) - 1);
                            }
                        }
                    }
                }

                this.log("I am castle number #" + this.castleNumber);
                // this.log("Castles IDs:");
                // this.log(this.castles);
                // this.log("is ID 438 new? " + this.isNewID(438));
                // this.log("Found castle positions");
                // this.log(this.castlePos);

                this.findSymmetry();
                this.enemyCastlePos = [];
                for (let i = 0; i < this.castles.length; i++) {
                    this.enemyCastlePos.push(this.reflect(this.castlePos[i]));
                }

                this.maxKarbPilgrims = 16;
                this.maxFuelPilgrims = 16;

                this.assignedArea = this.assignAreaToCastles();
                this.initResourceList();

                // this.log("Target karb:");
                // for (let i = 0; i<this.targetKarb.length; i++){
                //     this.log(JSON.stringify(this.targetKarb[i]));
                // }
                // this.log("Target fuel:");
                // for (let i = 0; i<this.targetFuel.length; i++){
                //     this.log(JSON.stringify(this.targetFuel[i]));
                // }

                this.churches = [];
                this.karbPilgrims = [];
                this.fuelPilgrims = [];
                this.crusaders = [];
                this.prophets = []; // rangers
                this.preachers = []; // mages/tanks

                this.desiredKarbPilgrims = Math.min(4, this.targetKarb.length);
                this.desiredFuelPilgrims = Math.min(4, this.targetFuel.length);
                this.karbBuffer = 60; // TODO: make it dynamic
                this.fuelBuffer = 300; // TODO: make it dynamic
            }

            this.updateAllUnitLists(visible);

            let karbGoal = this.karbGoalStatus(this.desiredKarbPilgrims);
            let fuelGoal = this.fuelGoalStatus(this.desiredFuelPilgrims);
            let visibleEnemies = this.findEnemies(visible);
            this.log("Karb goal: " + JSON.stringify(karbGoal));
            this.log("Fuel goal: " + JSON.stringify(fuelGoal));

            this.log(visibleEnemies);

            if (this.hasSpaceAround()) {
                if (visibleEnemies.length > 0) {
                    this.log("Under attack!");
                    visibleEnemies.sort(compareDist);
                    if (this.canBuild(SPECS.PREACHER)) {
                        return this.buildDefenseMage(visibleEnemies[0]);
                    }
                }
                else if (!karbGoal.reached) {
                    if (karbGoal.canHelp && this.canMaintainBuffer(SPECS.PILGRIM)) {
                        return this.buildKarbPilgrim();
                    }
                    else {
                        // wait for other castle to do it, if !canHelp
                        // or if it's my job, prioritize safety buffer
                        this.sendSignal();
                        return;
                    }
                }
                else if (!fuelGoal.reached) {
                    if (fuelGoal.canHelp && this.canMaintainBuffer(SPECS.PILGRIM)) {
                        return this.buildFuelPilgrim();
                    }
                    else {
                        // wait for other castle to do it, if !canHelp
                        // or if it's my job, prioritize safety buffer
                        this.sendSignal();
                        return;
                    }
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
            // this.log("Current number of karb pilgrims: " + this.karbPilgrims.length);
            // this.log("Current number of fuel pilgrims: " + this.fuelPilgrims.length);

            this.sendSignal();
        }
        else if (this.me.unit === SPECS.PREACHER) {
            this.loc = { x: this.me.x, y: this.me.y };
            this.log("Mage Position: " + pairToString(this.loc));

            if (this.me.turn === 1) {
                this.receivedFirstMessage = false;
                this.state = "waiting for init messages";
            }

            if (this.state === "waiting for init messages") {
                this.log("Mage state: " + this.state);
                let receivedMessage = false;
                for (let i = 0; i < visible.length; i++) {
                    let r = visible[i];
                    if (r.team === this.me.team && r.unit === SPECS.CASTLE && this.isRadioing(r)) {
                        let hash = r.signal;
                        if (hash >> 15) {
                            let shiftHash = (hash >> 12) & ((1 << 3) - 1);
                            let shift = unhashShift(shiftHash);
                            if (pairEq(subtractPair(this.loc, { x: r.x, y: r.y }), shift)) {
                                // signal is meant for me!
                                this.log("I got a message!");
                                receivedMessage = true;

                                this.baseCastle = { x: r.x, y: r.y };
                                this.bfsFromBase = bfs(this.baseCastle, this.map);

                                if ((hash >> 11) & 1) {
                                    this.state = "defense";
                                    if ((hash >> 10) & 1)
                                        this.maxAdvanceSpeed = 4;
                                    else
                                        this.maxAdvanceSpeed = 2;
                                    let enemyShiftX = ((hash >> 5) & ((1 << 5) - 1)) - 16;
                                    let enemyShiftY = (hash & ((1 << 5) - 1)) - 16;
                                    this.enemy = addPair(this.baseCastle, { x: enemyShiftX, y: enemyShiftY });
                                    this.bfsFromEnemy = bfs(this.enemy, this.map);
                                    this.log("I'm a defense mage that just got initialized");
                                    this.log("Base castle: " + pairToString(this.baseCastle));
                                    this.log("Heading to enemy at " + pairToString(this.enemy));
                                }
                                else {
                                    this.state = "attack";
                                    this.findSymmetry();
                                    this.enemyCastle = this.reflect(this.baseCastle);
                                    this.bfsFromEnemy = bfs(this.enemyCastle, this.map);
                                    this.log("I'm an attack mage that just got initialized");
                                    this.log("Base castle: " + pairToString(this.baseCastle));
                                    this.log("Heading to enemy at " + pairToString(this.enemyCastle));
                                }
                            }
                        }
                    }
                }
                if (!receivedMessage) {
                    this.log("No message received, state is still " + this.state);
                }
            }

            let visibleMap = this.getVisibleRobotMap();
            if (this.findEnemies(visible).length > 0) {
                this.log("Mage sees enemies!");
                let bestShift = { x: -100, y: -100 };
                let maxHits = -100;
                let closestHit = 100;
                for (let dx = -4; dx <= 4; dx++) {
                    for (let dy = -4; dy <= 4; dy++) {
                        let shift = { x: dx, y: dy };
                        let targetSquare = addPair(this.loc, shift);
                        if (!this.canAttack(targetSquare))
                            continue;
                        // calculate splash result
                        let hits = 0;
                        let closestDist = 100;
                        for (let dx2 = -1; dx2 <= 1; dx2++) {
                            for (let dy2 = -1; dy2 <= 1; dy2++) {
                                let splashed = addPair(targetSquare, { x: dx2, y: dy2 });
                                if (!inGrid(splashed, this.map.length))
                                    continue;
                                let id = visibleMap[splashed.y][splashed.x];
                                if (id > 0) {
                                    if (this.getRobot(id).team !== this.me.team) {
                                        hits++;
                                        closestDist = Math.min(closestDist, norm({ x: dx + dx2, y: dy + dy2 }));
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
                this.log("Attacking " + pairToString(addPair(this.loc, bestShift)));
                return this.attack(bestShift.x, bestShift.y);
            }

            if (this.state === "defense") {
                let chosenMove = move(this.loc, this.bfsFromEnemy, this.map, this.getVisibleRobotMap(), this.maxAdvanceSpeed);
                this.log("Move: " + pairToString(chosenMove));
                if (pairEq(addPair(this.loc, chosenMove), this.enemy) && this.enoughFuelToMove(chosenMove))
                    this.state = "returning";
                return this.move(chosenMove.x, chosenMove.y);
            }

            if (this.state === "attack") {
                if (sqDist(this.loc, this.enemyCastle) <= SPECS.UNITS[this.me.unit].VISION_RADIUS
                    && this.getRobot(visibleMap[this.enemyCastle.y][this.enemyCastle.x]).unit !== SPECS.CASTLE) {
                    this.log("Don't see an enemy castle in the expected location, must have been killed");
                    this.state = "returning";
                }
                let chosenMove = move(this.loc, this.bfsFromEnemyCastle, this.map, this.getVisibleRobotMap(), SPECS.UNITS[this.me.unit].SPEED);
                this.log("Move: " + pairToString(chosenMove));
                if (sqDist(addPair(this.loc, chosenMove), this.enemyCastle) && this.enoughFuelToMove(chosenMove))
                    this.state = "returning";
                return this.move(chosenMove.x, chosenMove.y);
            }

            if (this.state === "returning") {
                let chosenMove = move(this.loc, this.bfsFromBase, this.map, this.getVisibleRobotMap(), SPECS.UNITS[this.me.unit].SPEED); // slow retreat
                this.log("Move: " + pairToString(chosenMove));
                if (sqDist(addPair(this.loc, chosenMove), this.baseCastle) <= 16 && this.enoughFuelToMove(chosenMove))
                    this.state = "waiting";
                return this.move(chosenMove.x, chosenMove.y);
            }
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
