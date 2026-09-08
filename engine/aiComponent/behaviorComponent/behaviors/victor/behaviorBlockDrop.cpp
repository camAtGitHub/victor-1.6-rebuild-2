/**
 * File: behaviorBlockDrop.cpp
 *
 * Author: camAtGitHub
 * Created: 2026-09-09
 *
 * Description: Vector plays a falling-block stacking game on his face
 *
 **/

#include "engine/aiComponent/behaviorComponent/behaviors/victor/behaviorBlockDrop.h"
#include "engine/aiComponent/behaviorComponent/behaviors/victor/blockDropGame.h"
#include "engine/aiComponent/behaviorComponent/behaviors/victor/blockDropSolver.h"

#include "engine/aiComponent/behaviorComponent/behaviorExternalInterface/beiRobotInfo.h"

#include "coretech/common/engine/colorRGBA.h"
#include "coretech/common/engine/utils/timer.h"
#include "coretech/vision/engine/image.h"

#include "engine/actions/animActions.h"
#include "engine/actions/basicActions.h"
#include "engine/audio/engineRobotAudioClient.h"
#include "engine/components/animationComponent.h"
#include "engine/components/rebuildConfig.h"

#include "clad/audio/audioEventTypes.h"

#include <cstring>
#include <string>

namespace Anki {
namespace Vector {

using AMD_GE_GE = AudioMetaData::GameEvent::GenericEvent;
using AMD_GOT   = AudioMetaData::GameObjectType;

namespace {

const char* kHighScoreKey = "blockDropHighScoreVector";

// one solver input every N engine ticks. slow enough to watch, fast enough to line up
const unsigned int kInputTicks = 2;

// how long the game-over card stays on the face before he reacts (engine ticks, ~30/sec)
const unsigned int kGameOverHoldTicks = 90;

// how wrong he gets. base at level 1, plus this much per level, capped inside the solver
const float kBaseMistakeProb     = 0.02f;
const float kMistakeProbPerLevel = 0.035f;

const uint8_t kOn    = 255;
const uint8_t kGhost = 90;

// side panel widths in pixels, used to centre the whole composition
const int kRightPanelWidth = 40;
const int kPanelGap        = 6;

const float kHeadAngleRad     = 0.55f;
const float kHeadAngleNodRad  = 0.42f;

// - - - - - - - - - - - - - - - - tiny 3x5 bitmap font - - - - - - - - - - - - - - - -
// index 0-9 = digits, 10-35 = A-Z. each row is 3 bits, bit2 = leftmost pixel.
const uint8_t kFont3x5[36][5] = {
  {7,5,5,5,7}, {2,6,2,2,7}, {7,1,7,4,7}, {7,1,7,1,7}, {5,5,7,1,1}, // 0-4
  {7,4,7,1,7}, {7,4,7,5,7}, {7,1,2,2,2}, {7,5,7,5,7}, {7,5,7,1,7}, // 5-9
  {7,5,7,5,5}, {6,5,6,5,6}, {7,4,4,4,7}, {6,5,5,5,6}, {7,4,7,4,7}, // A-E
  {7,4,7,4,4}, {7,4,5,5,7}, {5,5,7,5,5}, {7,2,2,2,7}, {1,1,1,5,7}, // F-J
  {5,5,6,5,5}, {4,4,4,4,7}, {5,7,7,5,5}, {6,5,5,5,5}, {7,5,5,5,7}, // K-O
  {7,5,7,4,4}, {7,5,5,7,1}, {7,5,7,6,5}, {7,4,7,1,7}, {7,2,2,2,2}, // P-T
  {5,5,5,5,7}, {5,5,5,5,2}, {5,5,7,7,5}, {5,5,2,5,5}, {5,5,2,2,2}, // U-Y
  {7,1,2,4,7},                                                     // Z
};

inline void SetPx( Vision::Image& img, int x, int y, uint8_t v )
{
  const int w = img.GetNumCols();
  const int h = img.GetNumRows();
  if( (x < 0) || (y < 0) || (x >= w) || (y >= h) ) {
    return;
  }
  *(img.GetRawDataPointer() + (y * w) + x) = v;
}

void FillRect( Vision::Image& img, int x, int y, int w, int h, uint8_t v )
{
  for( int j = 0; j < h; ++j ) {
    for( int i = 0; i < w; ++i ) {
      SetPx( img, x + i, y + j, v );
    }
  }
}

void DrawRect( Vision::Image& img, int x, int y, int w, int h, uint8_t v )
{
  for( int i = 0; i < w; ++i ) {
    SetPx( img, x + i, y,         v );
    SetPx( img, x + i, y + h - 1, v );
  }
  for( int j = 0; j < h; ++j ) {
    SetPx( img, x,         y + j, v );
    SetPx( img, x + w - 1, y + j, v );
  }
}

int GlyphIndex( char c )
{
  if( (c >= '0') && (c <= '9') ) { return c - '0'; }
  if( (c >= 'A') && (c <= 'Z') ) { return 10 + (c - 'A'); }
  if( (c >= 'a') && (c <= 'z') ) { return 10 + (c - 'a'); }
  return -1;
}

void DrawChar( Vision::Image& img, int x, int y, char c, int scale, uint8_t v )
{
  const int idx = GlyphIndex( c );
  if( idx < 0 ) {
    return; // space or punctuation: just leave the gap
  }
  for( int row = 0; row < 5; ++row ) {
    const uint8_t bits = kFont3x5[idx][row];
    for( int col = 0; col < 3; ++col ) {
      if( ((bits >> (2 - col)) & 1) == 0 ) {
        continue;
      }
      FillRect( img, x + (col * scale), y + (row * scale), scale, scale, v );
    }
  }
}

void DrawString( Vision::Image& img, int x, int y, const std::string& s, int scale, uint8_t v )
{
  const int advance = (3 * scale) + scale;
  for( size_t i = 0; i < s.size(); ++i ) {
    DrawChar( img, x + (int)(i * advance), y, s[i], scale, v );
  }
}

int StringWidth( const std::string& s, int scale )
{
  const int advance = (3 * scale) + scale;
  return ((int)s.size() * advance) - scale;
}

} // anonymous namespace

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
BehaviorBlockDrop::BehaviorBlockDrop( const Json::Value& config )
: ICozmoBehavior( config )
{
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
BehaviorBlockDrop::~BehaviorBlockDrop()
{
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
bool BehaviorBlockDrop::WantsToBeActivatedBehavior() const
{
  // gate this from the parent dispatcher's conditions rather than in here
  return true;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void BehaviorBlockDrop::GetBehaviorOperationModifiers( BehaviorOperationModifiers& modifiers ) const
{
  modifiers.wantsToBeActivatedWhenOnCharger = true;
  modifiers.wantsToBeActivatedWhenOffTreads = false;
  modifiers.behaviorAlwaysDelegates         = false;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
bool BehaviorBlockDrop::CanTurnInPlace() const
{
  // no body turns while docked: the treads either grind on the charger or walk him off the
  // contacts. head and lift are still safe, so he stays expressive either way.
  const auto& robotInfo = GetBEI().GetRobotInfo();
  return !robotInfo.IsOnChargerPlatform() && !robotInfo.IsOnChargerContacts();
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void BehaviorBlockDrop::SetupGeometry()
{
  const int w = FACE_DISPLAY_WIDTH;
  const int h = FACE_DISPLAY_HEIGHT;

  // biggest square cell that leaves room for a border. 96px -> 5, 80px -> 4
  int cell = (h - 6) / BlockDropGame::kNumRows;
  if( cell < 3 ) {
    cell = 3;
  }

  _dVars.cell   = cell;
  _dVars.fieldW = cell * BlockDropGame::kNumCols;
  _dVars.fieldH = cell * BlockDropGame::kNumRows;
  _dVars.fieldY = (h - _dVars.fieldH) / 2;

  // centre [next-piece panel | playfield | score panel] as one block
  const int leftPanelW = (4 * cell) + 2;
  const int totalW     = leftPanelW + kPanelGap + (_dVars.fieldW + 4) + kPanelGap + kRightPanelWidth;

  int startX = (w - totalW) / 2;
  if( startX < 2 ) {
    startX = 2;
  }

  _dVars.leftX  = startX;
  _dVars.fieldX = startX + leftPanelW + kPanelGap + 2;
  _dVars.rightX = _dVars.fieldX + _dVars.fieldW + 2 + kPanelGap;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void BehaviorBlockDrop::OnBehaviorActivated()
{
  _dVars = DynamicVariables();
  SetupGeometry();
  _dVars.highScore = RebuildToggles::GetInt( kHighScoreKey );

  // play the get-in, then look up at the board and start
  auto* action = new TriggerLiftSafeAnimationAction( AnimationTrigger::BlackJack_GetIn );
  DelegateIfInControl( action, [this]( ActionResult result ) {

    auto& rng = GetBEI().GetRNG();

    DelegateIfInControl( new MoveHeadToAngleAction( kHeadAngleRad ) );

    _dVars.image.reset( new Vision::Image( FACE_DISPLAY_HEIGHT, FACE_DISPLAY_WIDTH, NamedColors::BLACK ) );
    _dVars.game.reset( new BlockDropGame( rng ) );
    _dVars.solver.reset( new BlockDropSolver( *_dVars.game.get(),
                                              kBaseMistakeProb,
                                              kMistakeProbPerLevel,
                                              rng ) );
  });
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void BehaviorBlockDrop::OnBehaviorDeactivated()
{
  if( _dVars.game != nullptr ) {
    const int score = (int)_dVars.game->GetScore();
    if( score > RebuildToggles::GetInt( kHighScoreKey ) ) {
      RebuildToggles::SetInt( nullptr, kHighScoreKey, score );
    }
  }
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void BehaviorBlockDrop::BehaviorUpdate()
{
  if( !IsActivated() ) {
    return;
  }

  if( _dVars.image == nullptr ) {
    return; // still playing the get-in
  }

  auto& image = *_dVars.image.get();
  auto& game  = *_dVars.game.get();

  if( _dVars.lost ) {
    ++_dVars.gameOverTicks;
    if( _dVars.gameOverTicks == kGameOverHoldTicks ) {
      CompoundActionSequential* newAction = new CompoundActionSequential();
      newAction->AddAction( new TriggerLiftSafeAnimationAction( AnimationTrigger::BlackJack_Swipe ), true );
      newAction->AddAction( new TriggerLiftSafeAnimationAction( AnimationTrigger::Feedback_ShutUp ), true );
      DelegateIfInControl( newAction, [this]( ActionResult result ) {
        CancelSelf();
      });
    }
    return;
  }

  // - - - inputs - - -
  ++_dVars.inputTicks;
  if( _dVars.inputTicks >= kInputTicks ) {
    _dVars.inputTicks = 0;
    _dVars.solver->ChooseAndApplyMove();
  }

  // - - - gravity, speeding up with level - - -
  const uint32_t level = game.GetLevel();
  unsigned int gravityPeriod = 13;
  if( (2 * level) < 11 ) {
    gravityPeriod = 13 - (2 * level);
  } else {
    gravityPeriod = 2;
  }

  ++_dVars.gravityTicks;
  if( _dVars.gravityTicks >= gravityPeriod ) {
    _dVars.gravityTicks = 0;
    game.Update();
  }

  // - - - react - - -
  const BlockDropGame::Events events = game.ConsumeEvents();

  if( events.gameOver ) {
    _dVars.lost = true;
    const int score = (int)game.GetScore();
    if( score > _dVars.highScore ) {
      _dVars.highScore = score;
      RebuildToggles::SetInt( nullptr, kHighScoreKey, score );
    }
    CancelDelegates( false );
    image = Vision::Image( FACE_DISPLAY_HEIGHT, FACE_DISPLAY_WIDTH, NamedColors::BLACK );
    DrawGameOver( image );
    GetBEI().GetAnimationComponent().DisplayFaceImage( image, 3000.0f, true );
    return;
  }

  if( events.locked ) {
    GetBEI().GetRobotAudioClient().PostEvent( AMD_GE_GE::Play__Robot_Vic_Sfx__Blackjack_Deal,
                                              AMD_GOT::Behavior );
  }

  if( events.linesCleared > 0 ) {
    ReactToLineClear( events.linesCleared );
  } else if( events.spawned ) {
    ReactToNewPiece();
  } else if( events.rotated ) {
    ReactToRotation();
  }

  // - - - draw - - -
  image = Vision::Image( FACE_DISPLAY_HEIGHT, FACE_DISPLAY_WIDTH, NamedColors::BLACK );
  DrawGame( image );
  GetBEI().GetAnimationComponent().DisplayFaceImage( image, 0.0f, true );
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void BehaviorBlockDrop::ReactToLineClear( uint8_t numLines )
{
  GetBEI().GetRobotAudioClient().PostEvent( AMD_GE_GE::Play__Robot_Vic_Sfx__Blackjack_Deal,
                                            AMD_GOT::Behavior );
  if( IsControlDelegated() ) {
    return;
  }

  // pump the lift. four at once gets a spin as well
  _dVars.liftUp = !_dVars.liftUp;
  IAction* liftAction = new MoveLiftToHeightAction( _dVars.liftUp
                                                    ? MoveLiftToHeightAction::Preset::CARRY
                                                    : MoveLiftToHeightAction::Preset::LOW_DOCK );

  if( (numLines >= 4) && CanTurnInPlace() ) {
    CompoundActionSequential* seq = new CompoundActionSequential();
    seq->AddAction( liftAction, true );
    auto* turn = new TurnInPlaceAction( DEG_TO_RAD( 25.0f ), false );
    turn->SetAccel( MAX_BODY_ROTATION_ACCEL_RAD_PER_SEC2 / 2 );
    turn->SetMaxSpeed( MAX_BODY_ROTATION_SPEED_RAD_PER_SEC );
    seq->AddAction( turn, true );
    auto* turnBack = new TurnInPlaceAction( DEG_TO_RAD( -25.0f ), false );
    turnBack->SetAccel( MAX_BODY_ROTATION_ACCEL_RAD_PER_SEC2 / 2 );
    turnBack->SetMaxSpeed( MAX_BODY_ROTATION_SPEED_RAD_PER_SEC );
    seq->AddAction( turnBack, true );
    DelegateIfInControl( seq );
  } else {
    DelegateIfInControl( liftAction );
  }
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void BehaviorBlockDrop::ReactToNewPiece()
{
  if( IsControlDelegated() || (_dVars.solver == nullptr) || !_dVars.solver->HasPlan() ) {
    return;
  }

  if( !CanTurnInPlace() ) {
    // docked. nod instead of leaning so he still tracks the piece
    ReactToRotation();
    return;
  }

  // lean toward wherever this piece is headed. note: screen right is Vector's left
  const int delta = _dVars.solver->GetTargetCol() - _dVars.game->GetPiece().x;
  if( (delta > -2) && (delta < 2) ) {
    return;
  }

  float degrees = -2.0f * (float)delta;
  if( degrees > 12.0f )  { degrees = 12.0f; }
  if( degrees < -12.0f ) { degrees = -12.0f; }

  auto* turnAction = new TurnInPlaceAction( DEG_TO_RAD( degrees ), false );
  turnAction->SetAccel( MAX_BODY_ROTATION_ACCEL_RAD_PER_SEC2 / 2 );
  turnAction->SetMaxSpeed( MAX_BODY_ROTATION_SPEED_RAD_PER_SEC );
  DelegateIfInControl( turnAction );
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void BehaviorBlockDrop::ReactToRotation()
{
  if( IsControlDelegated() ) {
    return;
  }
  _dVars.headUp = !_dVars.headUp;
  DelegateIfInControl( new MoveHeadToAngleAction( _dVars.headUp ? kHeadAngleRad : kHeadAngleNodRad ) );
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void BehaviorBlockDrop::DrawGame( Vision::Image& image ) const
{
  if( (_dVars.game == nullptr) || (_dVars.solver == nullptr) ) {
    return;
  }

  const auto& game = *_dVars.game.get();
  const int   cell = _dVars.cell;
  const int   fx   = _dVars.fieldX;
  const int   fy   = _dVars.fieldY;

  // playfield frame
  DrawRect( image, fx - 2, fy - 2, _dVars.fieldW + 4, _dVars.fieldH + 4, kOn );

  auto drawBlock = [&image, cell]( int px, int py, uint8_t v ) {
    // one pixel of gutter so the stack reads as separate bricks
    FillRect( image, px, py, cell - 1, cell - 1, v );
  };

  // locked stack
  for( int y = 0; y < BlockDropGame::kNumRows; ++y ) {
    if( game.IsRowClearing( y ) ) {
      if( game.GetClearFlashOn() ) {
        FillRect( image, fx, fy + (y * cell), _dVars.fieldW, cell - 1, kOn );
      }
      continue;
    }
    for( int x = 0; x < BlockDropGame::kNumCols; ++x ) {
      if( game.IsBlockAt( x, y ) ) {
        drawBlock( fx + (x * cell), fy + (y * cell), kOn );
      }
    }
  }

  if( game.GetState() == BlockDropGame::State::Falling ) {

    const BlockDropGame::Piece& p = game.GetPiece();
    BlockDropGame::Cell cells[4];
    BlockDropGame::GetCells( p.type, p.rot, cells );

    // ghost: where it lands if nothing changes
    const int ghostY = _dVars.solver->GetGhostY();
    if( ghostY != p.y ) {
      for( int i = 0; i < 4; ++i ) {
        const int bx = p.x + cells[i].x;
        const int by = ghostY + cells[i].y;
        if( (by >= 0) && (bx >= 0) && (bx < BlockDropGame::kNumCols) ) {
          DrawRect( image, fx + (bx * cell), fy + (by * cell), cell - 1, cell - 1, kGhost );
        }
      }
    }

    // live piece
    for( int i = 0; i < 4; ++i ) {
      const int bx = p.x + cells[i].x;
      const int by = p.y + cells[i].y;
      if( (by >= 0) && (bx >= 0) && (bx < BlockDropGame::kNumCols) ) {
        drawBlock( fx + (bx * cell), fy + (by * cell), kOn );
      }
    }
  }

  // - - - left panel: next piece + stack meter - - -
  const int leftX = _dVars.leftX;
  DrawString( image, leftX, fy, "NEXT", 1, kOn );

  const int boxSize = (4 * cell) + 2;
  DrawRect( image, leftX, fy + 8, boxSize, boxSize, kGhost );
  {
    BlockDropGame::Cell cells[4];
    BlockDropGame::GetCells( game.GetNextPiece(), 0, cells );
    for( int i = 0; i < 4; ++i ) {
      FillRect( image,
                leftX + 1 + (cells[i].x * cell),
                fy + 9 + (cells[i].y * cell),
                cell - 1, cell - 1, kOn );
    }
  }

  // stack meter: how close the top of the pile is to the ceiling
  int highest = BlockDropGame::kNumRows;
  for( int y = 0; y < BlockDropGame::kNumRows; ++y ) {
    if( game.GetRows()[y] != 0 ) {
      highest = y;
      break;
    }
  }
  const int filled  = BlockDropGame::kNumRows - highest;
  const int meterY  = fy + 8 + boxSize + 6;
  const int meterW  = boxSize;
  DrawString( image, leftX, meterY, "STACK", 1, kOn );
  DrawRect( image, leftX, meterY + 7, meterW, 5, kGhost );
  const int barW = (filled * (meterW - 2)) / BlockDropGame::kNumRows;
  FillRect( image, leftX + 1, meterY + 8, barW, 3, kOn );

  // - - - right panel: score, level, lines, high score - - -
  const int rightX = _dVars.rightX;
  int ty = fy;

  DrawString( image, rightX, ty, "SCORE", 1, kOn );
  ty += 7;
  DrawString( image, rightX, ty, std::to_string( game.GetScore() ), 2, kOn );
  ty += 13;

  DrawString( image, rightX, ty, "LEVEL", 1, kOn );
  ty += 7;
  DrawString( image, rightX, ty, std::to_string( game.GetLevel() ), 1, kOn );
  ty += 8;

  DrawString( image, rightX, ty, "LINES", 1, kOn );
  ty += 7;
  DrawString( image, rightX, ty, std::to_string( game.GetLines() ), 1, kOn );
  ty += 8;

  DrawString( image, rightX, ty, "HI", 1, kGhost );
  DrawString( image, rightX + 10, ty, std::to_string( _dVars.highScore ), 1, kGhost );
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void BehaviorBlockDrop::DrawGameOver( Vision::Image& image ) const
{
  if( _dVars.game == nullptr ) {
    return;
  }

  const int w = FACE_DISPLAY_WIDTH;
  const int h = FACE_DISPLAY_HEIGHT;

  DrawRect( image, 2, 2, w - 4, h - 4, kOn );

  const std::string line1 = "TOPPED OUT";
  const std::string line2 = "SCORE " + std::to_string( _dVars.game->GetScore() );
  const std::string line3 = "BEST " + std::to_string( _dVars.highScore );

  const bool isBest = ( (int)_dVars.game->GetScore() >= _dVars.highScore );

  DrawString( image, (w - StringWidth( line1, 2 )) / 2, (h / 2) - 24, line1, 2, kOn );
  DrawString( image, (w - StringWidth( line2, 2 )) / 2, (h / 2) - 4,  line2, 2, kOn );
  DrawString( image, (w - StringWidth( line3, 1 )) / 2, (h / 2) + 12, line3, 1, isBest ? kOn : kGhost );

  if( isBest ) {
    const std::string nb = "NEW BEST";
    DrawString( image, (w - StringWidth( nb, 1 )) / 2, (h / 2) + 22, nb, 1, kOn );
  }
}

} // namespace Vector
} // namespace Anki
