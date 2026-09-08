#include "engine/aiComponent/behaviorComponent/behaviors/victor/brickBreakerGame.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace Anki {
namespace Vector {
namespace {
float Clamp(float v, float lo, float hi) { return std::max(lo, std::min(v, hi)); }
constexpr float Radius = 2.f;
constexpr int Top = 14;
// Tiny bitmap font: 3 columns x 5 rows, drawn at 2x for actual face readability.
const char* Glyph(char c) {
  switch(c) {
    case '0': return "111101101101111"; case '1': return "010110010010111";
    case '2': return "111001111100111"; case '3': return "111001111001111";
    case '4': return "101101111001001"; case '5': return "111100111001111";
    case '6': return "111100111101111"; case '7': return "111001010010010";
    case '8': return "111101111101111"; case '9': return "111101111001111";
    case 'B': return "110101110101110"; case 'E': return "111100110100111";
    case 'I': return "111010010010111"; case 'K': return "101101110101101";
    case 'L': return "100100100100111"; case 'N': return "101111111111101";
    case 'O': return "111101101101111"; case 'R': return "110101110101101";
    case 'S': return "111100111001111"; case 'T': return "111010010010010";
    case 'V': return "101101101101010"; case 'Y': return "101101010010010"; case 'U': return "101101101101111";
    case 'W': return "101101111111101";
    default: return "000000000000000";
  }
}
}
BrickBreakerGame::BrickBreakerGame(int width, int height, uint32_t seed)
: _width(width), _height(height), _rng(seed ? seed : 1)
{
  // Both formats currently used by this firmware. Reject accidental bad buffers/layouts.
  if (!((width==160 && height==80) || (width==184 && height==96))) {
    throw std::invalid_argument("BrickBreaker requires 160x80 or 184x96");
  }
  _paddle = _width*0.5f;
  NewLayout();
  Serve();
}
uint32_t BrickBreakerGame::Random() {
  _rng ^= _rng << 13; _rng ^= _rng >> 17; _rng ^= _rng << 5;
  return _rng;
}
void BrickBreakerGame::NewLayout() {
  const int cell = (_width-12)/8;
  for (int i=0; i<BrickCount; ++i) {
    auto& b = _bricks[i];
    b.x = (_width-cell*8)/2+(i%8)*cell;
    b.y = Top+5+(i/8)*8;
    b.w = cell-2; b.h=6;
    b.alive = (_level==1 ? i<16 :
               _level==2 ? (i!=0 && i!=7 && i!=9 && i!=14 && i!=16 && i!=23) :
               (i<8 || (i>=8 && i<16 && i%2==0) || (i>=16 && i%2==1)));
  }
}
void BrickBreakerGame::Serve() {
  _phase=Phase::Serving; _phaseTicks=120; _rallyTicks=0;
  _x=_paddle; _y=PaddleY()-Radius-1.f;
  const float speed = 53.f + _level*9.f;
  _vx = (Random()&1 ? 1.f : -1.f)*speed*0.45f;
  _vy = -std::sqrt(speed*speed-_vx*_vx);
}
void BrickBreakerGame::BounceFromPaddle() {
  const float speed=std::min(98.f, std::sqrt(_vx*_vx+_vy*_vy)+1.f);
  float offset=Clamp((_x-_paddle)/PaddleHalfWidth(), -1.f, 1.f);
  // Avoid a permanent vertical bounce and cap shallow angles.
  if (std::fabs(offset)<0.18f) { offset=(_vx<0 ? -0.18f : 0.18f); }
  _vx = speed*offset*0.8f;
  _vy = -std::sqrt(speed*speed-_vx*_vx);
}
unsigned BrickBreakerGame::Step(float target) {
  if (_phase==Phase::Finished) { return None; }
  if (++_ticks >= 90*120) { _phase=Phase::Finished; return None; }
  if (_flashTicks>0) { --_flashTicks; }
  if (!std::isfinite(target)) { target=_paddle; }
  const float half=PaddleHalfWidth();
  target=Clamp(target, 2.f+half, _width-2.f-half);
  _paddle += Clamp(target-_paddle, -105.f*StepSeconds(), 105.f*StepSeconds());
  _paddle=Clamp(_paddle, 2.f+half, _width-2.f-half);
  if (_phase!=Phase::Playing) {
    if (_phase==Phase::Serving) { _x=_paddle; _y=PaddleY()-Radius-1.f; }
    if (--_phaseTicks>0) { return None; }
    if (_phase==Phase::Serving) { _phase=Phase::Playing; }
    else if (_phase==Phase::LifeLost) { Serve(); return None; }
    else if (_phase==Phase::LevelCleared) { ++_level; NewLayout(); Serve(); return None; }
  }
  ++_rallyTicks;
  unsigned events=None;
  const float oldX=_x, oldY=_y;
  _x+=_vx*StepSeconds(); _y+=_vy*StepSeconds();
  if (_x<2.f+Radius) { _x=2.f+Radius; _vx=std::fabs(_vx); }
  if (_x>_width-2.f-Radius) { _x=_width-2.f-Radius; _vx=-std::fabs(_vx); }
  if (_y<Top+Radius) { _y=Top+Radius; _vy=std::fabs(_vy); }
  // Fixed timestep keeps displacement below one pixel at maximum speed.
  // Reflect on the entry axis; at a corner choose the smallest penetration.
  for (auto& b : _bricks) {
    if (!b.alive || _x+Radius<=b.x || _x-Radius>=b.x+b.w ||
        _y+Radius<=b.y || _y-Radius>=b.y+b.h) { continue; }
    const bool fromX = oldX+Radius<=b.x || oldX-Radius>=b.x+b.w;
    const bool fromY = oldY+Radius<=b.y || oldY-Radius>=b.y+b.h;
    const float px=std::min(_x+Radius-b.x, b.x+b.w-(_x-Radius));
    const float py=std::min(_y+Radius-b.y, b.y+b.h-(_y-Radius));
    if ((fromX && !fromY) || (fromX==fromY && px<py)) {
      _x=(_vx>0 ? b.x-Radius : b.x+b.w+Radius); _vx=-_vx;
    } else {
      _y=(_vy>0 ? b.y-Radius : b.y+b.h+Radius); _vy=-_vy;
    }
    b.alive=false; _score+=10*_level; _rallyTicks=0;
    _flashX=b.x+b.w/2; _flashY=b.y+b.h/2; _flashTicks=15;
    events |= BrickHit;
    break; // one collision per substep; never cancel two reflections at a seam
  }
  if (_vy>0 && oldY+Radius<=PaddleY() && _y+Radius>=PaddleY() &&
      _x+Radius>=_paddle-half && _x-Radius<=_paddle+half) {
    _y=PaddleY()-Radius; BounceFromPaddle(); events |= PaddleHit;
  }
  if (_y-Radius>_height) {
    --_lives; events |= Miss;
    _phase=(_lives==0 ? Phase::Finished : Phase::LifeLost); _phaseTicks=90;
    return events;
  }
  bool remaining=false;
  for (const auto& b : _bricks) { remaining |= b.alive; }
  if (!remaining) {
    events |= Clear;
    if (_level==3) { _phase=Phase::Finished; _won=true; }
    else { _phase=Phase::LevelCleared; _phaseTicks=120; }
  } else if (_rallyTicks>120*8) {
    // Stale rallies get a small horizontal nudge, not an endless orbit.
    _vx=(_vx<0 ? -1.f : 1.f)*(18.f+Random()%18);
    const float speed=70.f+_level*5.f;
    _vy=(_vy<0 ? -1.f : 1.f)*std::sqrt(speed*speed-_vx*_vx);
    _rallyTicks=0;
  }
  return events;
}
bool BrickBreakerGame::Render(uint8_t* p, std::size_t size) const {
  const std::size_t needed=static_cast<std::size_t>(_width)*_height;
  if (p==nullptr || size<needed) { return false; }
  std::fill(p,p+needed,0);
  auto rect=[&](int x,int y,int w,int h,uint8_t c) {
    for(int j=std::max(0,y);j<std::min(_height,y+h);++j) {
      for(int i=std::max(0,x);i<std::min(_width,x+w);++i) { p[j*_width+i]=c; }
    }
  };
  auto text=[&](int x,int y,const char* s,int scale) {
    for(;*s;++s,x+=4*scale) {
      const char* glyph=Glyph(*s);
      for(int k=0;k<15;++k) if(glyph[k]=='1') {
        rect(x+(k%3)*scale,y+(k/3)*scale,scale,scale,255);
      }
    }
  };
  auto number=[&](int x,int y,int n,int scale) {
    char buf[5] = {'0','0','0','0',0};
    n=std::max(0,std::min(9999,n));
    for(int i=3;i>=0;--i) { buf[i]=static_cast<char>('0'+n%10); n/=10; }
    text(x,y,buf,scale);
  };
  number(4,2,_score,2);
  const char levelText[]={'L',static_cast<char>('0'+_level),0};
  text(_width/2-7,2,levelText,2);
  for(int i=0;i<3;++i) {
    const int x=_width-29+i*9;
    rect(x,4,6,6,i<_lives ? 255 : 45);
  }
  rect(0,Top-2,_width,2,110); rect(0,Top,2,_height-Top,110);
  rect(_width-2,Top,2,_height-Top,110);
  if (_phase==Phase::Finished) {
    text((_width-(( _won ? 7 : 4)*8-2))/2, _height/2-16,
         _won ? "YOU WIN" : "OVER",2);
    number((_width-46)/2,_height/2+2,_score,3);
    return true;
  }
  for(const auto& b:_bricks) if(b.alive) {
    rect(b.x,b.y,b.w,b.h,165); rect(b.x,b.y,b.w,2,255);
  }
  if(_flashTicks>0) {
    rect(_flashX-5,_flashY,11,1,255); rect(_flashX,_flashY-4,1,9,255);
  }
  rect(static_cast<int>(_paddle-PaddleHalfWidth()),static_cast<int>(PaddleY()),
       static_cast<int>(2*PaddleHalfWidth()),4,255);
  if(_phase==Phase::Playing || _phase==Phase::Serving) {
    // Short dim trail plus a 4x4 white ball, legible at native resolution.
    if(_phase==Phase::Playing) {
      rect(static_cast<int>(_x-_vx*0.04f)-1,static_cast<int>(_y-_vy*0.04f)-1,2,2,80);
    }
    rect(static_cast<int>(_x)-2,static_cast<int>(_y)-2,4,4,255);
  }
  if(_phase==Phase::Serving && _phaseTicks>30) { text(_width/2-15,_height-27,"SERV",2); }
  if(_phase==Phase::LifeLost) { text(_width/2-15,_height-27,"LOST",2); }
  if(_phase==Phase::LevelCleared) { text(_width/2-27,_height-27,"LEVEL",2); }
  return true;
}
}
}
