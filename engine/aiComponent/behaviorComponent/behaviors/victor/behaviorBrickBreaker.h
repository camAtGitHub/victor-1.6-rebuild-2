#pragma once
#include "engine/aiComponent/behaviorComponent/behaviors/iCozmoBehavior.h"
#include <memory>

namespace Anki {
namespace Vision { class Image; }
namespace Vector {
class BrickBreakerGame;
class BrickBreakerSolver;

class BehaviorBrickBreaker : public ICozmoBehavior
{
public:
  virtual ~BehaviorBrickBreaker();
protected:
  friend class BehaviorFactory;
  explicit BehaviorBrickBreaker(const Json::Value& config);
  virtual void GetBehaviorOperationModifiers(BehaviorOperationModifiers& modifiers) const override;
  virtual void GetBehaviorJsonKeys(std::set<const char*>& expectedKeys) const override {}
  virtual bool WantsToBeActivatedBehavior() const override;
  virtual void OnBehaviorActivated() override;
  virtual void OnBehaviorDeactivated() override;
  virtual void BehaviorUpdate() override;
private:
  void StartGame();
  void ReactToGame(unsigned events, double now);
  std::unique_ptr<Vision::Image> _image;
  std::unique_ptr<BrickBreakerGame> _game;
  std::unique_ptr<BrickBreakerSolver> _solver;
  double _lastTime=0, _lastFrame=0, _lastSound=0, _finishTime=0, _startTime=0;
  double _accumulator=0;
  double _lastMotion=0;
};
}
}
