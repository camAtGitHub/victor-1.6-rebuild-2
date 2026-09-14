/**
 * File: snakeGameSolver.cpp
 *
 * Author: ross
 * Created: 2018-02-27
 *
 * Description: greedy solver for the game of snake
 *
 * Copyright: Anki, Inc. 2018
 *
 **/


#include "engine/aiComponent/behaviorComponent/behaviors/victor/snakeGameSolver.h"

#include "engine/aiComponent/behaviorComponent/behaviors/victor/snakeGame.h"
#include "util/logging/logging.h"
#include "util/random/randomGenerator.h"

#include <algorithm>
#include <list>
#include <vector>

namespace Anki {
namespace Vector {

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
SnakeGameSolver::SnakeGameSolver( SnakeGame& game,
                                  float probMistakesFlat,
                                  float probMistakesPerLength,
                                  float probWrongTurnsFlat,
                                  const Util::RandomGenerator& rng )
  : _game( game )
  , _rng( rng )
  , _pMistakesFlat( probMistakesFlat )
  , _pMistakesPerLength( probMistakesPerLength )
  , _pWrongTurns( probWrongTurnsFlat )
{


}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
SnakeGameSolver::~SnakeGameSolver()
{
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void SnakeGameSolver::ChooseAndApplyMove()
{
  if( _initialLength == 0 ) {
    _initialLength = static_cast<unsigned int>(_game.GetSnake().GetLength());
  }
  DEV_ASSERT( !_game.GameOver(),"" );

  // Greedy snake:
  // 1. Shortest path to food, but only if after eating we can still reach the tail
  //    (otherwise we would box ourselves in).
  // 2. Else the *longest* path to the tail, so we fill space instead of circling
  //    a 1-cell gap forever. (Longify used to be called and its result discarded,
  //    which is exactly the bottom-right "looping after its tail" stall.)
  // 3. Else any neighbour that is not a wall, the body, or a reverse.

  const auto& snake = _game.GetSnake();
  const int width = static_cast<int>(_game.GetWidth());
  const int height = static_cast<int>(_game.GetHeight());

  auto initDirection = _game.GetDirection();
  SnakeGame::Direction direction = initDirection;
  bool hasDirection = false;

  auto opposite = [](SnakeGame::Direction d) {
    switch( d ) {
      case SnakeGame::Direction::UP:    return SnakeGame::Direction::DOWN;
      case SnakeGame::Direction::DOWN:  return SnakeGame::Direction::UP;
      case SnakeGame::Direction::LEFT:  return SnakeGame::Direction::RIGHT;
      case SnakeGame::Direction::RIGHT: return SnakeGame::Direction::LEFT;
    }
    return SnakeGame::Direction::UP;
  };

  auto stepToDirection = [](const SnakeGame::Point& head, const SnakeGame::Point& firstStep) {
    SnakeGame::Direction direction = SnakeGame::Direction::UP;
    if( firstStep.x - head.x == 1 ) {
      direction = SnakeGame::Direction::RIGHT;
    } else if( firstStep.x - head.x == -1 ) {
      direction = SnakeGame::Direction::LEFT;
    } else if( firstStep.y - head.y == 1 ) {
      direction = SnakeGame::Direction::UP;
    } else if( firstStep.y - head.y == -1 ) {
      direction = SnakeGame::Direction::DOWN;
    }
    return direction;
  };

  // Collision is checked BEFORE the tail pops, so every current body cell is lethal
  // this tick — including the tail.
  auto isLethalNow = [&](const SnakeGame::Point& p) {
    if( (p.x < 0) || (p.y < 0) || (p.x >= width) || (p.y >= height) ) {
      return true;
    }
    return snake.IsSnakeAt( static_cast<unsigned int>(p.x), static_cast<unsigned int>(p.y) );
  };

  auto applyFirstStep = [&](const std::vector<SnakeGame::Point>& path) {
    if( path.empty() ) {
      return false;
    }
    const auto& firstStep = path.front();
    if( isLethalNow( firstStep ) ) {
      return false;
    }
    direction = stepToDirection( snake.GetHead(), firstStep );
    return true;
  };

  std::vector<SnakeGame::Point> pathToFood;
  if( BFS( snake.GetHead(), _game.GetFood(), snake, pathToFood ) ) {
    auto snakeCopy = snake;
    for( size_t i = 0; i < pathToFood.size(); ++i ) {
      snakeCopy.body.push_back( pathToFood[i] );
      // last step is the eat: grow, do not pop the tail
      if( i + 1 < pathToFood.size() ) {
        snakeCopy.body.pop_front();
      }
    }

    std::vector<SnakeGame::Point> pathToTail;
    if( BFS( snakeCopy.GetHead(), snakeCopy.GetTail(), snakeCopy, pathToTail) ) {
      hasDirection = applyFirstStep( pathToFood );
    }
  }

  if( !hasDirection ) {
    std::vector<SnakeGame::Point> pathToTail;
    if( BFS( snake.GetHead(), snake.GetTail(), snake, pathToTail) ) {
      pathToTail = Longify( snake, snake.GetHead(), pathToTail );
      hasDirection = applyFirstStep( pathToTail );
    }
  }

  if( !hasDirection ) {
    const SnakeGame::Direction dirs[4] = {
      initDirection,
      (initDirection == SnakeGame::Direction::UP || initDirection == SnakeGame::Direction::DOWN)
        ? SnakeGame::Direction::LEFT : SnakeGame::Direction::UP,
      (initDirection == SnakeGame::Direction::UP || initDirection == SnakeGame::Direction::DOWN)
        ? SnakeGame::Direction::RIGHT : SnakeGame::Direction::DOWN,
      opposite( initDirection )
    };
    for( const auto d : dirs ) {
      if( d == opposite( initDirection ) ) {
        continue;
      }
      if( !isLethalNow( snake.GetNextStep( d ) ) ) {
        direction = d;
        hasDirection = true;
        break;
      }
    }
  }

  // factor in some chance of a mistake or wrong turn, but only into a cell
  // that would not kill us this tick (random reverse-into-neck just looks broken)
  const bool wrongTurn =  (direction != _game.GetDirection()) && (_rng.RandDbl() < _pWrongTurns);
  const float pMistake = _pMistakesFlat + _pMistakesPerLength*(snake.GetLength() - _initialLength);
  const bool wrongMove = (_rng.RandDbl() < pMistake);
  if( (wrongTurn || wrongMove) && hasDirection ) {
    std::vector<SnakeGame::Direction> safeTurns;
    for( int i = 0; i < 4; ++i ) {
      const auto d = static_cast<SnakeGame::Direction>( i );
      if( (d != initDirection) && (d != opposite( initDirection )) && !isLethalNow( snake.GetNextStep( d ) ) ) {
        safeTurns.push_back( d );
      }
    }
    if( !safeTurns.empty() ) {
      direction = safeTurns[ static_cast<size_t>(_rng.RandIntInRange( 0, static_cast<int>(safeTurns.size()) - 1 )) ];
    }
  }

  ASSERT_NAMED(hasDirection, "");
  if( hasDirection ) {
    _game.SetDirection( direction );
  }
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
bool SnakeGameSolver::BFS(const SnakeGame::Point& from,
                          const SnakeGame::Point& to,
                          const SnakeGame::Snake& snake,
                          std::vector<SnakeGame::Point>& path) const
{
  const int width = static_cast<int>(_game.GetWidth());
  const int height = static_cast<int>(_game.GetHeight());
  const int numNodes = width * height;
  if( (from.x < 0) || (from.y < 0) || (from.x >= width) || (from.y >= height)
      || (to.x < 0) || (to.y < 0) || (to.x >= width) || (to.y >= height) ) {
    return false;
  }

  auto sub2ind = [width](const SnakeGame::Point& pt) {
    return (width * pt.y) + pt.x;
  };
  auto ind2sub = [width](int ind) -> SnakeGame::Point {
    return SnakeGame::Point( ind % width, ind / width );
  };

  // body[k] (0 = tail) is still occupied for the first k+1 moves because the
  // game checks collision before popping the tail. Empty cells are 0, so any
  // d >= 1 may enter them.
  std::vector<int> occupiedUntil( numNodes, 0 );
  {
    int k = 0;
    for( const auto& p : snake.body ) {
      if( (p.x >= 0) && (p.y >= 0) && (p.x < width) && (p.y < height) ) {
        occupiedUntil[sub2ind(p)] = k + 1;
      }
      ++k;
    }
  }

  std::vector<bool> visited( numNodes, false );
  std::vector<int> bps( numNodes, -1 );
  std::vector<SnakeGame::Direction> bpDirections( numNodes, _game.GetDirection() );
  std::list<int> queue;

  const int start = sub2ind(from);
  const int goal = sub2ind(to);
  visited[start] = true;
  queue.push_back( start );
  bpDirections[start] = _game.GetDirection();

  std::vector<int> dist( numNodes, -1 );
  dist[start] = 0;

  while( !queue.empty() ) {
    const int nodeInd = queue.front();
    queue.pop_front();

    const auto pt = ind2sub(nodeInd);
    const auto bpDirection = bpDirections[nodeInd];
    const int ndist = dist[nodeInd] + 1;

    std::vector<std::pair<int, int>> directions; // x,y
    // prefer continuing straight so the path is not unnecessarily kinky
    if( bpDirection == SnakeGame::Direction::UP ) {
      directions = { {0,1}, {-1,0}, {1,0} };
    } else if( bpDirection == SnakeGame::Direction::DOWN ) {
      directions = { {0,-1}, {-1,0}, {1,0} };
    } else if( bpDirection == SnakeGame::Direction::LEFT ) {
      directions = { {-1,0}, {0,1}, {0,-1} };
    } else {
      directions = { {1,0}, {0,1}, {0,-1} };
    }

    for( const auto& direction : directions ) {
      SnakeGame::Point testPoint(pt.x + direction.first, pt.y + direction.second);
      if( (testPoint.x < 0) || (testPoint.y < 0)
          || (testPoint.x >= width) || (testPoint.y >= height) ) {
        continue;
      }
      const int adj = sub2ind(testPoint);
      if( visited[adj] ) {
        continue;
      }
      // first time we could actually step here: ndist must be after this
      // cell has vacated. If we arrive too early, leave it unvisited so a
      // longer path can enter once the tail has moved.
      if( ndist <= occupiedUntil[adj] ) {
        continue;
      }

      SnakeGame::Direction thisDirection = SnakeGame::Direction::UP;
      if( testPoint.x < pt.x ) {
        thisDirection = SnakeGame::Direction::LEFT;
      } else if( testPoint.x > pt.x ) {
        thisDirection = SnakeGame::Direction::RIGHT;
      } else if( testPoint.y < pt.y ) {
        thisDirection = SnakeGame::Direction::DOWN;
      } else {
        thisDirection = SnakeGame::Direction::UP;
      }

      visited[adj] = true;
      bps[adj] = nodeInd;
      bpDirections[adj] = thisDirection;
      dist[adj] = ndist;

      if( adj == goal ) {
        path.clear();
        path.push_back(to);
        int node = adj;
        while( true ) {
          const int parent = bps[node];
          if( parent == start ) {
            break;
          }
          path.push_back(ind2sub(parent));
          node = parent;
        }
        std::reverse( path.begin(), path.end() );
        return true;
      }

      queue.push_back( adj );
    }
  }

  return false;
}

std::vector<SnakeGame::Point> SnakeGameSolver::Longify( const SnakeGame::Snake& snake,
                                                        const SnakeGame::Point& start,
                                                        const std::vector<SnakeGame::Point>& initPath ) const
{
  auto width = _game.GetWidth();
  auto height = _game.GetHeight();
  auto pt2ind = [&width](const SnakeGame::Point& pt) {
    return (width * pt.y) + pt.x;
  };
  auto sub2ind = [&width](int x, int y) {
    return (width * y) + x;
  };

  // a list that will start as initPath, but end up perturbed into a longer path
  std::list<SnakeGame::Point> path;
  // those nodes that are part of the snake (i.e., obstacles) or in current path. When the path
  // is perturbed, nodes are added, but they never need to be removed
  std::vector<bool> used( width*height, false );


  // the start needs to be added here, since the path doesn't normally include the start
  path.push_back( start );
  used[pt2ind(start)] = true;

  // copy the rest of the initial path into a list and mark it as used
  for( const auto& p : initPath ) {
    path.push_back( p );
    used[ pt2ind(p) ] = true;
  }

  // add the snake as an obstacle (used)
  for( const auto& p : snake.body ) {
    used[ pt2ind(p) ] = true;
  }

  // starting from the beginning of the path, try to turn a segment of length 1 that connects two
  // nodes into a path of length 3 by "taking over" the two adjacent nodes in the direction
  // perpendicular to the original segment. Keep trying from the start until it is no longer
  // possible, then move to the next segment, etc.

  auto it = path.begin();
  while( std::next(it) != path.end() ) {
    for( ; std::next(it) != path.end(); ++it ) {
      // can [it, it+1] be perturbed? It can happen in two directions.
      // get current direction.
      auto a = it;
      auto b = std::next(a);

      int dx = (b->x - a->x);
      int dy = (b->y - a->y);
      if( dx == 1 || dx == -1 ) { // right or left
        // try moving up or down.
        if( (b->y > 0)
            && !used[ sub2ind( b->x, b->y - 1 ) ]
            && !used[ sub2ind( a->x, a->y - 1 ) ] )
        {
          // insert just prior to (it+1)==b, twice
          SnakeGame::Point new1{a->x, a->y - 1};
          SnakeGame::Point new2{b->x, b->y - 1};
          path.insert( b, new1 );
          path.insert( b, new2 );
          used[ pt2ind(new1) ] = true;
          used[ pt2ind(new2) ] = true;
          break;
        }
        else if( (b->y < _game.GetHeight() - 1)
                 && !used[ sub2ind( b->x, b->y + 1 ) ]
                 && !used[ sub2ind( a->x, a->y + 1 ) ] )

        {
          SnakeGame::Point new1{a->x, a->y + 1};
          SnakeGame::Point new2{b->x, b->y + 1};
          path.insert( b, new1 );
          path.insert( b, new2 );
          used[ pt2ind(new1) ] = true;
          used[ pt2ind(new2) ] = true;
          break;
        }
      } else if( dy == 1 || dy == -1 ) { // up or down
        // try movign left or right
        if( (b->x > 0)
            && !used[ sub2ind( b->x - 1, b->y ) ]
            && !used[ sub2ind( a->x - 1, a->y ) ] )
        {
          SnakeGame::Point new1{a->x - 1, a->y};
          SnakeGame::Point new2{b->x - 1, b->y};
          path.insert( b, new1 );
          path.insert( b, new2 );
          used[ pt2ind(new1) ] = true;
          used[ pt2ind(new2) ] = true;
          break;
        }
        else if( (b->x < _game.GetWidth()-1)
                 && !used[ sub2ind( b->x + 1, b->y ) ]
                 && !used[ sub2ind( a->x + 1, a->y ) ] )

        {
          SnakeGame::Point new1{a->x + 1, a->y};
          SnakeGame::Point new2{b->x + 1, b->y};
          path.insert( b, new1 );
          path.insert( b, new2 );
          used[ pt2ind(new1) ] = true;
          used[ pt2ind(new2) ] = true;
          break;
        }
      } else {
        DEV_ASSERT(false, "");
      }
    }
  }

  std::vector<SnakeGame::Point> res;
  res.reserve( path.size() - 1 ); // skip the first
  for( auto it = path.begin(); it != path.end(); ++it ) {
    if( it != path.begin() ) {
      res.push_back( *it );
    }
  }
  return res;
}

}
}
