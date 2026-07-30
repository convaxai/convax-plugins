#include <CoreFoundation/CoreFoundation.h>
#include <CoreGraphics/CoreGraphics.h>
#include <ImageIO/ImageIO.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <limits>
#include <memory>
#include <stdexcept>
#include <string>
#include <type_traits>
#include <vector>

#include "onnxruntime_cxx_api.h"

namespace {

constexpr size_t kModelSize = 320;
constexpr size_t kMaximumPixels = 40ULL * 1024ULL * 1024ULL;

struct CFReleaseDeleter {
  void operator()(const void *value) const {
    if (value != nullptr) CFRelease(value);
  }
};

template <typename T>
using CFPointer = std::unique_ptr<std::remove_pointer_t<T>, CFReleaseDeleter>;

struct Image {
  size_t width;
  size_t height;
  std::vector<uint8_t> rgba;
};

struct Letterbox {
  size_t height;
  size_t left;
  size_t top;
  size_t width;
};

CFURLRef fileURL(const char *path) {
  return CFURLCreateFromFileSystemRepresentation(
    kCFAllocatorDefault,
    reinterpret_cast<const UInt8 *>(path),
    std::strlen(path),
    false
  );
}

size_t imagePropertyDimension(CGImageSourceRef source, CFStringRef key) {
  CFPointer<CFDictionaryRef> properties(CGImageSourceCopyPropertiesAtIndex(source, 0, nullptr));
  if (!properties) return 0;
  auto value = static_cast<CFNumberRef>(CFDictionaryGetValue(properties.get(), key));
  long long dimension = 0;
  return value && CFNumberGetValue(value, kCFNumberLongLongType, &dimension) && dimension > 0
    ? static_cast<size_t>(dimension)
    : 0;
}

Image loadImage(const char *path) {
  CFPointer<CFURLRef> url(fileURL(path));
  if (!url) throw std::runtime_error("input URL");
  CFPointer<CGImageSourceRef> source(CGImageSourceCreateWithURL(url.get(), nullptr));
  if (!source || CGImageSourceGetCount(source.get()) != 1) throw std::runtime_error("input decode");
  const size_t encodedWidth = imagePropertyDimension(source.get(), kCGImagePropertyPixelWidth);
  const size_t encodedHeight = imagePropertyDimension(source.get(), kCGImagePropertyPixelHeight);
  const size_t maximumDimension = std::max(encodedWidth, encodedHeight);
  if (
    encodedWidth == 0 ||
    encodedHeight == 0 ||
    maximumDimension > 16384 ||
    encodedWidth > kMaximumPixels / encodedHeight
  ) {
    throw std::runtime_error("input dimensions");
  }
  long long thumbnailSize = static_cast<long long>(maximumDimension);
  CFPointer<CFNumberRef> thumbnailSizeValue(
    CFNumberCreate(kCFAllocatorDefault, kCFNumberLongLongType, &thumbnailSize)
  );
  const void *keys[] = {
    kCGImageSourceCreateThumbnailFromImageAlways,
    kCGImageSourceCreateThumbnailWithTransform,
    kCGImageSourceShouldCacheImmediately,
    kCGImageSourceThumbnailMaxPixelSize,
  };
  const void *values[] = {
    kCFBooleanTrue,
    kCFBooleanTrue,
    kCFBooleanTrue,
    thumbnailSizeValue.get(),
  };
  CFPointer<CFDictionaryRef> options(CFDictionaryCreate(
    kCFAllocatorDefault,
    keys,
    values,
    4,
    &kCFTypeDictionaryKeyCallBacks,
    &kCFTypeDictionaryValueCallBacks
  ));
  CFPointer<CGImageRef> image(CGImageSourceCreateThumbnailAtIndex(source.get(), 0, options.get()));
  if (!image) throw std::runtime_error("input frame");
  const size_t width = CGImageGetWidth(image.get());
  const size_t height = CGImageGetHeight(image.get());
  if (width == 0 || height == 0 || width > kMaximumPixels / height) {
    throw std::runtime_error("oriented dimensions");
  }
  std::vector<uint8_t> pixels(width * height * 4);
  CFPointer<CGColorSpaceRef> colorSpace(CGColorSpaceCreateWithName(kCGColorSpaceSRGB));
  if (!colorSpace) throw std::runtime_error("color space");
  CFPointer<CGContextRef> context(CGBitmapContextCreate(
    pixels.data(),
    width,
    height,
    8,
    width * 4,
    colorSpace.get(),
    kCGBitmapByteOrder32Big | kCGImageAlphaPremultipliedLast
  ));
  if (!context) throw std::runtime_error("input context");
  CGContextSetBlendMode(context.get(), kCGBlendModeCopy);
  CGContextDrawImage(context.get(), CGRectMake(0, 0, width, height), image.get());
  return {width, height, std::move(pixels)};
}

Letterbox letterboxFor(const Image &image) {
  const double scale = std::min(
    static_cast<double>(kModelSize) / static_cast<double>(image.width),
    static_cast<double>(kModelSize) / static_cast<double>(image.height)
  );
  const size_t width = std::max<size_t>(1, std::llround(static_cast<double>(image.width) * scale));
  const size_t height = std::max<size_t>(1, std::llround(static_cast<double>(image.height) * scale));
  return {
    height,
    (kModelSize - width) / 2,
    (kModelSize - height) / 2,
    width,
  };
}

std::vector<uint8_t> letterboxedRGBA(const Image &image, const Letterbox &letterbox) {
  CFPointer<CGColorSpaceRef> colorSpace(CGColorSpaceCreateWithName(kCGColorSpaceSRGB));
  CFPointer<CGDataProviderRef> provider(CGDataProviderCreateWithData(
    nullptr,
    image.rgba.data(),
    image.rgba.size(),
    nullptr
  ));
  if (!colorSpace || !provider) throw std::runtime_error("resize source");
  CFPointer<CGImageRef> source(CGImageCreate(
    image.width,
    image.height,
    8,
    32,
    image.width * 4,
    colorSpace.get(),
    kCGBitmapByteOrder32Big | kCGImageAlphaPremultipliedLast,
    provider.get(),
    nullptr,
    false,
    kCGRenderingIntentDefault
  ));
  std::vector<uint8_t> output(kModelSize * kModelSize * 4);
  CFPointer<CGContextRef> context(CGBitmapContextCreate(
    output.data(),
    kModelSize,
    kModelSize,
    8,
    kModelSize * 4,
    colorSpace.get(),
    kCGBitmapByteOrder32Big | kCGImageAlphaPremultipliedLast
  ));
  if (!source || !context) throw std::runtime_error("resize context");
  CGContextSetRGBFillColor(context.get(), 0, 0, 0, 1);
  CGContextFillRect(context.get(), CGRectMake(0, 0, kModelSize, kModelSize));
  CGContextSetInterpolationQuality(context.get(), kCGInterpolationHigh);
  CGContextSetBlendMode(context.get(), kCGBlendModeCopy);
  CGContextDrawImage(
    context.get(),
    CGRectMake(letterbox.left, letterbox.top, letterbox.width, letterbox.height),
    source.get()
  );
  return output;
}

std::vector<float> prepareInput(const Image &image, const Letterbox &letterbox) {
  const auto pixels = letterboxedRGBA(image, letterbox);
  std::vector<float> tensor(3 * kModelSize * kModelSize);
  constexpr float means[3] = {0.485f, 0.456f, 0.406f};
  constexpr float deviations[3] = {0.229f, 0.224f, 0.225f};
  const size_t plane = kModelSize * kModelSize;
  for (size_t index = 0; index < plane; ++index) {
    const float alpha = static_cast<float>(pixels[index * 4 + 3]) / 255.0f;
    for (size_t channel = 0; channel < 3; ++channel) {
      const float premultiplied = static_cast<float>(pixels[index * 4 + channel]) / 255.0f;
      const float value = alpha > 0.0f ? std::clamp(premultiplied / alpha, 0.0f, 1.0f) : 0.0f;
      tensor[channel * plane + index] = (value - means[channel]) / deviations[channel];
    }
  }
  return tensor;
}

std::vector<float> infer(const char *modelPath, std::vector<float> &input) {
  Ort::Env environment(ORT_LOGGING_LEVEL_ERROR, "convax-cutout");
  Ort::SessionOptions options;
  options.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);
  Ort::Session session(environment, modelPath, options);
  const std::array<int64_t, 4> shape = {1, 3, 320, 320};
  auto memory = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
  auto value = Ort::Value::CreateTensor<float>(
    memory,
    input.data(),
    input.size(),
    shape.data(),
    shape.size()
  );
  const char *inputNames[] = {"input.1"};
  const char *outputNames[] = {"1959"};
  auto outputs = session.Run(Ort::RunOptions{nullptr}, inputNames, &value, 1, outputNames, 1);
  if (outputs.size() != 1 || !outputs[0].IsTensor()) throw std::runtime_error("model output");
  const auto info = outputs[0].GetTensorTypeAndShapeInfo();
  if (info.GetElementCount() != kModelSize * kModelSize) throw std::runtime_error("model dimensions");
  const float *values = outputs[0].GetTensorData<float>();
  float minimum = std::numeric_limits<float>::infinity();
  float maximum = -std::numeric_limits<float>::infinity();
  for (size_t index = 0; index < kModelSize * kModelSize; ++index) {
    minimum = std::min(minimum, values[index]);
    maximum = std::max(maximum, values[index]);
  }
  const float range = std::max(maximum - minimum, 1e-5f);
  std::vector<float> mask(kModelSize * kModelSize);
  for (size_t index = 0; index < mask.size(); ++index) {
    mask[index] = std::clamp((values[index] - minimum) / range, 0.0f, 1.0f);
  }
  return mask;
}

