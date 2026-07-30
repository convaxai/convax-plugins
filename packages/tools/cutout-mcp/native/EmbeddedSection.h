#ifndef CONVAX_CUTOUT_EMBEDDED_SECTION_H
#define CONVAX_CUTOUT_EMBEDDED_SECTION_H

#include <stddef.h>
#include <stdint.h>

const uint8_t *convax_cutout_helper(size_t *size);
const uint8_t *convax_cutout_helper_sha256(size_t *size);
const uint8_t *convax_cutout_helper_size(size_t *size);
const uint8_t *convax_cutout_model(size_t *size);
const uint8_t *convax_cutout_model_sha256(size_t *size);
const uint8_t *convax_cutout_model_size(size_t *size);
const uint8_t *convax_cutout_ort(size_t *size);
const uint8_t *convax_cutout_ort_sha256(size_t *size);
const uint8_t *convax_cutout_ort_size(size_t *size);

int convax_cutout_inflate_gzip_to_fd(
  const uint8_t *compressed,
  size_t compressed_size,
  int output_fd,
  size_t expected_size
);

#endif
