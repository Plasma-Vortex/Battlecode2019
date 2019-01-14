from battlecode import BCAbstractRobot, SPECS
import battlecode as bc
import random
import nav
from queue import Queue

__pragma__('iconv')
__pragma__('tconv')
__pragma__('opov')

# don't try to use global variables!!
class MyRobot(BCAbstractRobot):

    base = None
    destination = None
    step = -1
    castleList = []
    churchList = []

    def canBuild(self, unitType):
        return self.karbonite >= SPECS['UNITS'][unitType]['CONSTRUCTION_KARBONITE'] and self.fuel >= SPECS['UNITS'][unitType]['CONSTRUCTION_FUEL']

    def addPair(self, a, b):
        return (a[0]+b[0], a[1]+b[1])

    def turn(self):
        self.step += 1

        if self.me['unit'] == SPECS['PILGRIM']:
            self.log("Pilgrim health: " + str(self.me['health']))

            visible = self.get_visible_robots()
            for r in visible:
                if r.unit == SPECS['CASTLE']:
                    if (r.x, r.y) not in self.castleList:
                        self.castleList.append((r.x, r.y))
                elif r.unit == SPECS['CHURCH']:
                    if (r.x, r.y) not in self.churchList:
                        self.churchList.append((r.x, r.y))

            # The directions: North, NorthEast, East, SouthEast, South, SouthWest, West, NorthWest
            loc = (self.me['x'], self.me['y'])
            if not self.destination or loc == self.destination:
                # Choose a new destination
                if self.karbonite < SPECS['UNITS'][self.me['unit']]['KARBONITE_CAPACITY']:
                    self.destination = nav.findClosestKarbonite(loc, self.karbonite_map)
                elif self.fuel < SPECS['UNITS'][self.me['unit']]['FUEL_CAPACITY']:
                    self.destination = nav.findClosestFuel(loc, self.fuel_map)
                else:
                    self.destination = nav.findClosest(loc, self.castleList + self.churchList)
            self.log("Pilgrim destination: " + str(self.destination))
            move1 = nav.move(loc, self.destination, self.map, self.get_visible_robot_map())
            move2 = nav.move(self.addPair(loc, move1), self.destination, self.map, self.get_visible_robot_map())
            move = self.addPair(move1, move2)
            self.log("Move: " + str(move))
            return self.move(*move)

        elif self.me['unit'] == SPECS['CASTLE']:
            if self.canBuild(SPECS['PILGRIM']):
                self.log("Building a pilgrim at " + str(self.me['x']+1) + ", " + str(self.me['y']+1))
                return self.build_unit(SPECS['PILGRIM'], 1, 1)
            else:
                self.log("Castle health: " + self.me['health'])

robot = MyRobot()
