/**
 * File: socialPresenceEstimator.cpp
 *
 * Author: Andrew Stout
 * Created: 2019-04-02
 *
 * Description: Estimates whether someone receptive to social engagement is available.
 *
 * Copyright: Anki, Inc. 2019
 *
 **/

#include "engine/receptiveSocialPresenceEstimator/socialPresenceEstimator.h"

#include "clad/externalInterface/messageEngineToGame.h"
#include "clad/types/salientPointTypes.h"
#include "coretech/common/engine/utils/timer.h"
#include "engine/aiComponent/aiComponent.h"
#include "engine/aiComponent/behaviorComponent/behaviorComponent.h"
#include "engine/aiComponent/behaviorComponent/userIntentComponent.h"
#include "engine/aiComponent/salientPointsComponent.h"
#include "engine/components/mics/micComponent.h"
#include "engine/components/mics/micDirectionHistory.h"
#include "engine/components/sensors/touchSensorComponent.h"
#include "engine/contextWrapper.h"
#include "engine/cozmoContext.h"
#include "engine/robot.h"
#include "json/json.h"
#include "util/console/consoleInterface.h"
#include "util/logging/logging.h"
#include "webServerProcess/src/webService.h"
#include "webServerProcess/src/webVizSender.h"

#include <cmath>
#include <functional>
#include <math.h>

namespace Anki {
namespace Vector {

#define LOG_CHANNEL "RSPE"

namespace {
  float kEpsilon = 0.01; // threshold for calling a SocialPresenceEvent's value zero
  float kmicPowerScoreThreshold = 2.0; // TODO: not tuned at all, and definitely will want to be.

  const std::string kWebVizModuleName = "socialpresence";
  const float kMinRSPIUpdatePeriod_s = 0.1;

