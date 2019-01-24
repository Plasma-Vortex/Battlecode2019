import { BCAbstractRobot, SPECS } from 'battlecode';
import nav from './nav.js';
import util from './util.js';

const resource = {};

// will not need
resource.assignAreaToCastles = (self) => {
    let area = [];
    for (let x = 0; x < self.map.length; x++)
        area.push(new Array(self.map.length));
    self.castleBFS = [];
    self.enemyCastleBFS = [];
    for (let i = 0; i < self.castles.length; i++) {
        self.castleBFS.push(nav.bfs(self.castlePos[i], self.map));
        self.enemyCastleBFS.push(nav.bfs(self.enemyCastlePos[i], self.map));
    }
    for (let x = 0; x < self.map.length; x++) {
        for (let y = 0; y < self.map.length; y++) {
            let yourMinDist = 1000000;
            let yourBestCastle = -1;
            for (let i = 0; i < self.castles.length; i++) {
                if (self.castleBFS[i][y][x] < yourMinDist) {
                    yourBestCastle = i;
                    yourMinDist = self.castleBFS[i][y][x];
                }
            }
            let enemyMinDist = 1000000;
            let enemyBestCastle = -1;
            for (let i = 0; i < self.enemyCastlePos.length; i++) {
                if (self.enemyCastleBFS[i][y][x] < enemyMinDist) {
                    enemyBestCastle = i;
                    enemyMinDist = self.enemyCastleBFS[i][y][x];
                }
            }
            if (yourMinDist < enemyMinDist) {
                area[y][x] = { team: self.me.team, castle: yourBestCastle, dist: yourMinDist };
            }
            else if (enemyMinDist < yourMinDist) {
                area[y][x] = { team: self.me.team ^ 1, castle: enemyBestCastle, dist: enemyMinDist }; // combine into -enemyBestCastle?
            }
            else {
                area[y][x] = { team: -1, castle: yourBestCastle, dist: yourMinDist };
            }
        }
    }
    return area;
}

// consider sorting by sqDist if bfsDist is equal, to reduce travel cost
// need to update all targetKarb for new structure
resource.initResourceList = (self) => {
    self.log("Init Resource List");
    self.targetKarb = [];
    self.targetFuel = [];
    for (let x = 0; x < self.map.length; x++) {
        for (let y = 0; y < self.map.length; y++) {
            if (self.karbonite_map[y][x]) {
                // self.log(pairToString({x:x, y:y})+" has karb!");
                if (self.assignedArea[y][x].team === self.me.team) {
                    // self.log(pairToString({x:x, y:y})+" is assinged to my team");
                    self.targetKarb.push({
                        dist: self.assignedArea[y][x].dist,
                        assignedCastle: self.assignedArea[y][x].castle,
                        pos: { x: x, y: y },
                        assignedWorker: -1 // only used for castles, not pilgrims
                    });
                }
            }
            if (self.fuel_map[y][x]) {
                if (self.assignedArea[y][x].team === self.me.team) {
                    self.targetFuel.push({
                        dist: self.assignedArea[y][x].dist,
                        assignedCastle: self.assignedArea[y][x].castle,
                        pos: { x: x, y: y },
                        assignedWorker: -1
                    });
                }
            }
        }
    }

    self.targetKarb.sort(util.customSort);
    self.targetFuel.sort(util.customSort);
    while (self.targetKarb.length > self.maxKarbPilgrims) {
        self.targetKarb.pop();
    }
    while (self.targetFuel.length > self.maxFuelPilgrims) {
        self.targetFuel.pop();
    }
}


// move goals to castle?
resource.karbGoalStatus = (self, goal) => {
    let goalReached = true;
    let canHelp = false;
    for (let i = 0; i < Math.min(self.targetKarb.length, goal); i++) {
        if (self.targetKarb[i].assignedWorker === -1) {
            goalReached = false;
            if (self.targetKarb[i].assignedCastle === self.castleNumber)
                canHelp = true;
        }
    }
    return { reached: goalReached, canHelp: canHelp };
}

// move goals to castle?
resource.fuelGoalStatus = (self, goal) => {
    let goalReached = true;
    let canHelp = false;
    for (let i = 0; i < Math.min(self.targetFuel.length, goal); i++) {
        if (self.targetFuel[i].assignedWorker === -1) {
            goalReached = false;
            if (self.targetFuel[i].assignedCastle === self.castleNumber)
                canHelp = true;
        }
    }
    return { reached: goalReached, canHelp: canHelp };
}

