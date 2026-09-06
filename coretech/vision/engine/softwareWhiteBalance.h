/**
 * File: softwareWhiteBalance.h
 *
 * Description: Saturating R/G/B multiply on ImageRGB after debayer.
 *              Default disabled with gains 1,1,1 (no-op).
 *
 * Copyright: Anki, Inc. 2019
 **/

#ifndef __Anki_Vision_SoftwareWhiteBalance_H__
#define __Anki_Vision_SoftwareWhiteBalance_H__

#include "coretech/common/shared/types.h"

namespace Anki {
namespace Vision {

class ImageRGB;

class SoftwareWhiteBalance
{
public:
  static void SetEnabled(bool enabled);
  static bool IsEnabled();

  static void SetGains(f32 r, f32 g, f32 b);
  static void GetGains(f32& r, f32& g, f32& b);

  // Saturating channel multiply. No-op if disabled or all gains ~1.
  static void ApplyToImage(ImageRGB& rgb);
};

} // namespace Vision
} // namespace Anki

#endif // __Anki_Vision_SoftwareWhiteBalance_H__
