#pragma once
#include <cstdint>
namespace Anki {
namespace Vector {
class BrickBreakerGame;
// Delayed observations and limited paddle speed make an imperfect spectator AI.
class BrickBreakerSolver
{
public:
  explicit BrickBreakerSolver(uint32_t seed) : _rng(seed ? seed : 1) {}
  float ChooseTarget(const BrickBreakerGame& game);
private:
  uint32_t _rng;
  int _untilThink=0;
  float _target=0;
};
}
}
