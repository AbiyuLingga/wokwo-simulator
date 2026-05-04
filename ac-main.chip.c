#include "wokwi-api.h"

void chip_init(void) {
  pin_init("L", OUTPUT_HIGH);
  pin_init("N", OUTPUT_LOW);
}
