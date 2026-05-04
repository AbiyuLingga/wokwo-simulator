#include "wokwi-api.h"

void chip_init(void) {
  pin_init("L", INPUT_PULLDOWN);
  pin_init("N", INPUT_PULLDOWN);
}
