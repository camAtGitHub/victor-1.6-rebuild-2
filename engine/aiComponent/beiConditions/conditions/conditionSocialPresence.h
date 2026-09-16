/**
* File: conditionSocialPresence.h
*
* Description: Condition to compare against SocialPresenceEstimator RSPI
*
* Copyright: Anki, Inc. 2019
*
**/

#ifndef __Engine_AiComponent_BeiConditions_ConditionSocialPresence_H__
#define __Engine_AiComponent_BeiConditions_ConditionSocialPresence_H__

#include "engine/aiComponent/beiConditions/iBEICondition.h"

namespace Anki {
namespace Vector {

class ConditionSocialPresence : public IBEICondition
{
public:
  explicit ConditionSocialPresence(const Json::Value& config);

protected:
  virtual bool AreConditionsMetInternal(BehaviorExternalInterface& behaviorExternalInterface) const override;

private:
  void LoadJson(const Json::Value& config);

  bool _useRange;
  float _maxScore;
  float _minScore;
  float _exactScore;
};


} // namespace Vector
} // namespace Anki

#endif // __Engine_AiComponent_BeiConditions_ConditionSocialPresence_H__
