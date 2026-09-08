#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

namespace Anki {
namespace Vector {

// Pure C++11 game, independent of robot APIs. Units are native display pixels.
class BrickBreakerGame
{
public:
  enum class Phase { Serving, Playing, LifeLost, LevelCleared, Finished };
  enum Event : unsigned { None=0, BrickHit=1, PaddleHit=2, Miss=4, Clear=8 };
  struct Brick { int x=0, y=0, w=0, h=0; bool alive=false; };
  static constexpr int BrickCount = 24;
  BrickBreakerGame(int width, int height, uint32_t seed);
  // One fixed 1/120-second physics step. Solver output is a target paddle centre.
  unsigned Step(float paddleTarget);
  // One byte per pixel, caller-owned; returns false without writing if too small.
  bool Render(uint8_t* pixels, std::size_t size) const;
  int Width() const { return _width; }
  int Height() const { return _height; }
  int Score() const { return _score; }
  int Lives() const { return _lives; }
  int Level() const { return _level; }
  bool Won() const { return _won; }
  Phase GetPhase() const { return _phase; }
  float BallX() const { return _x; }
  float BallY() const { return _y; }
  float VelocityX() const { return _vx; }
  float VelocityY() const { return _vy; }
  float PaddleX() const { return _paddle; }
  float PaddleY() const { return _height - 10.f; }
  float PaddleHalfWidth() const { return 14.f - (_level-1)*2.f; }
  const std::array<Brick, BrickCount>& Bricks() const { return _bricks; }
  static constexpr float StepSeconds() { return 1.f/120.f; }

private:
  friend struct BrickBreakerTestAccess;
  uint32_t Random();
  void NewLayout();
  void Serve();
  void BounceFromPaddle();
  int _width, _height;
  uint32_t _rng;
  std::array<Brick, BrickCount> _bricks;
  float _x=0, _y=0, _vx=0, _vy=0, _paddle=0;
  int _score=0, _lives=3, _level=1, _ticks=0, _phaseTicks=0, _rallyTicks=0;
  int _flashX=0, _flashY=0, _flashTicks=0;
  Phase _phase=Phase::Serving;
  bool _won=false;
};

} // namespace Vector
} // namespace Anki
