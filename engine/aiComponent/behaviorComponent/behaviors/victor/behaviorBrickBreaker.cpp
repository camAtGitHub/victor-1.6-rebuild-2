#include "engine/aiComponent/behaviorComponent/behaviors/victor/behaviorBrickBreaker.h"
#include "engine/aiComponent/behaviorComponent/behaviors/victor/brickBreakerGame.h"
#include "engine/aiComponent/behaviorComponent/behaviors/victor/brickBreakerSolver.h"
#include "anki/cozmo/shared/cozmoConfig.h"
#include "coretech/common/engine/colorRGBA.h"
#include "coretech/common/engine/utils/timer.h"
#include "coretech/vision/engine/image.h"
#include "engine/actions/basicActions.h"
#include "engine/actions/compoundActions.h"
#include "engine/audio/engineRobotAudioClient.h"
#include "engine/components/animationComponent.h"
#include "clad/audio/audioEventTypes.h"
#include "util/random/randomGenerator.h"
#include <algorithm>

namespace Anki {
namespace Vector {
BehaviorBrickBreaker::BehaviorBrickBreaker(const Json::Value& config) : ICozmoBehavior(config) {}
BehaviorBrickBreaker::~BehaviorBrickBreaker() {}
bool BehaviorBrickBreaker::WantsToBeActivatedBehavior() const { return true; }
void BehaviorBrickBreaker::GetBehaviorOperationModifiers(BehaviorOperationModifiers& m) const {
  m.wantsToBeActivatedWhenOnCharger=true;
  m.wantsToBeActivatedWhenOffTreads=false;
  m.wantsToBeActivatedWhenCarryingObject=false;
  m.behaviorAlwaysDelegates=false;
}
void BehaviorBrickBreaker::OnBehaviorActivated() {
  _image.reset(); _game.reset(); _solver.reset();
  _accumulator=0; _finishTime=0;
  _startTime=BaseStationTimer::getInstance()->GetCurrentTimeInSecondsDouble();
  _lastMotion=_startTime;
  // No wheel actions. Wait until head positioning has finished before owning the face.
  DelegateIfInControl(new MoveHeadToAngleAction(MAX_HEAD_ANGLE), [this](ActionResult result) {
    if (result != ActionResult::SUCCESS) { CancelSelf(); return; }
    StartGame();
  });
}
void BehaviorBrickBreaker::StartGame() {
  const uint32_t seed=static_cast<uint32_t>(GetBEI().GetRNG().RandIntInRange(1,1000000000));
  _image.reset(new Vision::Image(FACE_DISPLAY_HEIGHT,FACE_DISPLAY_WIDTH,NamedColors::BLACK));
  _game.reset(new BrickBreakerGame(FACE_DISPLAY_WIDTH,FACE_DISPLAY_HEIGHT,seed));
  _solver.reset(new BrickBreakerSolver(seed ^ 0xA53C91u));
  _lastTime=BaseStationTimer::getInstance()->GetCurrentTimeInSecondsDouble();
  _lastFrame=_lastTime-1; _lastSound=_lastTime-1;
}
void BehaviorBrickBreaker::OnBehaviorDeactivated() {
  _solver.reset(); _game.reset(); _image.reset();
  // Frames expire after 100ms; do not overwrite a higher-priority behavior's face.
}
void BehaviorBrickBreaker::BehaviorUpdate() {
  if (!IsActivated()) { return; }
  const double now=BaseStationTimer::getInstance()->GetCurrentTimeInSecondsDouble();
  // Wall-clock watchdog also handles failed delegation and sustained engine stalls.
  if (now-_startTime > 100.0 || (!_game && now-_startTime > 5.0)) { CancelSelf(); return; }
  if (!_game) { return; }
  _accumulator += std::max(0.0,std::min(0.1,now-_lastTime));
  _lastTime=now;
  unsigned events=0;
  int steps=0;
  while (_accumulator>=BrickBreakerGame::StepSeconds() && steps<12) {
    events |= _game->Step(_solver->ChooseTarget(*_game));
    _accumulator-=BrickBreakerGame::StepSeconds();
    ++steps;
  }
  if (steps==12) { _accumulator=0; } // discard backlog; never block the engine to catch up
  if ((events & BrickBreakerGame::BrickHit) && now-_lastSound>=0.15) {
    GetBEI().GetRobotAudioClient().PostEvent(
      AudioMetaData::GameEvent::GenericEvent::Play__Robot_Vic_Sfx__Speaker_Test_05,
      AudioMetaData::GameObjectType::Behavior);
    _lastSound=now;
  }
  ReactToGame(events,now);
  // At most 20 face submissions/sec, independently of the animation frame-rate toggle.
  if (now-_lastFrame>=0.05) {
    _game->Render(_image->GetRawDataPointer(),
                  static_cast<std::size_t>(FACE_DISPLAY_WIDTH)*FACE_DISPLAY_HEIGHT);
    GetBEI().GetAnimationComponent().DisplayFaceImage(*_image,100,true);
    _lastFrame=now;
  }
  if (_game->GetPhase()==BrickBreakerGame::Phase::Finished) {
    if (_finishTime==0) { _finishTime=now; }
    if (now-_finishTime>=2.5) { CancelSelf(); }
  }
}
void BehaviorBrickBreaker::ReactToGame(unsigned events, double now) {
  if (IsControlDelegated()) { return; }
  // Sparse reactions keep the tiny screen readable. No reaction backlog.
  if ((events & BrickBreakerGame::Clear) && now-_lastMotion>=1.0) {
    auto* pump=new CompoundActionSequential();
    pump->AddAction(new MoveLiftToHeightAction(MoveLiftToHeightAction::Preset::CARRY),true);
    pump->AddAction(new MoveLiftToHeightAction(MoveLiftToHeightAction::Preset::LOW_DOCK),true);
    DelegateIfInControl(pump);
    _lastMotion=now;
  } else if ((events & (BrickBreakerGame::Miss | BrickBreakerGame::PaddleHit)) &&
             now-_lastMotion>=3.0) {
    auto* nod=new CompoundActionSequential();
    // About four degrees: a little acknowledgement without hiding the game.
    nod->AddAction(new MoveHeadToAngleAction(MAX_HEAD_ANGLE-0.07f),true);
    nod->AddAction(new MoveHeadToAngleAction(MAX_HEAD_ANGLE),true);
    DelegateIfInControl(nod);
    _lastMotion=now;
  }
}
}
}
