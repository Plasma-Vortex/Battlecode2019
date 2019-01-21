import { BCAbstractRobot, SPECS } from 'battlecode';

import castle from './castle.js';
import church from './church.js';
import pilgrim from './pilgrim.js';
import crusader from './crusader.js';
import prophet from './prophet.js';
import preacher from './preacher.js';

// clear && bc19compile -d Churches_V2 -o debug.js -f && bc19run --bc debug.js --rc debug.js
// 3 castle test seed: 1505486586
// times out: 1909424986 (pilgrim bfs)
// only makes two pilgrims: 1298989386. Distance of mines from you and enemy are equal because pilgrim jump is ignored.
// Good eco teams: big red battlecode, oak's last disciple, vvvvv, knights of cowmelot, deus vult, panda lovers

class MyRobot extends BCAbstractRobot {
    constructor() {
        super();
        this.type = undefined;
    }

    turn() {
        this.log("=========================================");
        this.log("Start turn " + this.me.turn);
        this.log("Time remaining: " + this.me.time);
        this.visible = this.getVisibleRobots();
        this.robotMap = this.getVisibleRobotMap();
        this.alreadySignaled = false;
        this.loc = { x: this.me.x, y: this.me.y };

        if (this.type === undefined) {
            if (this.me.unit === SPECS.CASTLE)
                this.type = castle;
            else if (this.me.unit === SPECS.CHURCH)
                this.type = church;
            else if (this.me.unit === SPECS.PILGRIM)
                this.type = pilgrim;
            else if (this.me.unit === SPECS.CRUSADER)
                this.type = crusader;
            else if (this.type === SPECS.PROPHET)
                this.type = prophet;
            else if (this.me.unit === SPECS.PREACHER)
                this.type = preacher;
        }
        return this.type.takeTurn(this);
    }
}

// is this needed?
var robot = new MyRobot();