resource.canMaintainBuffer = (self, unitType) => {
    return (self.karbonite - SPECS.UNITS[unitType].CONSTRUCTION_KARBONITE >= self.karbBuffer
        && self.fuel - SPECS.UNITS[unitType].CONSTRUCTION_FUEL >= self.fuelBuffer);
}

// main function
resource.mainInit = (self) => {
    resource.initFullResourceList(self);
    resource.splitIntoClusters(self);
    for (let i = 0; i < self.clusters.length; i++) {
        resource.computeChurchPosition(self, self.clusters[i]);
        self.clusters[i].mines.sort(util.compareDistToPoint(self.clusters[i].churchPos));
        resource.splitByResource(self, self.clusters[i]);
    }
    resource.assignClusterIDs(self);
    if (self.me.unit === SPECS.CASTLE) {
        resource.findCastleClusters(self);
        for (let i = 0; i < self.clusters.length; i++) {
            resource.findClosestCastle(self, self.clusters[i]);
        }
        self.clusters.sort(resource.sortByPriority);
        self.clusterIDtoIndex = new Array(self.clusters.length);
        for (let i = 0; i < self.clusters.length; i++) {
            self.clusterIDtoIndex[self.clusters[i].id] = i;
        }
    }
    self.log("Finished making clusters!");
    for (let i = 0; i < self.clusters.length; i++)
        self.log(self.clusters[i]);
}

resource.initFullResourceList = (self) => {
    self.allResources = [];
    for (let x = 0; x < self.map.length; x++) {
        for (let y = 0; y < self.map.length; y++) {
            if (self.karbonite_map[y][x])
                self.allResources.push({ type: 0, pos: { x: x, y: y }, clusterID: -1 });
            else if (self.fuel_map[y][x])
                self.allResources.push({ type: 1, pos: { x: x, y: y }, clusterID: -1 });
        }
    }
    self.log("self.allResources");
    for (let i = 0; i < self.allResources.length; i++) {
        self.log("self.allResources[" + i + "].pos = " + util.pairToString(self.allResources[i].pos));
    }
}

resource.splitIntoClusters = (self) => {
    self.resourceGraph = new Array(self.allResources.length);
    for (let i = 0; i < self.allResources.length; i++)
        self.resourceGraph[i] = [];
    for (let i = 0; i < self.allResources.length; i++) {
        for (let j = i + 1; j < self.allResources.length; j++) {
            if (util.L1Norm(self.allResources[i].pos, self.allResources[j].pos) <= 6) {
                self.resourceGraph[i].push(j);
                self.resourceGraph[j].push(i);
            }
        }
    }
    let inCluster = new Array(self.allResources.length).fill(false);
    self.clusters = [];
    for (let i = 0; i < self.allResources.length; i++) {
        if (inCluster[i])
            continue;
        let connectedComponent = util.getConnectedComponents(self.resourceGraph, i);
        self.log("New Cluster!");
        for (let j = 0; j < connectedComponent.length; j++) {
            inCluster[connectedComponent[j]] = true;
            self.log(util.pairToString(self.allResources[connectedComponent[j]].pos));
        }
        self.clusters.push({
            mines: connectedComponent,
            castle: 0,
            churchPos: { x: -1, y: -1 },
            karb: [],
            fuel: [],
            id: -1,
            closestCastle: { castleID: -1, dist: -1 }
        });
    }
}

// let allCliques = false;
//     let inClique = new Array(self.allResources.length).fill(false);
//     self.clusters = [];
//     while (!allCliques) {
//         let changed = false;
//         for (let i = 0; i < self.allResources.length; i++) {
//             if (inClique[i])
//                 continue;
//             let connectedComponent = util.getConnectedComponents(self.resourceGraph, i);
//             let thisIsClique = true;
//             for (let j = 0; j < connectedComponent.length; j++) {
//                 if (self.resourceGraph[connectedComponent[j]].length !== connectedComponent.length - 1) {
//                     thisIsClique = false;
//                     let edge = util.removeEdge(self.resourceGraph, connectedComponent);
//                     self.log("Removing edge " + edge[0] + " - " + edge[1]);
//                     if (edge[0] === -1) {
//                         for (let k = 0; k < connectedComponent.length; k++) {
//                             self.log("adj[" + connectedComponent[k] + "]: " + self.resourceGraph[connectedComponent[k]]);
//                         }
//                     }
//                     self.resourceGraph[edge[0]].splice(self.resourceGraph[edge[0]].indexOf(edge[1]), 1); // TODO: move into removeEdge function if logging is not needed
//                     self.resourceGraph[edge[1]].splice(self.resourceGraph[edge[1]].indexOf(edge[0]), 1);
//                     changed = true;
//                     break;
//                 }
//             }
//             if (thisIsClique) {
//                 self.log("New Clique Found!");
//                 for (let j = 0; j < connectedComponent.length; j++) {
//                     inClique[connectedComponent[j]] = true;
//                     self.log(util.pairToString(self.allResources[connectedComponent[j]].pos));
//                 }
//                 self.clusters.push({
//                     mines: connectedComponent,
//                     castle: 0,
//                     churchPos: { x: -1, y: -1 },
//                     karb: [],
//                     fuel: [],
//                     id: -1,
//                     closestCastle: { castleID: -1, dist: -1 }
//                 });
//             }
//             if (changed)
//                 break;
//         }
//         allCliques = true;
//         for (let i = 0; i < inClique.length; i++) {
//             if (!inClique[i])
//                 allCliques = false;
//         }
//     }