float sampleMask(const std::vector<float> &mask, float x, float y) {
  const float clampedX = std::clamp(x, 0.0f, static_cast<float>(kModelSize - 1));
  const float clampedY = std::clamp(y, 0.0f, static_cast<float>(kModelSize - 1));
  const size_t x0 = static_cast<size_t>(std::floor(clampedX));
  const size_t y0 = static_cast<size_t>(std::floor(clampedY));
  const size_t x1 = std::min(x0 + 1, kModelSize - 1);
  const size_t y1 = std::min(y0 + 1, kModelSize - 1);
  const float tx = clampedX - static_cast<float>(x0);
  const float ty = clampedY - static_cast<float>(y0);
  const float top = mask[y0 * kModelSize + x0] * (1.0f - tx) + mask[y0 * kModelSize + x1] * tx;
  const float bottom = mask[y1 * kModelSize + x0] * (1.0f - tx) + mask[y1 * kModelSize + x1] * tx;
  return top * (1.0f - ty) + bottom * ty;
}

float softenMask(float value) {
  const float bounded = std::clamp((std::clamp(value, 0.0f, 1.0f) - 0.12f) / 0.66f, 0.0f, 1.0f);
  return bounded * bounded * (3.0f - 2.0f * bounded);
}

void applyMask(Image &image, const std::vector<float> &mask, const Letterbox &letterbox) {
  for (size_t y = 0; y < image.height; ++y) {
    const float sourceY =
      static_cast<float>(letterbox.top) +
      (static_cast<float>(y) + 0.5f) * static_cast<float>(letterbox.height) /
        static_cast<float>(image.height) -
      0.5f;
    for (size_t x = 0; x < image.width; ++x) {
      const float sourceX =
        static_cast<float>(letterbox.left) +
        (static_cast<float>(x) + 0.5f) * static_cast<float>(letterbox.width) /
          static_cast<float>(image.width) -
        0.5f;
      const size_t offset = (y * image.width + x) * 4;
      const float matte = softenMask(sampleMask(mask, sourceX, sourceY));
      const float originalAlpha = static_cast<float>(image.rgba[offset + 3]) / 255.0f;
      for (size_t channel = 0; channel < 3; ++channel) {
        image.rgba[offset + channel] = static_cast<uint8_t>(
          std::clamp(std::lround(static_cast<float>(image.rgba[offset + channel]) * matte), 0L, 255L)
        );
      }
      image.rgba[offset + 3] = static_cast<uint8_t>(std::lround(originalAlpha * matte * 255.0f));
    }
  }
}

