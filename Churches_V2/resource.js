import { BCAbstractRobot, SPECS } from 'battlecode';
import nav from './nav.js';
import util from './util.js';

const resource = {};

// main function
resource.mainInit = (self) => {
    resource.initFullResourceList(self);
    resource.splitIntoClusters(self);
    for (let i = 0; i < self.clusters.length; i++) {
        resource.computeChurchPosition(self, self.clusters[i]);
        // self.log("Before sort:");
        // self.log(self.clusters[i].mines);
        // self.log("Church position: " + util.pairToString(self.clusters[i].churchPos));
        self.clusters[i].mines.sort(resource.sortMinesByChurchDist(self, self.clusters[i].churchPos));
        // self.log("After sort:");
        // self.log(self.clusters[i].mines);
        resource.splitByResource(self, self.clusters[i]);
    }
    resource.assignClusterIDs(self);
    if (self.me.unit === SPECS.CASTLE) {
        resource.findCastleClusters(self);
        for (let i = 0; i < self.clusters.length; i++) {
            resource.findClosestCastle(self, self.clusters[i]);
            resource.computePriority(self, self.clusters[i]);
        }
        self.clusters.sort(resource.sortByPriority);
        self.log("Clusters sorted by priority:");
        for (let i = 0; i < self.clusters.length; i++) {
            self.log(util.pairToString(self.clusters[i].churchPos) + " has priority " + self.clusters[i].priority);
        }
        self.clusterIDtoIndex = new Array(self.clusters.length);
        for (let i = 0; i < self.clusters.length; i++) {
            self.clusterIDtoIndex[self.clusters[i].id] = i;
        }
    }
    // self.log("Finished making clusters!");
    // for (let i = 0; i < self.clusters.length; i++)
    //     self.log(self.clusters[i]);
}

resource.initFullResourceList = (self) => {
    self.allResources = [];
    self.totalKarb = 0;
    self.totalFuel = 0;
    for (let x = 0; x < self.map.length; x++) {
        for (let y = 0; y < self.map.length; y++) {
            if (self.karbonite_map[y][x]) {
                self.allResources.push({ type: 0, pos: { x: x, y: y }, clusterID: -1 });
                self.totalKarb++;
            }
            else if (self.fuel_map[y][x]) {
                self.allResources.push({ type: 1, pos: { x: x, y: y }, clusterID: -1 });
                self.totalFuel++;
            }
        }
    }
    // self.log("self.allResources");
    // for (let i = 0; i < self.allResources.length; i++) {
    //     self.log("self.allResources[" + i + "].pos = " + util.pairToString(self.allResources[i].pos));
    // }
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
        // self.log("New Cluster!");
        for (let j = 0; j < connectedComponent.length; j++) {
            inCluster[connectedComponent[j]] = true;
            // self.log(util.pairToString(self.allResources[connectedComponent[j]].pos));
        }
        self.clusters.push({
            mines: connectedComponent,
            castle: 0,
            churchPos: { x: -1, y: -1 },
            karb: [],
            fuel: [],
            id: -1,
            closestCastle: { castleID: -1, avgDist: 0, enemyCastleID: -1, avgEnemyDist: 0 },
            priority: -1
        });
    }
}

