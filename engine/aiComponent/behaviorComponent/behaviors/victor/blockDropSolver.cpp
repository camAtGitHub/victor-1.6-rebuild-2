/**
 * File: blockDropSolver.cpp
 *
 * Author: camAtGitHub
 * Created: 2026-09-09
 *
 * Description: greedy one-piece-lookahead placement search
 *
 **/

#include "engine/aiComponent/behaviorComponent/behaviors/victor/blockDropSolver.h"

#include "util/random/randomGenerator.h"
#include "util/logging/logging.h"

#include <limits>
#include <vector>

namespace Anki {
namespace Vector {

namespace {

// El-Tetris style weights. tune these to make him better or worse.
const float kWLandingHeight  = -4.500159f;
const float kWRowsEliminated =  3.418127f;
const float kWRowTransitions = -3.217888f;
const float kWColTransitions = -9.348695f;
const float kWHoles          = -7.899265f;
const float kWWellSums       = -3.385597f;

const float kMaxMistakeProb = 0.40f;

const int kNumCols = BlockDropGame::kNumCols;
const int kNumRows = BlockDropGame::kNumRows;

inline bool Filled( const std::array<uint16_t, BlockDropGame::kNumRows>& rows, int x, int y )
{
  if( (x < 0) || (x >= kNumCols) ) {
    return true;  // walls count as filled
  }
  if( y >= kNumRows ) {
    return true;  // floor counts as filled
  }
  if( y < 0 ) {
    return false; // open sky
  }
  return ((rows[y] >> x) & 1) != 0;
}

} // anonymous namespace

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
BlockDropSolver::BlockDropSolver( BlockDropGame& game,
                                  float baseMistakeProb,
                                  float mistakeProbPerLevel,
                                  Util::RandomGenerator& rng )
: _game( game )
, _rng( rng )
, _baseMistakeProb( baseMistakeProb )
, _mistakeProbPerLevel( mistakeProbPerLevel )
, _planPieceId( 0 )
, _planValid( false )
, _lastPlanWasMistake( false )
, _targetX( 0 )
, _targetRot( 0 )
, _rotateFailures( 0 )
{
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
BlockDropSolver::~BlockDropSolver()
{
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
float BlockDropSolver::EvaluateBoard( const std::array<uint16_t, BlockDropGame::kNumRows>& rows,
                                      int landingHeight,
                                      int rowsEliminated ) const
{
  int holes          = 0;
  int rowTransitions = 0;
  int colTransitions = 0;
  int wellSums       = 0;

  for( int y = 0; y < kNumRows; ++y ) {
    bool prev = true; // left wall
    for( int x = 0; x < kNumCols; ++x ) {
      const bool cur = Filled( rows, x, y );
      if( cur != prev ) {
        ++rowTransitions;
      }
      prev = cur;
    }
    if( !prev ) {
      ++rowTransitions; // right wall
    }
  }

  for( int x = 0; x < kNumCols; ++x ) {
    bool prev = false; // open sky above the board
    bool seenBlock = false;
    for( int y = 0; y < kNumRows; ++y ) {
      const bool cur = Filled( rows, x, y );
      if( cur != prev ) {
        ++colTransitions;
      }
      prev = cur;
      if( cur ) {
        seenBlock = true;
      } else if( seenBlock ) {
        ++holes;
      }
    }
    if( !prev ) {
      ++colTransitions; // floor
    }
  }

  for( int x = 0; x < kNumCols; ++x ) {
    for( int y = 0; y < kNumRows; ++y ) {
      if( Filled( rows, x, y ) ) {
        continue;
      }
      if( Filled( rows, x - 1, y ) && Filled( rows, x + 1, y ) ) {
        // depth of the well from here down
        int depth = 0;
        for( int yy = y; yy < kNumRows; ++yy ) {
          if( Filled( rows, x, yy ) ) {
            break;
          }
          ++depth;
        }
        wellSums += (depth * (depth + 1)) / 2;
        y += depth;
      }
    }
  }

  return kWLandingHeight  * (float)landingHeight
       + kWRowsEliminated * (float)rowsEliminated
       + kWRowTransitions * (float)rowTransitions
       + kWColTransitions * (float)colTransitions
       + kWHoles          * (float)holes
       + kWWellSums       * (float)wellSums;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void BlockDropSolver::ComputePlan()
{
  const BlockDropGame::Piece& live = _game.GetPiece();
  const int numRot = BlockDropGame::kNumRotations[(int)live.type];

  struct Candidate { int rot; int x; float score; };
  std::vector<Candidate> candidates;
  candidates.reserve( 4 * (kNumCols + 4) );

  const uint16_t full = (uint16_t)((1u << kNumCols) - 1u);

  for( int rot = 0; rot < numRot; ++rot ) {
    for( int x = -3; x <= kNumCols; ++x ) {

      BlockDropGame::Piece p;
      p.type = live.type;
      p.rot  = rot;
      p.x    = x;
      p.y    = live.y;

      if( _game.Collides( p ) ) {
        continue; // can't even exist at the current height in this column
      }

      // drop it
      while( true ) {
        BlockDropGame::Piece n = p;
        n.y += 1;
        if( _game.Collides( n ) ) {
          break;
        }
        p = n;
      }

      BlockDropGame::Cell cells[4];
      BlockDropGame::GetCells( p.type, p.rot, cells );

      // reject placements that would lock above the ceiling
      bool aboveCeiling = false;
      int minY = kNumRows;
      for( int i = 0; i < 4; ++i ) {
        const int by = p.y + cells[i].y;
        if( by < 0 ) {
          aboveCeiling = true;
          break;
        }
        if( by < minY ) {
          minY = by;
        }
      }
      if( aboveCeiling ) {
        continue;
      }

      std::array<uint16_t, kNumRows> sim = _game.GetRows();
      for( int i = 0; i < 4; ++i ) {
        const int bx = p.x + cells[i].x;
        const int by = p.y + cells[i].y;
        sim[by] |= (uint16_t)(1u << bx);
      }

      int cleared = 0;
      for( int y = 0; y < kNumRows; ++y ) {
        if( sim[y] == full ) {
          ++cleared;
        }
      }

      // collapse cleared rows before scoring
      if( cleared > 0 ) {
        std::array<uint16_t, kNumRows> next;
        next.fill( 0 );
        int w = kNumRows - 1;
        for( int y = kNumRows - 1; y >= 0; --y ) {
          if( sim[y] == full ) {
            continue;
          }
          next[w--] = sim[y];
        }
        sim = next;
      }

      const int landingHeight = kNumRows - minY;
      Candidate c;
      c.rot   = rot;
      c.x     = p.x;
      c.score = EvaluateBoard( sim, landingHeight, cleared );
      candidates.push_back( c );
    }
  }

  if( candidates.empty() ) {
    _planValid = false;
    return;
  }

  const uint32_t level = _game.GetLevel();
  float mistakeProb = _baseMistakeProb + _mistakeProbPerLevel * (float)(level > 0 ? level - 1 : 0);
  if( mistakeProb > kMaxMistakeProb ) {
    mistakeProb = kMaxMistakeProb;
  }

  int chosen = 0;
  _lastPlanWasMistake = false;
  if( (mistakeProb > 0.0f) && (_rng.RandDbl() < (double)mistakeProb) ) {
    chosen = _rng.RandIntInRange( 0, (int)candidates.size() - 1 );
    _lastPlanWasMistake = true;
  } else {
    float best = -std::numeric_limits<float>::max();
    for( size_t i = 0; i < candidates.size(); ++i ) {
      if( candidates[i].score > best ) {
        best   = candidates[i].score;
        chosen = (int)i;
      }
    }
  }

  _targetRot      = candidates[chosen].rot;
  _targetX        = candidates[chosen].x;
  _planValid      = true;
  _planPieceId    = _game.GetPieceId();
  _rotateFailures = 0;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void BlockDropSolver::ChooseAndApplyMove()
{
  if( _game.GetState() != BlockDropGame::State::Falling ) {
    _planValid = false;
    return;
  }

  if( !_planValid || (_planPieceId != _game.GetPieceId()) ) {
    ComputePlan();
    if( !_planValid ) {
      return;
    }
  }

  const BlockDropGame::Piece& p = _game.GetPiece();

  if( p.rot != _targetRot ) {
    if( _game.Rotate() ) {
      return;
    }
    // boxed in. shuffle sideways and try again next tick, then give up on the rotation
    ++_rotateFailures;
    if( _rotateFailures > 3 ) {
      _targetRot = p.rot;
    } else {
      if( p.x > _targetX ) {
        _game.MoveLeft();
      } else {
        _game.MoveRight();
      }
      return;
    }
  }

  if( p.x < _targetX ) {
    if( _game.MoveRight() ) {
      return;
    }
  } else if( p.x > _targetX ) {
    if( _game.MoveLeft() ) {
      return;
    }
  }

  // lined up (or wedged). drop it
  _game.SoftDrop();
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
int BlockDropSolver::GetGhostY() const
{
  BlockDropGame::Piece p = _game.GetPiece();
  while( true ) {
    BlockDropGame::Piece n = p;
    n.y += 1;
    if( _game.Collides( n ) ) {
      break;
    }
    p = n;
  }
  return p.y;
}

} // namespace Vector
} // namespace Anki
