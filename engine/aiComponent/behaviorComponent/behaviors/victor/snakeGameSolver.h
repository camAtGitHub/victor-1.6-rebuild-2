/**
 * File: snakeGameSolver.h
 *
 * Author: ross
 * Created: 2018-02-27
 *
 * Description: greedy solver of the game of snake
 *
 * Copyright: Anki, Inc. 2018
 *
 **/

#ifndef __Engine_AiComponent_BehaviorComponent_Behaviors_SnakeGameSolver__
#define __Engine_AiComponent_BehaviorComponent_Behaviors_SnakeGameSolver__

// todo: move nested classes into another file to avoid this
#include "engine/aiComponent/behaviorComponent/behaviors/victor/snakeGame.h"
#include <vector>

namespace Anki {
namespace Vector {


class SnakeGameSolver
{
public:
  // Constructor. probMistakesFlat the the prob of a mistake in any step. probMistakesPerLength is
  // the additional probability per unit snake length. probWrongTurnsFlat is the prob of
  // moving in the wrong direction when a turn is needed (think-- you hit the wrong button).
  // Mistakes are optional flavour: the solver itself no longer stall-circles a 1-cell gap
  // (that was Longify's return value being discarded).
  SnakeGameSolver( SnakeGame& game,
                   float probMistakesFlat,
                   float probMistakesPerLength,
                   float probWrongTurnsFlat,
                   const Util::RandomGenerator& rng );
  virtual ~SnakeGameSolver();

  void ChooseAndApplyMove();


private:

  // Breadth-first search from --> to. Snake body is a moving obstacle: cell
  // body[k] (tail = 0) is free after k+1 steps, matching collide-then-pop-tail.
  bool BFS(const SnakeGame::Point& from,
           const SnakeGame::Point& to,
           const SnakeGame::Snake& snake,
           std::vector<SnakeGame::Point>& path) const;

  // Take initPath and make it longer, without colliding with snake or the walls.
  // start is the origin of initPath, since, in other methods here, the path does not contain
  // the starting node. todo: consider a search instead of a constructive approach
  std::vector<SnakeGame::Point> Longify( const SnakeGame::Snake& snake,
                                         const SnakeGame::Point& start,
                                         const std::vector<SnakeGame::Point>& initPath ) const;

  SnakeGame& _game;

  const Util::RandomGenerator& _rng;

  float _pMistakesFlat;      // probability of randomly turning
  float _pMistakesPerLength; // additional probability of randomly turning per unit length
  float _pWrongTurns;        // probability of the chosen turn being replaced by a random one

  unsigned int _initialLength = 0;

};

}
}

#endif