// TODO: take sum of sqDist to break extra time ties, to estimate fuel cost
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
    // self.log("minX = " + minX + ", maxX = " + maxX + ", minY = " + minY + ", maxY = " + maxY);

    let smallMap = new Array(maxY - minY + 1);
    let smallAvoidMinesMap = new Array(maxY - minY + 1);
    let adjacentMines = new Array(maxY - minY + 1);
    let extraTime = new Array(maxY - minY + 1);
    // let bfs = [];
    for (let i = 0; i <= maxY - minY; i++) {
        smallMap[i] = new Array(maxX - minX + 1);
        smallAvoidMinesMap[i] = new Array(maxX - minX + 1);
        adjacentMines[i] = new Array(maxX - minX + 1).fill(0);
        extraTime[i] = new Array(maxX - minX + 1).fill(0);
        // bfs.push(new Array(maxX - minX + 1));
    }

    for (let x = 0; x <= maxX - minX; x++) {
        for (let y = 0; y <= maxY - minY; y++) {
            smallMap[y][x] = self.map[y + minY][x + minX]; // TODO: pilgrims avoid all mines except their own
            smallAvoidMinesMap[y][x] = self.avoidMinesMap[y + minY][x + minX];
        }
    }

    let foundChurch = false;
    let maxAdjacentMines = -1;
    for (let x = 0; x <= maxX - minX; x++) {
        for (let y = 0; y <= maxY - minY; y++) {
            if (smallAvoidMinesMap[y][x]) {
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
        // self.log("Cluster:");
        // self.log(cluster);
        // self.log("minX = " + minX + ", maxX = " + maxX + ", minY = " + minY + ", maxY = " + maxY);
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
    let minDistSum = 1000000;
    for (let x = 0; x <= maxX - minX; x++) {
        for (let y = 0; y <= maxY - minY; y++) {
            if (smallAvoidMinesMap[y][x] && adjacentMines[y][x] >= maxAdjacentMines - 1) {
                let bfs = nav.fullBFS({ x: x, y: y }, smallMap, SPECS.UNITS[SPECS.PILGRIM].SPEED, true);
                // calculate nunber of extra turns needed
                // self.log("Considering church position " + util.pairToString({ x: x + minX, y: y + minY }));
                let extraTime = 0;
                for (let i = 0; i < cluster.mines.length; i++) {
                    extraTime += bfs[self.allResources[cluster.mines[i]].pos.y - minY][self.allResources[cluster.mines[i]].pos.x - minX];
                }
                // self.log("Extra time = " + extraTime);
                if (extraTime <= minExtraTime) {
                    let distSum = 0;
                    for (let i = 0; i < cluster.mines.length; i++) {
                        distSum += util.sqDist({ x: x + minX, y: y + minY }, self.allResources[cluster.mines[i]].pos);
                    }
                    if (extraTime < minExtraTime || distSum < minDistSum) {
                        cluster.churchPos = { x: x + minX, y: y + minY };
                        minExtraTime = extraTime;
                        minDistSum = distSum;
                    }
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
    let minDist = 1000000;
    let minEnemyDist = 1000000;
    for (let i = 0; i < self.castlePos.length; i++) {
        if (util.sqDist(cluster.churchPos, self.castlePos[i]) < minDist) {
            cluster.closestCastle.castleID = i;
            minDist = util.sqDist(cluster.churchPos, self.castlePos[i]);
        }
        cluster.closestCastle.avgDist += Math.pow(util.sqDist(cluster.churchPos, self.castlePos[i]), 0.5) / self.castlePos.length;
    }
    for (let i = 0; i < self.enemyCastlePos.length; i++) {
        if (util.sqDist(cluster.churchPos, self.enemyCastlePos[i]) < minEnemyDist) {
            cluster.closestCastle.enemyCastleID = i;
            minEnemyDist = util.sqDist(cluster.churchPos, self.enemyCastlePos[i]);
        }
        cluster.closestCastle.avgEnemyDist += Math.pow(util.sqDist(cluster.churchPos, self.enemyCastlePos[i]), 0.5) / self.enemyCastlePos.length;
    }
    // self.log("Average dist of " + util.pairToString(cluster.churchPos) + " is " + cluster.avgDist);
    // self.log("Average enemy dist of " + util.pairToString(cluster.churchPos) + " is " + cluster.avgEnemyDist);
}

// for castles only
// TODO: tune weights
resource.computePriority = (self, cluster) => {
    let resources = 2 * cluster.karb.length / self.totalKarb + cluster.fuel.length / self.totalFuel; // multiply by # of clusters?
    let castleDistance = (-1.2 * Math.pow(cluster.closestCastle.avgDist, 0.5) + Math.pow(cluster.closestCastle.avgEnemyDist, 0.5)) / Math.pow(self.map.length, 0.5);
    cluster.priority = 1.8 * resources + castleDistance;
}

// for castles only
resource.sortByPriority = (a, b) => {
    return b.priority - a.priority;
    // if (Math.sign(a.castle) !== Math.sign(b.castle))
    //     return Math.sign(b.castle) - Math.sign(a.castle);
    // if (a.priority !== b.priority)
    //     return b.priority - a.priority;
    // if (a.churchPos.x !== b.churchPos.x)
    //     return a.churchPos.x - b.churchPos.x;
    // if (a.churchPos.y !== b.churchPos.y)
    //     return a.churchPos.y - b.churchPos.y;
}

resource.sortMinesByChurchDist = (self, churchPos) => {
    return function (a, b) {
        return util.sqDist(self.allResources[a].pos, churchPos) - util.sqDist(self.allResources[b].pos, churchPos);
    };
}

export default resource;