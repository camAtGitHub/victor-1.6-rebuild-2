/**
 * File: behaviorBlockDrop.h
 *
 * Author: camAtGitHub
 * Created: 2026-09-09
 *
 * Description: Vector plays a falling-block stacking game on his face. His solver is greedy
 *              with a level-scaling error rate, so he always tops out eventually.
 *
 **/

#ifndef __Engine_AiComponent_BehaviorComponent_Behaviors_Victor_BehaviorBlockDrop_H__
#define __Engine_AiComponent_BehaviorComponent_Behaviors_Victor_BehaviorBlockDrop_H__

#include "engine/aiComponent/behaviorComponent/behaviors/iCozmoBehavior.h"
#include "coretech/vision/engine/image.h"

#include <memory>

namespace Anki {
namespace Vector {

class BlockDropGame;
class BlockDropSolver;

class BehaviorBlockDrop : public ICozmoBehavior
{
public:
  virtual ~BehaviorBlockDrop();

protected:

  friend class BehaviorFactory;
  explicit BehaviorBlockDrop( const Json::Value& config );

  virtual bool WantsToBeActivatedBehavior() const override;
  virtual void GetBehaviorOperationModifiers( BehaviorOperationModifiers& modifiers ) const override;
  virtual void GetBehaviorJsonKeys(std::set<const char*>& expectedKeys) const override {}
  virtual void OnBehaviorActivated() override;
  virtual void OnBehaviorDeactivated() override;
  virtual void BehaviorUpdate() override;

private:

  bool CanTurnInPlace() const;
  void SetupGeometry();
  void DrawGame( Vision::Image& image ) const;
  void DrawGameOver( Vision::Image& image ) const;
  void ReactToLineClear( uint8_t numLines );
  void ReactToNewPiece();
  void ReactToRotation();

  struct DynamicVariables {
    std::unique_ptr<Vision::Image>   image;
    std::unique_ptr<BlockDropGame>   game;
    std::unique_ptr<BlockDropSolver> solver;

    unsigned int gravityTicks   = 0;
    unsigned int inputTicks     = 0;
    unsigned int gameOverTicks  = 0;
    bool         lost           = false;
    bool         liftUp         = false;
    bool         headUp         = false;
    int          highScore      = 0;

    // layout, computed once from the display size
    int cell   = 5;
    int fieldX = 0;
    int fieldY = 0;
    int leftX  = 0;
    int rightX = 0;
    int fieldW = 0;
    int fieldH = 0;
  };

  DynamicVariables _dVars;
};

} // namespace Vector
} // namespace Anki

#endif