  CONSOLE_VAR(float, kRSPE_WebVizPeriod_s, "SocialPresenceEstimator", 0.5f);
}


float ExponentialDecay::operator()(float value, float dt_s)
{
  float ret = value * pow((1.0 - _ratePerSec), dt_s);
  // should zero out when we get close to zero
  if (fabs(ret) < kEpsilon) {
    ret = 0.0f;
  }
  return ret;
}

// TODO: change this so that it applies the decay to a multiplier that starts
// at ~1.0, rather than directly on the value
float PowerDecay::operator()(float value, float dt_s)
{
  if (fabs(value) < kEpsilon) {
    return 0.0f;
  }
  if (value >= 1.0) {
    value = 0.99;
  }
  if (value <= -1.0) {
    value = -0.99;
  }
  float sign = value >= 0.0 ? 1.0 : -1.0;
  float power = 1.0 + (dt_s*(_power - 1.0));
  float mag = pow(fabs(value), power);
  float ret = sign * mag;
  return ret;
}




SocialPresenceEvent::SocialPresenceEvent(std::string name,
    std::shared_ptr<IDecayFunction> decayFunction,
    float independentEffect,
    float independentEffectMax,
    float reinforcementEffect,
    float reinforcementEffectMax,
    bool resetPriorOnTrigger)
: _value(0.0),
  _name(name),
  _independentEffect(independentEffect),
  _independentEffectMax(independentEffectMax),
  _reinforcementEffect(reinforcementEffect),
  _reinforcementEffectMax(reinforcementEffectMax),
  _resetPriorOnTrigger(resetPriorOnTrigger)
{
  _decay = decayFunction;
}

SocialPresenceEvent::~SocialPresenceEvent()
{

}


void SocialPresenceEvent::Update(float dt_s)
{
  _value = (*_decay)(_value, dt_s);
}

void SocialPresenceEvent::Trigger(float& rspi) {
  if (rspi > _independentEffectMax) {
    // reinforcement
    _value = _reinforcementEffect;
  } else /*if (rspi >= 0.0)*/ {
    // independent effect
    _value = _independentEffect;
  }
  // if rspi < 0, trigger is inhibited
}



SocialPresenceEstimator::SocialPresenceEstimator()
: IDependencyManagedComponent<RobotComponentID>(this, RobotComponentID::SocialPresenceEstimator)
, _rspi(0.0f)
{

}


SocialPresenceEstimator::~SocialPresenceEstimator()
{
  if ((_uic != nullptr) && (_newUserIntentHandle != 0)) {
    _uic->UnRegisterNewUserIntentCallback(_newUserIntentHandle);
    _newUserIntentHandle = 0;
  }
  if ((_micHistory != nullptr) && (_micPowerSampleHandle != kInvalidSoundReactorId)) {
    _micHistory->UnRegisterSoundReactor(_micPowerSampleHandle);
    _micPowerSampleHandle = kInvalidSoundReactorId;
  }
}


void SocialPresenceEstimator::InitDependent(Vector::Robot* robot, const RobotCompMap& dependentComps)
{
  _robot = robot;

  // subscribe to inputs

  // new user intent
  auto& uic = dependentComps.GetComponent<AIComponent>()
                .GetComponent<BehaviorComponent>()
                .GetComponent<UserIntentComponent>();
  _uic = &uic;
  _newUserIntentHandle =
      uic.RegisterNewUserIntentCallback(std::bind(&SocialPresenceEstimator::OnNewUserIntent,
                                                  this, std::placeholders::_1));

  // Face + Motion E2G already produced; one handle per tag (never overwrite)
  if (_robot->HasExternalInterface()) {
    _signalHandles.emplace_back(_robot->GetExternalInterface()->Subscribe(
        ExternalInterface::MessageEngineToGameTag::RobotObservedFace,
        std::bind(&SocialPresenceEstimator::OnRobotObservedFace, this,
                  std::placeholders::_1)));
    _signalHandles.emplace_back(_robot->GetExternalInterface()->Subscribe(
        ExternalInterface::MessageEngineToGameTag::RobotObservedMotion,
        std::bind(&SocialPresenceEstimator::OnRobotObservedMotion, this,
                  std::placeholders::_1)));
  }

  _micHistory = &dependentComps.GetComponent<MicComponent>().GetMicDirectionHistory();
  _micPowerSampleHandle = _micHistory->RegisterSoundReactor(
      std::bind(&SocialPresenceEstimator::OnMicPowerSample, this,
                std::placeholders::_1, std::placeholders::_2, std::placeholders::_3));

  if (ANKI_DEV_CHEATS) {
    SubscribeToWebViz();
  }
}


void SocialPresenceEstimator::UpdateDependent(const RobotCompMap& dependentComps)
{
  UpdateInputs(dependentComps);

  UpdateRSPI();

  if (ANKI_DEV_CHEATS && dependentComps.HasComponent<ContextWrapper>()) {
    const float currentTime = BaseStationTimer::getInstance()->GetCurrentTimeInSeconds();
    if ((currentTime - _lastWebVizSendTime_s) > kRSPE_WebVizPeriod_s) {
      SendDataToWebViz(dependentComps.GetComponent<ContextWrapper>().context);
    }
  }
}


void SocialPresenceEstimator::UpdateInputs(const RobotCompMap& dependentComps)
{
  // poll the inputs we need to poll
  auto& touch = dependentComps.GetComponent<TouchSensorComponent>();
  PollTouch(touch);

  if (dependentComps.HasComponent<AIComponent>()) {
    SalientPointsComponent& sp =
        dependentComps.GetComponent<AIComponent>().GetComponent<SalientPointsComponent>();
    if (sp.SalientPointDetected(Vision::SalientPointType::Person)) {
      _pendingPerson = true;
    }
    if (sp.SalientPointDetected(Vision::SalientPointType::Hand)) {
      _pendingHand = true;
    }
  }
}


void SocialPresenceEstimator::UpdateRSPI()
{
  // get current time
  const float currentTime = BaseStationTimer::getInstance()->GetCurrentTimeInSeconds();
  // compute dt_s
  const float dt_s = currentTime - _lastInputEventsUpdateTime_s;
  // limit update rate
  if (dt_s >= kMinRSPIUpdatePeriod_s) {

    // update all (singleton) input events
    for (SocialPresenceEvent* inputEvent : _inputEvents) {
      inputEvent->Update(dt_s);
    }

    // consume pending bits (at most one trigger per event per RSPI period)
    if (_pendingUserIntent) {
      TriggerInputEvent(&_SPEUserIntent);
      _pendingUserIntent = false;
    }
    if (_pendingFace) {
      TriggerInputEvent(&_SPEFace);
      _pendingFace = false;
    }
    if (_pendingMotion) {
      TriggerInputEvent(&_SPEMotion);
      _pendingMotion = false;
    }
    if (_pendingHand) {
      TriggerInputEvent(&_SPEHand);
      _pendingHand = false;
    }
    if (_pendingPerson) {
      TriggerInputEvent(&_SPEPerson);
      _pendingPerson = false;
    }
    if (_pendingSleep) {
      TriggerInputEvent(&_SPESleep);
      _pendingSleep = false;
    }
    if (_pendingQuiet) {
      TriggerInputEvent(&_SPEQuiet);
      _pendingQuiet = false;
    }
    if (_pendingShutUp) {
      TriggerInputEvent(&_SPEShutUp);
      _pendingShutUp = false;
    }
    if (_pendingTouch) {
      TriggerInputEvent(&_SPETouch);
      _pendingTouch = false;
    }
    if (_pendingSound) {
      TriggerInputEvent(&_SPESound);
      _pendingSound = false;
    }

    // update all (dynamic) input events
    // cull any expired dynamic input events
    // update RSPI: iterate through all input events, summing their values
    // TODO (AS): I'm not totally happy with this implementation yet: hard to follow, at least.
    float newRSPI = 0;
    for (SocialPresenceEvent* inputEvent : _inputEvents) {
      if (_rspi >= inputEvent->GetIndependentEffectMax()) {
        newRSPI = fmax(-1.0, fmin(1.0, fmin( fmax(newRSPI, inputEvent->GetReinforcementEffectMax()),
                                             (newRSPI + inputEvent->GetValue()) ) ));
      } else {
        newRSPI = fmax(-1.0, fmin(1.0, fmin( fmax(newRSPI, inputEvent->GetIndependentEffectMax()),
                                             (newRSPI + inputEvent->GetValue()) ) ));
      }
    }
    _rspi = newRSPI;

    _lastInputEventsUpdateTime_s = currentTime;
  }
}


void SocialPresenceEstimator::TriggerInputEvent(SocialPresenceEvent* inputEvent) {
  LOG_DEBUG("SocialPresenceEstimator.TriggerInputEvent.Triggering",
      "Triggering input event %s", inputEvent->GetName().c_str());
  if (inputEvent->GetReset()) {
    // reset all inputEvents
    for (auto* priorEvent : _inputEvents) {
      priorEvent->Reset();
    }
  }
  inputEvent->Trigger(_rspi);
  LOG_DEBUG("SocialPresenceEstimator.TriggerInputEvent.TriggeredValue",
      "Triggered value of %s: %f", inputEvent->GetName().c_str(), inputEvent->GetValue());
}


// ******** Input Event Handlers ********

void SocialPresenceEstimator::OnNewUserIntent(const UserIntentTag tag)
{
  // filter out specific intents here
  if (tag == USER_INTENT(system_sleep)) {
    LOG_DEBUG("SocialPresenceEstimator.OnNewUserIntent.Specific", "system_sleep");
    _pendingSleep = true;
  } else if (tag == USER_INTENT(imperative_quiet)) {
    LOG_DEBUG("SocialPresenceEstimator.OnNewUserIntent.Specific", "imperative_quiet");
    _pendingQuiet = true;
  } else if (tag == USER_INTENT(imperative_shutup)) {
    LOG_DEBUG("SocialPresenceEstimator.OnNewUserIntent.Specific", "imperative_shutup");
    _pendingShutUp = true;
  } else {
    _pendingUserIntent = true;
  }
}


void SocialPresenceEstimator::OnRobotObservedFace(
    const AnkiEvent<ExternalInterface::MessageEngineToGame>& /*msg*/)
{
  _pendingFace = true;
}


void SocialPresenceEstimator::OnRobotObservedMotion(
    const AnkiEvent<ExternalInterface::MessageEngineToGame>& /*msg*/)
{
  _pendingMotion = true;
}


bool SocialPresenceEstimator::OnMicPowerSample(double micPowerLevel,
                                               MicDirectionConfidence /*conf*/,
                                               MicDirectionIndex /*dir*/)
{
  if (micPowerLevel > kmicPowerScoreThreshold) {
    _pendingSound = true;
  }
  return false;
}


// ******** Input Event pollers ********

void SocialPresenceEstimator::PollTouch(const TouchSensorComponent& touchSensorComponent)
{
  const bool pressed = touchSensorComponent.GetIsPressed();
  if (pressed && !_touchWasPressed) {
    _pendingTouch = true;
  }
  _touchWasPressed = pressed;
}


// ******** WebViz Stuff *********

void SocialPresenceEstimator::SubscribeToWebViz()
{
  if (_robot == nullptr) {
    return;
  }
  const auto* context = _robot->GetContext();
  if (context == nullptr) {
    return;
  }
  auto* webService = context->GetWebService();
  if (webService == nullptr) {
    return;
  }

  auto onSubscribedBehaviors = [this](const std::function<void(const Json::Value&)>& sendToClient) {
    // a client subscribed.
    // send them a list of events to spoof
    Json::Value subscriptionData;
    auto& data = subscriptionData["info"];
    auto& events = data["events"];
    for (auto* inputEvent : _inputEvents) {
      Json::Value eventEntry;
      const std::string eventName = inputEvent->GetName();
      eventEntry["eventName"] = eventName;
      const bool isInhibitor = (eventName == "Sleep") ||
                               (eventName == "Quiet") ||
                               (eventName == "ShutUp");
      eventEntry["kind"] = isInhibitor ? "inhibitor" : "evidence";
      events[eventName] = eventEntry;
    }
    sendToClient(subscriptionData);
  };

  auto onDataBehaviors = [this](const Json::Value& data,
                                const std::function<void(const Json::Value&)>& /*sendToClient*/) {
    LOG_DEBUG("RSPE.SubscribeToWebViz.onDataBehaviors.GotEvent",
              "RSPE got WebViz event %s", data["eventName"].asString().c_str());
    // TODO: a name : inputEvent map would be more efficient
    for (auto* inputEvent : _inputEvents) {
      if (data["eventName"].asString() == inputEvent->GetName()) {
        TriggerInputEvent(inputEvent);
        break;
      }
    }
  };

  _signalHandles.emplace_back(webService->OnWebVizSubscribed(kWebVizModuleName).ScopedSubscribe(
                                onSubscribedBehaviors));
  _signalHandles.emplace_back(webService->OnWebVizData(kWebVizModuleName).ScopedSubscribe(
                                onDataBehaviors));
}


void SocialPresenceEstimator::SendDataToWebViz(const CozmoContext* context)
{
  if (nullptr == context) {
    return;
  }

  auto webSender = WebService::WebVizSender::CreateWebVizSender(kWebVizModuleName,
                                                                context->GetWebService());
  if (!webSender) {
    return;
  }

  const float currentTime_s = BaseStationTimer::getInstance()->GetCurrentTimeInSeconds();
  Json::Value& data = webSender->Data();
  data["time"] = currentTime_s;
  data["vetoThreshold"] = 0.0f;

  auto& graphData = data["graphData"];
  Json::Value rspi;
  rspi["name"] = "RSPI";
  rspi["value"] = _rspi;
  graphData.append(rspi);
  for (auto* inputEvent : _inputEvents) {
    Json::Value iedata;
    iedata["name"] = inputEvent->GetName();
    iedata["value"] = inputEvent->GetValue();
    graphData.append(iedata);
  }

  _lastWebVizSendTime_s = currentTime_s;
}




}
}
