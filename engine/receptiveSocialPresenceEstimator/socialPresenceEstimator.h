/**
 * File: socialPresenceEstimator.h
 *
 * Author: Andrew Stout
 * Created: 2019-04-02
 *
 * Description: Estimates whether someone receptive to social engagement is available.
 *
 * Copyright: Anki, Inc. 2019
 *
 **/

#ifndef __Engine_ReceptiveSocialPresenceEstimator_SocialPresenceEstimator_H__
#define __Engine_ReceptiveSocialPresenceEstimator_SocialPresenceEstimator_H__

#include "engine/aiComponent/behaviorComponent/userIntents.h"
#include "engine/components/mics/micDirectionTypes.h"
#include "engine/externalInterface/externalInterface.h"
#include "engine/robotComponents_fwd.h"
#include "util/entityComponent/iDependencyManagedComponent.h"
#include "util/helpers/noncopyable.h"
#include "util/signals/simpleSignal_fwd.h"

#include <memory>
#include <string>
#include <vector>

namespace Anki {
namespace Vector {

class Robot;
class TouchSensorComponent;
class CozmoContext;
class UserIntentComponent;
class MicDirectionHistory;


class IDecayFunction {
public:
  IDecayFunction() {};
  virtual ~IDecayFunction() {};
  // TODO: I'm sure there's a way to make this pure virtual and have it work. Figure it out.
  virtual float operator()(float value, float dt_s) {return value;};
};

class ExponentialDecay : public IDecayFunction {
public:
  ExponentialDecay(float ratePerSec) : _ratePerSec(ratePerSec) {};
  virtual float operator()(float value, float dt_s) override;

private:
  float _ratePerSec;
};

class PowerDecay: public IDecayFunction {
public:
  PowerDecay(float power) : _power(power) {};
  virtual float operator()(float value, float dt_s) override;

private:
  float _power;
};


// class for social presence event ("evidence")
class SocialPresenceEvent {
public:
  // constructor
  SocialPresenceEvent(std::string name,
      std::shared_ptr<IDecayFunction> decayFunction,
      float independentEffect,
      float independentEffectMax,
      float reinforcementEffect,
      float reinforcementEffectMax,
      bool resetPriorOnTrigger = false);
  // destructor
  virtual ~SocialPresenceEvent();

  // accessors
  std::string GetName() const { return _name; };
  float GetValue() const { return _value; };
  float GetIndependentEffect() const { return _independentEffect; };
  float GetIndependentEffectMax() const { return _independentEffectMax; };
  float GetReinforcementEffect() const { return _reinforcementEffect; };
  float GetReinforcementEffectMax() const { return _reinforcementEffectMax; };
  bool GetReset() const { return _resetPriorOnTrigger; };

