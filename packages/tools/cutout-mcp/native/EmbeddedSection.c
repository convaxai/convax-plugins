#include "EmbeddedSection.h"

#include <mach-o/getsect.h>
#include <mach-o/loader.h>
#include <unistd.h>
#include <zlib.h>

extern const struct mach_header_64 _mh_execute_header;

static const uint8_t *section(const char *name, size_t *size) {
  unsigned long section_size = 0;
  uint8_t *bytes = getsectiondata(&_mh_execute_header, "__DATA", name, &section_size);
  if (size != NULL) {
    *size = (size_t)section_size;
  }
  return bytes;
}

const uint8_t *convax_cutout_helper(size_t *size) { return section("__helper", size); }
const uint8_t *convax_cutout_helper_sha256(size_t *size) { return section("__helphash", size); }
const uint8_t *convax_cutout_helper_size(size_t *size) { return section("__helpsize", size); }
const uint8_t *convax_cutout_model(size_t *size) { return section("__model", size); }
const uint8_t *convax_cutout_model_sha256(size_t *size) { return section("__modelhash", size); }
const uint8_t *convax_cutout_model_size(size_t *size) { return section("__modelsize", size); }
const uint8_t *convax_cutout_ort(size_t *size) { return section("__ortlib", size); }
const uint8_t *convax_cutout_ort_sha256(size_t *size) { return section("__orthash", size); }
const uint8_t *convax_cutout_ort_size(size_t *size) { return section("__ortsize", size); }

int convax_cutout_inflate_gzip_to_fd(
  const uint8_t *compressed,
  size_t compressed_size,
  int output_fd,
  size_t expected_size
) {
  if (compressed == NULL || compressed_size == 0 || expected_size == 0) {
    return -1;
  }
  z_stream stream = {0};
  if (inflateInit2(&stream, 16 + MAX_WBITS) != Z_OK) {
    return -2;
  }
  stream.next_in = (Bytef *)compressed;
  stream.avail_in = (uInt)compressed_size;
  uint8_t output[64 * 1024];
  size_t total = 0;
  int result = Z_OK;
  while (result == Z_OK) {
    stream.next_out = output;
    stream.avail_out = sizeof(output);
    result = inflate(&stream, Z_NO_FLUSH);
    size_t produced = sizeof(output) - stream.avail_out;
    size_t offset = 0;
    while (offset < produced) {
      ssize_t written = write(output_fd, output + offset, produced - offset);
      if (written <= 0) {
        inflateEnd(&stream);
        return -3;
      }
      offset += (size_t)written;
    }
    total += produced;
    if (total > expected_size) {
      inflateEnd(&stream);
      return -4;
    }
  }
  inflateEnd(&stream);
  return result == Z_STREAM_END && total == expected_size ? 0 : -5;
}