void writePNG(const Image &image, const char *path) {
  CFPointer<CGColorSpaceRef> colorSpace(CGColorSpaceCreateWithName(kCGColorSpaceSRGB));
  CFPointer<CGDataProviderRef> provider(CGDataProviderCreateWithData(
    nullptr,
    image.rgba.data(),
    image.rgba.size(),
    nullptr
  ));
  if (!colorSpace || !provider) throw std::runtime_error("output source");
  CFPointer<CGImageRef> cgImage(CGImageCreate(
    image.width,
    image.height,
    8,
    32,
    image.width * 4,
    colorSpace.get(),
    kCGBitmapByteOrder32Big | kCGImageAlphaPremultipliedLast,
    provider.get(),
    nullptr,
    false,
    kCGRenderingIntentDefault
  ));
  CFPointer<CFURLRef> url(fileURL(path));
  CFPointer<CGImageDestinationRef> destination(CGImageDestinationCreateWithURL(
    url.get(),
    CFSTR("public.png"),
    1,
    nullptr
  ));
  if (!cgImage || !url || !destination) throw std::runtime_error("output destination");
  CGImageDestinationAddImage(destination.get(), cgImage.get(), nullptr);
  if (!CGImageDestinationFinalize(destination.get())) throw std::runtime_error("output encode");
}

}  // namespace

int main(int argc, char **argv) {
  if (argc != 4) return 64;
  try {
    Image image = loadImage(argv[1]);
    const Letterbox letterbox = letterboxFor(image);
    auto input = prepareInput(image, letterbox);
    const auto mask = infer(argv[3], input);
    applyMask(image, mask, letterbox);
    writePNG(image, argv[2]);
    return 0;
  } catch (const std::exception &error) {
    std::fprintf(stderr, "Cutout inference failed: %s\n", error.what());
    return 70;
  } catch (...) {
    std::fprintf(stderr, "Cutout inference failed: unknown native error\n");
    return 70;
  }
}