  // methods
  void Update(float dt_s);
  void Trigger(float& rspi);
  void Reset() { _value = 0.0; };

private:
  // private member vars
  float _value;
  std::string _name;
  // decay function
  std::shared_ptr<IDecayFunction> _decay;
  // independent effect - the effect if the RSPI starts below the...
  float _independentEffect;
  // independent effect maximum - the highest this event can increase the RSPI to,
  // given that it started below
  float _independentEffectMax;
  // reinforcement effect - the effect if the RSPI starts above the independent effect maximum
  float _reinforcementEffect;
  // reinforcement effect maximum - the highest this event can increase the RSPI to
  float _reinforcementEffectMax;
  // should all prior events be reset on trigger
  bool _resetPriorOnTrigger;
};


class SocialPresenceEstimator : public IDependencyManagedComponent<RobotComponentID>,
                                private Util::noncopyable
{
public:
  explicit SocialPresenceEstimator();
  ~SocialPresenceEstimator();

  //////
  // IDependencyManagedComponent functions
  //////
  virtual void GetInitDependencies(RobotCompIDSet& dependencies) const override {
    dependencies.insert(RobotComponentID::AIComponent);
    dependencies.insert(RobotComponentID::MicComponent);
  };
  virtual void InitDependent(Vector::Robot* robot, const RobotCompMap& dependentComps) override;
  virtual void GetUpdateDependencies(RobotCompIDSet& dependencies) const override {
    dependencies.insert(RobotComponentID::CozmoContextWrapper);
    dependencies.insert(RobotComponentID::TouchSensor);
  }
  virtual void AdditionalUpdateAccessibleComponents(RobotCompIDSet& components) const override {
    components.insert(RobotComponentID::AIComponent);
  }
  virtual void UpdateDependent(const RobotCompMap& dependentComps) override;

  float GetRSPI() const { return _rspi; }


  // ******** Input Event Handlers ********

  void OnNewUserIntent(const UserIntentTag tag);
  void OnRobotObservedFace(const AnkiEvent<ExternalInterface::MessageEngineToGame>& msg);
  void OnRobotObservedMotion(const AnkiEvent<ExternalInterface::MessageEngineToGame>& msg);
  bool OnMicPowerSample(double micPowerLevel, MicDirectionConfidence conf, MicDirectionIndex dir);


private:
  // -------------------------- Private Member Funcs ---------------------------
  void SubscribeToWebViz();
  void SendDataToWebViz(const CozmoContext* context);
  void UpdateInputs(const RobotCompMap& dependentComps);
  void UpdateRSPI();
  void TriggerInputEvent(SocialPresenceEvent* inputEvent);

  void PollTouch(const TouchSensorComponent& touchSensorComponent);



  // -------------------------- Private Member Vars ----------------------------
  Robot* _robot = nullptr;
  UserIntentComponent* _uic = nullptr;
  MicDirectionHistory* _micHistory = nullptr;
  std::vector<Signal::SmartHandle> _signalHandles;
  float _lastWebVizSendTime_s = 0.0f;
  float _lastInputEventsUpdateTime_s = 0.0f;
  float _rspi;

  bool _pendingFace = false;
  bool _pendingMotion = false;
  bool _pendingSound = false;
  bool _pendingHand = false;
  bool _pendingPerson = false;
  bool _pendingTouch = false;
  bool _pendingUserIntent = false;
  bool _pendingSleep = false;
  bool _pendingQuiet = false;
  bool _pendingShutUp = false;
  bool _touchWasPressed = false;

  // input events
  // singleton input events are created once per input type and re-triggered
  // whenever we get that input type
  // name, decay, independent effect, independent effect max,
  // reinforcement effect, reinforcement effect max, reset
  SocialPresenceEvent _SPEUserIntent =
      SocialPresenceEvent("UserIntent", std::make_shared<ExponentialDecay>(0.1f),
                          1.0f, 1.0f, 1.0f, 1.0f, true);
  SocialPresenceEvent _SPEFace =
      SocialPresenceEvent("Face", std::make_shared<ExponentialDecay>(0.1), 0.8f, 1.0f, 0.8f, 1.0f, false);
  SocialPresenceEvent _SPEMotion =
      SocialPresenceEvent("Motion", std::make_shared<ExponentialDecay>(0.2), 0.2f, 0.5f, 0.3f, 0.8f, false);
  SocialPresenceEvent _SPEHand =
      SocialPresenceEvent("Hand", std::make_shared<ExponentialDecay>(0.2f), 0.3f, 0.5f, 0.35f, 0.9f, false);
  SocialPresenceEvent _SPEPerson =
      SocialPresenceEvent("Person", std::make_shared<ExponentialDecay>(0.1f),
                          0.6f, 0.75f, 0.6f, 1.0f, false);
  SocialPresenceEvent _SPESleep =
      SocialPresenceEvent("Sleep", std::make_shared<PowerDecay>(1.1f), -0.9f, 0.0f, -0.9f, 0.0f, true);
  SocialPresenceEvent _SPEQuiet =
      SocialPresenceEvent("Quiet", std::make_shared<PowerDecay>(1.2f), -0.9f, 0.0f, -0.9f, 0.0f, true);
  SocialPresenceEvent _SPEShutUp =
      SocialPresenceEvent("ShutUp", std::make_shared<PowerDecay>(1.15f), -0.9f, 0.0f, -0.9f, 0.0f, true);
  SocialPresenceEvent _SPETouch =
      SocialPresenceEvent("Touch", std::make_shared<ExponentialDecay>(0.2f), 0.8f, 1.0f, 0.8f, 1.0f, false);
  SocialPresenceEvent _SPESound =
      SocialPresenceEvent("Sound", std::make_shared<ExponentialDecay>(0.2f), 0.2f, 0.5f, 0.3f, 0.8f, false);

  // if needed, we can also have dynamic input events, where a new event instance
  // is created for each triggering event, and then culled once it's value drops
  // to zero.
  // Just make sure the rest of the mechanism works either way.

  std::vector<SocialPresenceEvent*> _inputEvents = {
      &_SPEUserIntent,
      &_SPEFace,
      &_SPEMotion,
      &_SPEHand,
      &_SPEPerson,
      &_SPESleep,
      &_SPEQuiet,
      &_SPEShutUp,
      &_SPETouch,
      &_SPESound
  };

  // subscription handles
  uint32_t _newUserIntentHandle = 0;
  SoundReactorId _micPowerSampleHandle = kInvalidSoundReactorId;

};

}
}




#endif // __Engine_ReceptiveSocialPresenceEstimator_SocialPresenceEstimator_H__
