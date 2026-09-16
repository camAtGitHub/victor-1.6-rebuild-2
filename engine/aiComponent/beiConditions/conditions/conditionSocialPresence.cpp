/**
* File: conditionSocialPresence.cpp
*
* Description: Condition to compare against SocialPresenceEstimator RSPI
*
* Copyright: Anki, Inc. 2019
*
**/

#include "engine/aiComponent/beiConditions/conditions/conditionSocialPresence.h"

#include "coretech/common/engine/jsonTools.h"
#include "engine/aiComponent/behaviorComponent/behaviorExternalInterface/behaviorExternalInterface.h"
#include "engine/receptiveSocialPresenceEstimator/socialPresenceEstimator.h"
#include "util/logging/logging.h"
#include "util/math/math.h"

#include <limits>

namespace Anki {
namespace Vector {

namespace{
static const char* kMaxKey = "max";
static const char* kMinKey = "min";
static const char* kValueKey = "value";
static const char* kDebugKey = "ConditionSocialPresence";
}


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
ConditionSocialPresence::ConditionSocialPresence(const Json::Value& config)
  : IBEICondition(config)
{
  LoadJson(config);
}


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
bool ConditionSocialPresence::AreConditionsMetInternal(BehaviorExternalInterface& behaviorExternalInterface) const
{
  if(!behaviorExternalInterface.HasSocialPresenceEstimator()){
    return false;
  }
  const float value = behaviorExternalInterface.GetSocialPresenceEstimator().GetRSPI();

  bool areConditionsMet;
  if( _useRange ) {
    areConditionsMet = (value >= _minScore) && (value <= _maxScore);
  } else {
    areConditionsMet = FLT_NEAR( value, _exactScore );
  }
  return areConditionsMet;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
void ConditionSocialPresence::LoadJson(const Json::Value& config)
{
  if( !config[kMaxKey].isNull() || !config[kMinKey].isNull() ) {
    DEV_ASSERT( config[kValueKey].isNull(), "Can't specify both value and min/max" );
    _minScore = config.get( kMinKey, std::numeric_limits<float>::lowest() ).asFloat();
    _maxScore = config.get( kMaxKey, std::numeric_limits<float>::max() ).asFloat();
    _useRange = true;
  } else {
    _exactScore = JsonTools::ParseFloat( config, kValueKey, kDebugKey );
    _useRange = false;
  }
}

} // namespace Vector
} // namespace Anki
