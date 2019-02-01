import { BCAbstractRobot, SPECS } from 'battlecode';
import Deque from './FastQueue.js';
import util from './util.js';

const nav = {};

// TODO: when stuck, perform full bfs treating robot positions as fixed
nav.bfs = (start, map) => {
    let q = new Deque(512);
    let visited = new Array(map.length);
    let dist = new Array(map.length);
    for (let i = 0; i < map.length; i++) {
        visited[i] = new Array(map[0].length).fill(false);
        dist[i] = new Array(map[0].length).fill(1000000);
    }
    q.push(start);
    visited[start.y][start.x] = true;
    dist[start.y][start.x] = 0;
    while (!q.isEmpty()) {
        let v = q.shift();
        let adj = [[1, 0], [0, 1], [-1, 0], [0, -1]];
        for (let i = 0; i < 4; i++) {
            let u = { x: v.x + adj[i][0], y: v.y + adj[i][1] };
            if (util.empty(u, map) && !visited[u.y][u.x]) {
                q.push(u);
                visited[u.y][u.x] = true;
                dist[u.y][u.x] = dist[v.y][v.x] + 1;
            }
        }
    }
    return dist;
}

nav.fullBFS = (start, map, speed, beside = false) => {
    let q = new Deque(512);
    let visited = new Array(map.length);
    let dist = new Array(map.length);
    for (let i = 0; i < map.length; i++) {
        visited[i] = new Array(map[0].length).fill(false);
        dist[i] = new Array(map[0].length).fill(1000000);
    }
    if (beside) {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0)
                    continue;
                let pos = { x: start.x + dx, y: start.y + dy };
                if (util.empty(pos, map)) {
                    q.push(pos);
                    visited[pos.y][pos.x] = true;
                    dist[pos.y][pos.x] = 0;
                }
            }
        }
    }
    else {
        q.push(start);
        visited[start.y][start.x] = true;
        dist[start.y][start.x] = 0;
    }
    let s = Math.floor(Math.sqrt(speed));
    let shifts = [];
    for (let dx = -s; dx <= s; dx++) {
        for (let dy = -s; dy <= s; dy++) {
            let shift = { x: dx, y: dy };
            if (util.norm(shift) <= speed) {
                shifts.push(shift);
            }
        }
    }
    while (!q.isEmpty()) {
        let v = q.shift();
        for (let i = 0; i < shifts.length; i++) {
            let u = util.addPair(v, shifts[i]);
            if (util.empty(u, map) && !visited[u.y][u.x]) {
                q.push(u);
                visited[u.y][u.x] = true;
                dist[u.y][u.x] = dist[v.y][v.x] + 1;
            }
        }
    }
    return dist;
}

nav.move = (loc, destination, bfsGrid, map, robots, speed, forceMove = false) => {
    let minTime = 1000000;
    let minDist = 1000000;
    let bestMove = { x: 0, y: 0 };
    for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
            let next = { x: loc.x + dx, y: loc.y + dy };
            if (util.sqDist(loc, next) <= speed && (util.empty(next, map, robots) || (dx === 0 && dy === 0 && !forceMove))) {
                // prioritize fast over cost
                if (bfsGrid[next.y][next.x] < minTime || (bfsGrid[next.y][next.x] === minTime && util.sqDist(next, destination) < minDist)) {
                    minTime = bfsGrid[next.y][next.x];
                    minDist = util.sqDist(next, destination);
                    bestMove = { x: dx, y: dy };
                }
            }
        }
    }
    return bestMove;
}

nav.updateNoRobotMap = (self) => {
    let r = Math.ceil(Math.sqrt(SPECS.UNITS[self.me.unit].VISION_RADIUS));
    for (let x = Math.max(0, self.loc.x - r); x <= Math.min(self.map.length - 1, self.loc.x + r); x++) {
        for (let y = Math.max(0, self.loc.y - r); y <= Math.min(self.map.length - 1, self.loc.y + r); y++) {
            if (util.sqDist(self.loc, { x: x, y: y }) <= SPECS.UNITS[self.me.unit].VISION_RADIUS) {
                self.noMineRobotMap[y][x] = self.avoidMinesMap[y][x] && (self.robotMap[y][x] === 0);
            }
        }
    }
}

export default nav;