resource.computeChurchPosition = (self, cluster) => {
    // if (cluster.hasCastle) // doesn't need a church because it has a castle
    //     return; // might calculate churchPos anyway, to number clusters without castle location knowledge
    let minX = 1000;
    let minY = 1000;
    let maxX = -1000;
    let maxY = -1000;
    for (let i = 0; i < cluster.mines.length; i++) {
        minX = Math.min(minX, self.allResources[cluster.mines[i]].pos.x);
        minY = Math.min(minY, self.allResources[cluster.mines[i]].pos.y);
        maxX = Math.max(maxX, self.allResources[cluster.mines[i]].pos.x);
        maxY = Math.max(maxY, self.allResources[cluster.mines[i]].pos.y);
    }
    minX = Math.max(0, minX - 1);
    minY = Math.max(0, minY - 1);
    maxX = Math.min(self.map.length - 1, maxX + 1);
    maxY = Math.min(self.map.length - 1, maxY + 1);
    self.log("minX = " + minX + ", maxX = " + maxX + ", minY = " + minY + ", maxY = " + maxY);

    let smallMap = [];
    let adjacentMines = [];
    let extraTime = [];
    // let bfs = [];
    for (let i = 0; i <= maxY - minY; i++) {
        smallMap.push(new Array(maxX - minX + 1));
        adjacentMines.push(new Array(maxX - minX + 1).fill(0));
        extraTime.push(new Array(maxX - minX + 1).fill(0));
        // bfs.push(new Array(maxX - minX + 1));
    }

    for (let x = 0; x <= maxX - minX; x++) {
        for (let y = 0; y <= maxY - minY; y++) {
            smallMap[y][x] = self.map[y + minY][x + minX]; // TODO: pilgrims avoid all mines except their own
        }
    }

    let foundChurch = false;
    let maxAdjacentMines = -1;
    for (let x = 0; x <= maxX - minX; x++) {
        for (let y = 0; y <= maxY - minY; y++) {
            if (smallMap[y][x]) {
                foundChurch = true;
                // calculate number of adjacent mines
                for (let i = 0; i < 8; i++) {
                    let p = util.addPair({ x: x + minX, y: y + minY }, util.unhashShift(i));
                    if (util.inGrid(p, self.map) && (self.karbonite_map[p.y][p.x] || self.fuel_map[p.y][p.x]))
                        adjacentMines[y][x]++;
                }
                maxAdjacentMines = Math.max(maxAdjacentMines, adjacentMines[y][x]);
            }
        }
    }
    if (!foundChurch) {
        self.log("ERROR! No possible church location in rectangle");
        self.log("Cluster:");
        self.log(cluster);
        self.log("minX = " + minX + ", maxX = " + maxX + ", minY = " + minY + ", maxY = " + maxY);
    }

    // for pilgrim passing chain

    // for (let x = 0; x <= maxX - minX; x++) {
    //     for (let y = 0; y <= maxY - minY; y++) {
    //         if (adjacentMines[y][x] >= maxAdjacentMines - 1
    //             || self.karbonite_map[y + minY][x + minX] || self.fuel_map[y + minY][x + minX]) {
    //             // bfs might be slow, even when bounded
    //             bfs[y][x] = nav.fullBFS({ x: x, y: y }, smallMap, SPECS.UNITS[SPECS.PILGRIMS].SPEED, true);
    //         }
    //     }
    // }

    let minExtraTime = 1000000;
    for (let x = 0; x <= maxX - minX; x++) {
        for (let y = 0; y <= maxY - minY; y++) {
            if (adjacentMines[y][x] >= maxAdjacentMines - 1) {
                let bfs = nav.fullBFS({ x: x, y: y }, smallMap, SPECS.UNITS[SPECS.PILGRIM].SPEED, true);
                // calculate nunber of extra turns needed
                self.log("Considering church position " + util.pairToString({ x: x + minX, y: y + minY }));
                let extraTime = 0;
                for (let i = 0; i < cluster.mines.length; i++) {
                    extraTime += bfs[self.allResources[cluster.mines[i]].pos.y - minY][self.allResources[cluster.mines[i]].pos.x - minX];
                }
                self.log("Extra time = " + extraTime);
                if (extraTime < minExtraTime) {
                    minExtraTime = extraTime;
                    cluster.churchPos = { x: x + minX, y: y + minY };
                }
            }
        }
    }
}

