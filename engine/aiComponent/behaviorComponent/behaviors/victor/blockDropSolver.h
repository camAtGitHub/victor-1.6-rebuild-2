/**
 * File: blockDropSolver.h
 *
 * Author: camAtGitHub
 * Created: 2026-09-09
 *
 * Description: picks a placement for the current piece, then walks the piece there one
 *              input at a time so the move is watchable. Deliberately fallible: it makes
 *              mistakes more often as the level climbs, so Vector eventually tops out.
 *
 **/

#ifndef __Engine_AiComponent_BehaviorComponent_Behaviors_Victor_BlockDropSolver_H__
#define __Engine_AiComponent_BehaviorComponent_Behaviors_Victor_BlockDropSolver_H__

#include "engine/aiComponent/behaviorComponent/behaviors/victor/blockDropGame.h"

namespace Anki {

namespace Util {
class RandomGenerator;
}

namespace Vector {

class BlockDropSolver
{
public:

  // baseMistakeProb: chance of a junk placement at level 1
  // mistakeProbPerLevel: added per level above 1, clamped at kMaxMistakeProb
  BlockDropSolver( BlockDropGame& game,
                   float baseMistakeProb,
                   float mistakeProbPerLevel,
                   Util::RandomGenerator& rng );
  ~BlockDropSolver();

  // applies at most one input (rotate / left / right / soft drop)
  void ChooseAndApplyMove();

  bool HasPlan()      const { return _planValid; }
  int  GetTargetCol() const { return _targetX; }
  int  GetTargetRot() const { return _targetRot; }
  bool WasLastPlanAMistake() const { return _lastPlanWasMistake; }

  // where the piece would land if it fell straight down from here (for the ghost outline)
  int GetGhostY() const;

private:

  void  ComputePlan();
  float EvaluateBoard( const std::array<uint16_t, BlockDropGame::kNumRows>& rows,
                       int landingHeight,
                       int rowsEliminated ) const;

  BlockDropGame&         _game;
  Util::RandomGenerator& _rng;

  float    _baseMistakeProb;
  float    _mistakeProbPerLevel;

  uint32_t _planPieceId;
  bool     _planValid;
  bool     _lastPlanWasMistake;
  int      _targetX;
  int      _targetRot;
  int      _rotateFailures;
};

} // namespace Vector
} // namespace Anki

#endif
