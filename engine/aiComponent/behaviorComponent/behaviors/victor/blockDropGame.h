/**
 * File: blockDropGame.h
 *
 * Author: camAtGitHub
 * Created: 2026-09-09
 *
 * Description: falling-block stacking game. Pure model, no rendering, no engine deps.
 *              Board is 10x16 stored as one bitmask per row so the solver can brute force
 *              every placement cheaply on-robot.
 *
 **/

#ifndef __Engine_AiComponent_BehaviorComponent_Behaviors_Victor_BlockDropGame_H__
#define __Engine_AiComponent_BehaviorComponent_Behaviors_Victor_BlockDropGame_H__

#include <array>
#include <cstdint>
#include <vector>

namespace Anki {

namespace Util {
class RandomGenerator;
}

namespace Vector {

class BlockDropGame
{
public:

  static const int kNumCols = 10;
  static const int kNumRows = 16;

  enum class PieceType : uint8_t { I = 0, J, L, O, S, T, Z, Count };

  enum class State : uint8_t { Falling, Clearing, GameOver };

  struct Cell {
    int x;
    int y;
  };

  struct Piece {
    PieceType type = PieceType::I;
    int rot = 0;
    int x   = 0; // left edge of the 4x4 box, in board columns
    int y   = 0; // top edge of the 4x4 box, in board rows (may be negative at spawn)
  };

  // one-shot flags, cleared by ConsumeEvents(). the behavior turns these into motion/audio
  struct Events {
    bool    moved        = false;
    bool    rotated      = false;
    bool    locked       = false;
    bool    spawned      = false;
    bool    levelUp      = false;
    bool    gameOver     = false;
    uint8_t linesCleared = 0;
  };

  explicit BlockDropGame( Util::RandomGenerator& rng );
  ~BlockDropGame();

  // one gravity tick. also drives the line-clear flash and the respawn
  void Update();

  // inputs. return true if the input did something
  bool MoveLeft();
  bool MoveRight();
  bool Rotate();   // clockwise, with simple wall kicks
  bool SoftDrop(); // fall one row now; locks if it can't
  void HardDrop();

  State GetState()  const { return _state; }
  bool  GameOver()  const { return _state == State::GameOver; }

  const Piece& GetPiece()     const { return _piece; }
  PieceType    GetNextPiece() const { return _next; }
  uint32_t     GetPieceId()   const { return _pieceId; } // bumps on every spawn

  bool IsBlockAt( int x, int y ) const;
  bool IsRowClearing( int y ) const { return (y >= 0) && (y < kNumRows) && (((_clearMask >> y) & 1) != 0); }
  bool GetClearFlashOn() const { return ((_clearTicks / 2) % 2) == 0; }

  uint32_t GetScore() const { return _score; }
  uint32_t GetLines() const { return _lines; }
  uint32_t GetLevel() const { return _level; }

  Events ConsumeEvents();

  // - - - - - used by the solver - - - - -
  static const int kNumRotations[(int)PieceType::Count];
  static void GetCells( PieceType type, int rot, Cell (&out)[4] );

  bool Collides( const Piece& p ) const;
  const std::array<uint16_t, kNumRows>& GetRows() const { return _rows; }

private:

  void SpawnPiece();
  void LockPiece();
  void Collapse();
  bool TryMove( int dx, int dy );
  PieceType DrawFromBag();

  Util::RandomGenerator&         _rng;
  std::array<uint16_t, kNumRows> _rows;
  Piece                          _piece;
  PieceType                      _next;
  std::vector<PieceType>         _bag;
  State                          _state;
  uint16_t                       _clearMask;
  int                            _clearTicks;
  uint32_t                       _score;
  uint32_t                       _lines;
  uint32_t                       _level;
  uint32_t                       _pieceId;
  Events                         _events;
};

} // namespace Vector
} // namespace Anki

#endif