resource.sortByChurchPos = (a, b) => {
    if (a.churchPos.x !== b.churchPos.x)
        return a.churchPos.x - b.churchPos.x;
    else
        return a.churchPos.y - b.churchPos.y;
}

resource.assignClusterIDs = (self) => {
    self.clusters.sort(resource.sortByChurchPos);
    for (let i = 0; i < self.clusters.length; i++) {
        self.clusters[i].id = i;
        for (let j = 0; j < self.clusters[i].mines.length; j++) {
            self.allResources[self.clusters[i].mines[j]].clusterID = i;
        }
    }
}

// TODO: set church = 2 or church = -1
// for castles only
resource.findCastleClusters = (self) => {
    for (let i = 0; i < self.castlePos.length; i++) {
        let minDist = 1000000;
        let closest = -1;
        for (let j = 0; j < self.allResources.length; j++) {
            if (util.sqDist(self.castlePos[i], self.allResources[j].pos) < minDist) {
                minDist = util.sqDist(self.castlePos[i], self.allResources[j].pos);
                closest = j;
            }
        }
        // Consider specifying which castle?
        // Should add enemy castles too, attack those last
        for (let j = 0; j < self.clusters.length; j++) {
            if (self.clusters[j].mines.includes(closest)) {
                self.clusters[j].castle = i + 1;
                // self.clusters[j].churchPos = util.copyPair(self.castlePos[i]);
            }
        }
    }
    // enemy castles
    for (let i = 0; i < self.enemyCastlePos.length; i++) {
        let minDist = 1000000;
        let closest = -1;
        for (let j = 0; j < self.allResources.length; j++) {
            if (util.sqDist(self.enemyCastlePos[i], self.allResources[j].pos) < minDist) {
                minDist = util.sqDist(self.enemyCastlePos[i], self.allResources[j].pos);
                closest = j;
            }
        }
        // Consider specifying which castle?
        // Should add enemy castles too, attack those last
        for (let j = 0; j < self.clusters.length; j++) {
            if (self.clusters[j].mines.includes(closest)) {
                self.clusters[j].castle = -(i + 1);
                // self.clusters[j].churchPos = util.copyPair(self.castlePos[i]);
            }
        }
    }
}

resource.splitByResource = (self, cluster) => {
    for (let i = 0; i < cluster.mines.length; i++) {
        if (self.allResources[cluster.mines[i]].type === 0) // karb
            cluster.karb.push(cluster.mines[i]);
        else
            cluster.fuel.push(cluster.mines[i]);
    }
}

// for castles only
resource.findClosestCastle = (self, cluster) => {
    cluster.closestCastle.dist = 1000000;
    for (let i = 0; i < self.castlePos.length; i++) {
        if (util.sqDist(cluster.churchPos, self.castlePos[i]) < cluster.closestCastle.dist) {
            cluster.closestCastle.castleID = i;
            cluster.closestCastle.dist = util.sqDist(cluster.churchPos, self.castlePos[i]);
        }
    }
}

// TODO: take distance to enemy castles into account, or distance to center
// for castles only
resource.sortByPriority = (a, b) => {
    if (a.castle !== b.castle)
        return b.castle - a.castle;
    if (a.mines.length !== b.mines.length)
        return b.mines.length - a.mines.length;
    if (a.karb.length !== b.karb.length)
        return b.karb.length - a.karb.length;
    if (a.closestCastle.dist !== b.closestCastle.dist)
        return a.closestCastle.dist - b.closestCastle.dist;
    if (a.churchPos.x !== b.churchPos.x)
        return a.churchPos.x - b.churchPos.x;
    if (a.churchPos.y !== b.churchPos.y)
        return a.churchPos.y - b.churchPos.y;
}

export default resource;