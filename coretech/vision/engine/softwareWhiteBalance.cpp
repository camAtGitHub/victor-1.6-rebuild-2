/**
 * File: softwareWhiteBalance.cpp
 *
 * Description: Saturating R/G/B multiply on ImageRGB after debayer.
 *
 * Copyright: Anki, Inc. 2019
 **/

#include "coretech/vision/engine/softwareWhiteBalance.h"

#include "coretech/common/shared/array2d_impl.h"
#include "coretech/vision/engine/image.h"

#include "util/math/math.h"

#include "opencv2/core.hpp"

#include <mutex>

namespace Anki {
namespace Vision {

namespace {
  std::mutex s_mutex;
  bool s_enabled = false;
  f32  s_gainR = 1.f;
  f32  s_gainG = 1.f;
  f32  s_gainB = 1.f;
  int  s_identityDepth = 0;
}

void SoftwareWhiteBalance::SetEnabled(bool enabled)
{
  std::lock_guard<std::mutex> lock(s_mutex);
  s_enabled = enabled;
}

bool SoftwareWhiteBalance::IsEnabled()
{
  std::lock_guard<std::mutex> lock(s_mutex);
  return s_enabled;
}

void SoftwareWhiteBalance::SetGains(f32 r, f32 g, f32 b)
{
  std::lock_guard<std::mutex> lock(s_mutex);
  s_gainR = r;
  s_gainG = g;
  s_gainB = b;
}

void SoftwareWhiteBalance::GetGains(f32& r, f32& g, f32& b)
{
  std::lock_guard<std::mutex> lock(s_mutex);
  r = s_gainR;
  g = s_gainG;
  b = s_gainB;
}

SoftwareWhiteBalance::ScopedIdentity::ScopedIdentity()
{
  std::lock_guard<std::mutex> lock(s_mutex);
  ++s_identityDepth;
}

SoftwareWhiteBalance::ScopedIdentity::~ScopedIdentity()
{
  std::lock_guard<std::mutex> lock(s_mutex);
  if(s_identityDepth > 0) {
    --s_identityDepth;
  }
}

void SoftwareWhiteBalance::ApplyToImage(ImageRGB& rgb)
{
  f32 gainR = 1.f;
  f32 gainG = 1.f;
  f32 gainB = 1.f;
  {
    std::lock_guard<std::mutex> lock(s_mutex);
    if(s_identityDepth > 0 ||
       !s_enabled ||
       (Util::IsFltNear(s_gainR, 1.f) &&
        Util::IsFltNear(s_gainG, 1.f) &&
        Util::IsFltNear(s_gainB, 1.f)))
    {
      return;
    }
    gainR = s_gainR;
    gainG = s_gainG;
    gainB = s_gainB;
  }

  s32 nrows = rgb.GetNumRows();
  s32 ncols = rgb.GetNumCols();
  if(rgb.IsContinuous()) {
    ncols *= nrows;
    nrows = 1;
  }
  for(s32 i=0; i<nrows; ++i)
  {
    Vision::PixelRGB* img_i = rgb.GetRow(i);
    for(s32 j=0; j<ncols; ++j)
    {
      Vision::PixelRGB& pix = img_i[j];
      pix.r() = cv::saturate_cast<u8>(pix.r() * gainR);
      pix.g() = cv::saturate_cast<u8>(pix.g() * gainG);
      pix.b() = cv::saturate_cast<u8>(pix.b() * gainB);
    }
  }
}

} // namespace Vision
} // namespace Anki
