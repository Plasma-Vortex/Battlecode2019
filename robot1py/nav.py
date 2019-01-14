from queue import Queue

def empty(x, y, map, nearbyRobots):
    if x < 0 or y < 0 or x >= len(map) or y >= len(map):
        return False
    return map[y][x] and nearbyRobots[y][x] <= 0

def move(loc, target, map, nearbyRobots):
    if loc == target:
        return (0,0)
    q = Queue()
    visited = [[False]*len(map) for _ in len(map)]
    # visited = [[(-1,-1)]*len(map) for _ in len(map)]
    q.put(target)
    visited[target[0]][target[1]] = True
    while len(q) > 0:
        v = q.get()
        x, y = v
        for u in [(x+1, y), (x, y+1), (x-1, y), (x, y-1)]:
            if u == loc:
                return (x - u[0], y - u[1])
            elif not visited[u[0]][u[1]] and empty(u[0], u[1], map, nearbyRobots):
                q.put(u)
                visited[u[0]][u[1]] = True
    return (0,0)

def findClosestKarbonite(loc, kmap):
    closest = (-1, -1)
    minDist = 10000
    for x in range(len(kmap)):
        for y in range(len(kmap)):
            if kmap[y][x] and sqDist((x,y), loc) < minDist:
                minDist = sqDist((x,y), loc)
                closest = (x,y)
    return closest

def findClosestFuel(loc, fmap):
    closest = (-1, -1)
    minDist = 10000
    for x in range(len(fmap)):
        for y in range(len(fmap)):
            if fmap[y][x] and sqDist((x,y), loc) < minDist:
                minDist = sqDist((x,y), loc)
                closest = (x,y)
    return closest

def findClosest(loc, positionList):
    closest = (-1, -1)
    minDist = 10000
    for pos in positionList:
        if sqDist(pos, loc) < minDist:
            minDist = sqDist(pos, loc)
            closest = pos
    return closest

def sqDist(p1, p2):
    return (p1[0] - p2[0])**2 + (p1[1] - p2[1])**2
