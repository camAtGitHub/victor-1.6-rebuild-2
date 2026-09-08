#include "engine/aiComponent/behaviorComponent/behaviors/victor/brickBreakerSolver.h"
#include "engine/aiComponent/behaviorComponent/behaviors/victor/brickBreakerGame.h"
#include <algorithm>
#include <cmath>
namespace Anki {
namespace Vector {
float BrickBreakerSolver::ChooseTarget(const BrickBreakerGame& g)
{
  if (_untilThink-- > 0) { return _target; }
  _untilThink = 13 + g.Level()*3;
  _rng ^= _rng << 13; _rng ^= _rng >> 17; _rng ^= _rng << 5;
  if (g.GetPhase() != BrickBreakerGame::Phase::Playing || g.VelocityY() <= 0) {
    _target = g.Width()*0.5f;
    return _target;
  }
  const float time = std::max(0.f, (g.PaddleY()-2.f-g.BallY())/g.VelocityY());
  // Mirror the projected intercept across the side walls, including ball radius.
  const float span = g.Width()-8.f;
  float p = std::fmod(g.BallX()-4.f + g.VelocityX()*time, 2.f*span);
  if (p < 0) { p += 2.f*span; }
  if (p > span) { p = 2.f*span-p; }
  const float error = (static_cast<int>(_rng%2001)-1000)/1000.f;
  _target = 4.f+p + error*(3.f+g.Level()*2.f);
  return _target;
}
}
}
