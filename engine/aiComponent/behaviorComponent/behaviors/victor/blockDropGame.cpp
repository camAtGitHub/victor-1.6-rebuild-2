/**
 * File: blockDropGame.cpp
 *
 * Author: camAtGitHub
 * Created: 2026-09-09
 *
 * Description: falling-block stacking game model
 *
 **/

#include "engine/aiComponent/behaviorComponent/behaviors/victor/blockDropGame.h"

#include "util/random/randomGenerator.h"
#include "util/logging/logging.h"

#include <algorithm>

namespace Anki {
namespace Vector {

namespace {

// [piece][rotation][cell][x,y] inside a 4x4 box, y down.
// duplicate rotations are filled in so indexing is always safe.
const int8_t kShapes[7][4][4][2] = {
  // I
  { {{0,1},{1,1},{2,1},{3,1}}, {{2,0},{2,1},{2,2},{2,3}}, {{0,1},{1,1},{2,1},{3,1}}, {{2,0},{2,1},{2,2},{2,3}} },
  // J
  { {{0,0},{0,1},{1,1},{2,1}}, {{1,0},{2,0},{1,1},{1,2}}, {{0,1},{1,1},{2,1},{2,2}}, {{1,0},{1,1},{0,2},{1,2}} },
  // L
  { {{2,0},{0,1},{1,1},{2,1}}, {{1,0},{1,1},{1,2},{2,2}}, {{0,1},{1,1},{2,1},{0,2}}, {{0,0},{1,0},{1,1},{1,2}} },
  // O
  { {{1,0},{2,0},{1,1},{2,1}}, {{1,0},{2,0},{1,1},{2,1}}, {{1,0},{2,0},{1,1},{2,1}}, {{1,0},{2,0},{1,1},{2,1}} },
  // S
  { {{1,0},{2,0},{0,1},{1,1}}, {{1,0},{1,1},{2,1},{2,2}}, {{1,0},{2,0},{0,1},{1,1}}, {{1,0},{1,1},{2,1},{2,2}} },
  // T
  { {{1,0},{0,1},{1,1},{2,1}}, {{1,0},{1,1},{2,1},{1,2}}, {{0,1},{1,1},{2,1},{1,2}}, {{1,0},{0,1},{1,1},{1,2}} },
  // Z
  { {{0,0},{1,0},{1,1},{2,1}}, {{2,0},{1,1},{2,1},{1,2}}, {{0,0},{1,0},{1,1},{2,1}}, {{2,0},{1,1},{2,1},{1,2}} },
};

// classic line-clear payout, multiplied by level
const uint32_t kLineScore[5] = { 0, 40, 100, 300, 1200 };

const int kClearFlashTicks = 8;
const int kSpawnX          = 3;
const int kSpawnY          = -1;

} // anonymous namespace

const int BlockDropGame::kNumCols;
const int BlockDropGame::kNumRows;

const int BlockDropGame::kNumRotations[(int)BlockDropGame::PieceType::Count] = { 2, 4, 4, 1, 2, 4, 2 };

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
BlockDropGame::BlockDropGame( Util::RandomGenerator& rng )
: _rng( rng )
, _next( PieceType::I )
, _state( State::Falling )
, _clearMask( 0 )
, _clearTicks( 0 )
, _score( 0 )
, _lines( 0 )
, _level( 1 )
, _pieceId( 0 )
{
  _rows.fill( 0 );
  _next = DrawFromBag();
  SpawnPiece();
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
BlockDropGame::~BlockDropGame()
{
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void BlockDropGame::GetCells( PieceType type, int rot, Cell (&out)[4] )
{
  const int t = (int)type;
  const int r = ((rot % 4) + 4) % 4;
  for( int i = 0; i < 4; ++i ) {
    out[i].x = kShapes[t][r][i][0];
    out[i].y = kShapes[t][r][i][1];
  }
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
BlockDropGame::PieceType BlockDropGame::DrawFromBag()
{
  // 7-bag: every piece shows up once before any repeats. keeps the stack fair
  if( _bag.empty() ) {
    for( int i = 0; i < (int)PieceType::Count; ++i ) {
      _bag.push_back( (PieceType)i );
    }
    for( int i = (int)_bag.size() - 1; i > 0; --i ) {
      const int j = _rng.RandIntInRange( 0, i );
      std::swap( _bag[i], _bag[j] );
    }
  }
  const PieceType p = _bag.back();
  _bag.pop_back();
  return p;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
bool BlockDropGame::Collides( const Piece& p ) const
{
  Cell cells[4];
  GetCells( p.type, p.rot, cells );
  for( int i = 0; i < 4; ++i ) {
    const int bx = p.x + cells[i].x;
    const int by = p.y + cells[i].y;
    if( (bx < 0) || (bx >= kNumCols) || (by >= kNumRows) ) {
      return true;
    }
    if( by < 0 ) {
      continue; // above the ceiling is legal while spawning
    }
    if( ((_rows[by] >> bx) & 1) != 0 ) {
      return true;
    }
  }
  return false;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
bool BlockDropGame::IsBlockAt( int x, int y ) const
{
  if( (x < 0) || (x >= kNumCols) || (y < 0) || (y >= kNumRows) ) {
    return false;
  }
  return ((_rows[y] >> x) & 1) != 0;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void BlockDropGame::SpawnPiece()
{
  _piece.type = _next;
  _piece.rot  = 0;
  _piece.x    = kSpawnX;
  _piece.y    = kSpawnY;
  _next       = DrawFromBag();
  ++_pieceId;
  _events.spawned = true;

  if( Collides( _piece ) ) {
    _state = State::GameOver;
    _events.gameOver = true;
  }
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
bool BlockDropGame::TryMove( int dx, int dy )
{
  Piece p = _piece;
  p.x += dx;
  p.y += dy;
  if( Collides( p ) ) {
    return false;
  }
  _piece = p;
  return true;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
bool BlockDropGame::MoveLeft()
{
  if( _state != State::Falling ) {
    return false;
  }
  const bool ok = TryMove( -1, 0 );
  _events.moved |= ok;
  return ok;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
bool BlockDropGame::MoveRight()
{
  if( _state != State::Falling ) {
    return false;
  }
  const bool ok = TryMove( 1, 0 );
  _events.moved |= ok;
  return ok;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
bool BlockDropGame::Rotate()
{
  if( _state != State::Falling ) {
    return false;
  }
  const int numRot = kNumRotations[(int)_piece.type];
  if( numRot <= 1 ) {
    return false;
  }

  // try in place, then nudge off the wall / off the stack
  static const int kKicks[5] = { 0, -1, 1, -2, 2 };
  for( int k = 0; k < 5; ++k ) {
    Piece p = _piece;
    p.rot = (p.rot + 1) % numRot;
    p.x  += kKicks[k];
    if( !Collides( p ) ) {
      _piece = p;
      _events.rotated = true;
      return true;
    }
  }
  return false;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
bool BlockDropGame::SoftDrop()
{
  if( _state != State::Falling ) {
    return false;
  }
  if( TryMove( 0, 1 ) ) {
    return true;
  }
  LockPiece();
  return false;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void BlockDropGame::HardDrop()
{
  if( _state != State::Falling ) {
    return;
  }
  while( TryMove( 0, 1 ) ) {}
  LockPiece();
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void BlockDropGame::LockPiece()
{
  Cell cells[4];
  GetCells( _piece.type, _piece.rot, cells );

  bool toppedOut = false;
  for( int i = 0; i < 4; ++i ) {
    const int bx = _piece.x + cells[i].x;
    const int by = _piece.y + cells[i].y;
    if( by < 0 ) {
      toppedOut = true; // part of the piece locked above the ceiling
      continue;
    }
    if( (bx >= 0) && (bx < kNumCols) && (by < kNumRows) ) {
      _rows[by] |= (uint16_t)(1u << bx);
    }
  }

  _events.locked = true;

  if( toppedOut ) {
    _state = State::GameOver;
    _events.gameOver = true;
    return;
  }

  // find full rows
  const uint16_t full = (uint16_t)((1u << kNumCols) - 1u);
  _clearMask = 0;
  int numCleared = 0;
  for( int y = 0; y < kNumRows; ++y ) {
    if( _rows[y] == full ) {
      _clearMask |= (uint16_t)(1u << y);
      ++numCleared;
    }
  }

  if( numCleared > 0 ) {
    _events.linesCleared = (uint8_t)numCleared;
    _score += kLineScore[numCleared] * _level;
    _lines += numCleared;
    const uint32_t newLevel = 1 + (_lines / 10);
    if( newLevel != _level ) {
      _level = newLevel;
      _events.levelUp = true;
    }
    _state      = State::Clearing;
    _clearTicks = kClearFlashTicks;
  } else {
    _score += _level; // small crumb for surviving another piece
    SpawnPiece();
  }
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void BlockDropGame::Collapse()
{
  std::array<uint16_t, kNumRows> next;
  next.fill( 0 );
  int writeRow = kNumRows - 1;
  for( int y = kNumRows - 1; y >= 0; --y ) {
    if( ((_clearMask >> y) & 1) != 0 ) {
      continue;
    }
    next[writeRow] = _rows[y];
    --writeRow;
  }
  _rows      = next;
  _clearMask = 0;
  SpawnPiece();
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void BlockDropGame::Update()
{
  if( _state == State::GameOver ) {
    return;
  }

  if( _state == State::Clearing ) {
    --_clearTicks;
    if( _clearTicks <= 0 ) {
      _state = State::Falling;
      Collapse();
    }
    return;
  }

  if( !TryMove( 0, 1 ) ) {
    LockPiece();
  }
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
BlockDropGame::Events BlockDropGame::ConsumeEvents()
{
  const Events e = _events;
  _events = Events();
  return e;
}

} // namespace Vector
} // namespace Anki
